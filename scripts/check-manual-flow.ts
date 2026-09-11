/**
 * Ověření ručního zápisu běhu se screenshotem proti testovací databázi.
 *
 *   npm run check:manual-flow:test
 *
 * Volá stejnou funkci jako server action (recordManualResult), takže testuje
 * skutečné uložení výsledku i screenshotu a to, že se běh nezapočítá, dokud
 * ho neověří moderátor. Na Raider.io nesahá.
 *
 * Potřebuje tým ze 'npm run seed:run-team:test'. Skript po sobě uklidí.
 */

import { PrismaClient } from "@prisma/client";
import { RecordResultError, recordManualResult } from "../src/lib/record-result";
import { recomputeOfficialResult } from "../src/lib/match-official";
import { ABANDONED_REASON, isAwaitingVerification } from "../src/lib/manual-result";
import { parseScoringConfig } from "../src/lib/scoring";

const prisma = new PrismaClient();

/** Dungeon, který si kontrola založí a po sobě smaže. */
const CHECK_DUNGEON = "Kontrolní dungeon (check-manual-flow)";

/** Nejmenší platné PNG (1 × 1 px) - stačí na kontrolu uložení. */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )
);

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function assertTestDatabase() {
  const database = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] ?? "";
  if (!database.includes("test")) {
    console.error(`Databáze "${database}" nevypadá jako testovací.`);
    process.exit(1);
  }
}

async function expectError(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (err) {
    return err instanceof RecordResultError ? err.message : `jiná chyba: ${String(err)}`;
  }
}

async function main() {
  assertTestDatabase();

  const team = await prisma.team.findFirst({
    where: { name: "Testovací tým (z Raider.io)" },
    include: { members: true, season: true },
  });

  if (!team) {
    console.error("Chybí testovací tým - spusť 'npm run seed:run-team:test'.");
    process.exit(1);
  }

  // Vlastní dungeon s pevným limitem - kontrola tak nezávisí na tom, jestli má
  // testovací sezóna doplněné časy z Raider.io. Na konci se smaže; zbytek po
  // spadlém běhu se smaže tady.
  await prisma.seasonDungeon.deleteMany({
    where: { seasonId: team.seasonId, dungeonName: CHECK_DUNGEON },
  });
  const dungeon = await prisma.seasonDungeon.create({
    data: {
      seasonId: team.seasonId,
      dungeonName: CHECK_DUNGEON,
      abbreviation: "CHKMF",
      timeLimitSeconds: 30 * 60,
      isActive: true,
    },
  });

  const actor = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const config = parseScoringConfig(team.season.scoringConfig);
  const keyLevel = config.minScoredKeyLevel + 2;

  // Čistý zápas jen pro tuhle kontrolu.
  await prisma.matchResult.deleteMany({ where: { match: { teamId: team.id } } });
  await prisma.match.deleteMany({ where: { teamId: team.id } });

  const match = await prisma.match.create({
    data: {
      teamId: team.id,
      proposedById: team.members[0].characterId,
      windowStart: new Date("2026-08-25T16:00:00.000Z"),
      windowEnd: new Date("2026-08-25T18:00:00.000Z"),
      status: "CONFIRMED",
    },
  });

  const record = (overrides: Partial<Parameters<typeof recordManualResult>[1]> = {}) =>
    recordManualResult(prisma, {
      matchId: match.id,
      actorId: actor.id,
      requireTeamId: team.id,
      dungeonName: dungeon.dungeonName,
      keyLevel,
      clearTimeSeconds: dungeon.timeLimitSeconds! - 60,
      completedAt: new Date("2026-08-25T17:00:00.000Z"),
      screenshot: { bytes: PNG_1X1, mimeType: "image/png" },
      abandoned: false,
      ...overrides,
    });

  console.log("1. Zápis stihnutého běhu");
  const ok = await record();
  check(ok.evaluation.valid, "podle údajů je v pořádku", ok.evaluation.reasons.join(" | "));

  const stored = await prisma.matchResult.findUniqueOrThrow({
    where: { id: ok.resultId },
    include: { screenshot: true },
  });
  check(stored.source === "SCREENSHOT", "zdroj je screenshot", stored.source);
  check(!stored.isValid, "uloží se jako zatím neplatný");
  check(!stored.isOfficial, "a nepočítá se");
  check(isAwaitingVerification(stored), "čeká na ověření");
  check(stored.points !== null, "body jsou spočítané dopředu", String(stored.points));
  check(stored.screenshot?.mimeType === "image/png", "screenshot má typ PNG");
  check(stored.screenshot?.sizeBytes === PNG_1X1.length, "a správnou velikost");
  check(
    stored.screenshot !== null && Buffer.compare(Buffer.from(stored.screenshot.data), Buffer.from(PNG_1X1)) === 0,
    "obsah screenshotu sedí bajt po bajtu"
  );

  console.log("2. Dungeon mimo nabídku");
  {
    const error = await expectError(() => record({ dungeonName: "Neexistující dungeon" }));
    check(error?.includes("aktivních dungeonů") ?? false, "odmítne se", error ?? "prošel!");
  }

  console.log("3. Běh mimo okno zápasu");
  const outside = await record({ completedAt: new Date("2026-08-26T17:00:00.000Z") });
  {
    check(!outside.evaluation.valid, "podle údajů se nepočítá");
    check(
      outside.evaluation.reasons.some((r) => r.includes("po 23:59 dne termínu")),
      "a řekne proč",
      outside.evaluation.reasons.join(" | ")
    );
    const row = await prisma.matchResult.findUniqueOrThrow({ where: { id: outside.resultId } });
    check(row.invalidReason !== null, "důvod je uložený pro moderátora");
    check(!row.countsTowardTimeLimit, "běh mimo termín herní čas nečerpá");
    check(!row.overTimeLimit, "a nemůže být přes limit");
    check(isAwaitingVerification(row), "i tak čeká na rozhodnutí moderátora");
  }

  console.log("4. Moderátor běh uzná");
  {
    // Totéž, co dělá setResultValidity v administraci.
    await prisma.matchResult.update({
      where: { id: ok.resultId },
      data: { isValid: true, invalidReason: null, verifiedById: actor.id },
    });
    await recomputeOfficialResult(prisma, match.id);

    const verified = await prisma.matchResult.findUniqueOrThrow({ where: { id: ok.resultId } });
    check(verified.isOfficial, "uznaný běh se počítá");
    check(!isAwaitingVerification(verified), "a už nečeká");

    const other = await prisma.matchResult.findUniqueOrThrow({ where: { id: outside.resultId } });
    check(!other.isOfficial, "neověřený běh se dál nepočítá");
  }

  console.log("5. Smazání výsledku smaže i screenshot");
  {
    await prisma.matchResult.delete({ where: { id: outside.resultId } });
    const left = await prisma.resultScreenshot.count({ where: { resultId: outside.resultId } });
    check(left === 0, "screenshot po smazaném výsledku nezůstane", String(left));
  }

  console.log("6. Uzavřený zápas ruční běh nepřijme");
  {
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });
    const error = await expectError(() => record());
    check(error?.includes("uzavřený") ?? false, "odmítne se", error ?? "prošel!");
  }

  console.log("7. Cizí tým");
  {
    await prisma.match.update({ where: { id: match.id }, data: { status: "CONFIRMED" } });
    const error = await expectError(() => record({ requireTeamId: "jiny-tym" }));
    check(error?.includes("nepatří") ?? false, "zápas cizího týmu se odmítne", error ?? "prošel!");
  }

  console.log("8. Vzdaný pokus");
  {
    const abandoned = await record({
      abandoned: true,
      clearTimeSeconds: 10 * 60,
      completedAt: new Date("2026-08-25T17:10:00.000Z"),
    });
    const row = await prisma.matchResult.findUniqueOrThrow({
      where: { id: abandoned.resultId },
      include: { screenshot: true },
    });
    check(row.abandoned, "uloží se jako vzdaný");
    check(!row.isValid && row.points === null, "do bodů se nepočítá a nemá body");
    check(row.invalidReason === ABANDONED_REASON, "s důvodem pro moderátora", String(row.invalidReason));
    check(!isAwaitingVerification(row), "na ověření nečeká");
    check(row.screenshot !== null, "screenshot má taky");
    check(
      row.completedAt?.toISOString() === "2026-08-25T17:10:00.000Z",
      "konec pokusu je uložený",
      row.completedAt?.toISOString()
    );
  }

  console.log("9. Vzdaný pokus vyčerpá herní čas");
  {
    // Zatím: uznaný běh z kroku 4 (29 min) + vzdaný z kroku 8 (10 min).
    // Dlouhý vzdaný pokus, který začal 17:15 UTC, limit přetáhne sám.
    const exhausting = await record({
      abandoned: true,
      clearTimeSeconds: (config.timeBudgetMinutes - 35) * 60,
      completedAt: new Date(
        new Date("2026-08-25T17:15:00.000Z").getTime() + (config.timeBudgetMinutes - 35) * 60_000
      ),
    });
    const exhaustingRow = await prisma.matchResult.findUniqueOrThrow({
      where: { id: exhausting.resultId },
    });
    check(exhaustingRow.countsTowardTimeLimit, "vzdaný pokus v termínu herní čas čerpá");
    check(exhaustingRow.overTimeLimit, "a tenhle ho přetáhl");

    // Lepší běh (o klíč výš) až po vyčerpání limitu - platný, ale přes limit.
    const better = await record({
      keyLevel: keyLevel + 1,
      verifiedById: actor.id,
      completedAt: new Date("2026-08-25T20:00:00.000Z"),
    });
    const betterRow = await prisma.matchResult.findUniqueOrThrow({ where: { id: better.resultId } });
    check(betterRow.isValid && betterRow.overTimeLimit, "lepší běh po vyčerpání je přes herní čas");
    check(!betterRow.isOfficial, "a nepočítá se");

    const stillOk = await prisma.matchResult.findUniqueOrThrow({ where: { id: ok.resultId } });
    check(stillOk.isOfficial && !stillOk.overTimeLimit, "počítá se dál dřívější běh v limitu");

    // Moderátor ho uzná i přes limit - totéž co setTimeLimitOverride.
    await prisma.matchResult.update({
      where: { id: better.resultId },
      data: { timeLimitOverride: true },
    });
    await recomputeOfficialResult(prisma, match.id);
    const allowed = await prisma.matchResult.findUniqueOrThrow({ where: { id: better.resultId } });
    check(allowed.isOfficial, "po uznání přes limit se lepší běh počítá");
  }

  console.log("10. Běh zapsaný moderátorem je rovnou ověřený");
  {
    const byStaff = await record({
      verifiedById: actor.id,
      completedAt: new Date("2026-08-25T17:30:00.000Z"),
    });
    const row = await prisma.matchResult.findUniqueOrThrow({ where: { id: byStaff.resultId } });
    check(row.isValid, "platí rovnou podle automatické kontroly");
    check(row.verifiedById === actor.id, "a je u něj, kdo ho ověřil");
    check(!isAwaitingVerification(row), "na ověření nečeká");
  }

  // Úklid - screenshoty jdou pryč spolu s výsledky (ON DELETE CASCADE).
  await prisma.matchResult.deleteMany({ where: { matchId: match.id } });
  await prisma.match.delete({ where: { id: match.id } });
  await prisma.seasonDungeon.delete({ where: { id: dungeon.id } });

  console.log(
    `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
