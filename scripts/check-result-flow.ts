/**
 * Ověření celého zápisu výsledku proti reálným datům z Raider.io.
 *
 *   npm run check:result-flow:test
 *
 * Volá stejnou funkci jako server action (recordRunResult), takže testuje
 * skutečný průchod včetně uložení do databáze a přepočtu oficiálního běhu.
 * Existuje hlavně proto, že aplikace běžící v sandboxu nemá přístup na
 * Raider.io, kdežto tenhle skript ano.
 *
 * Skript po sobě uklidí - výsledky, které založí, zase smaže.
 */

import { PrismaClient } from "@prisma/client";
import { RecordResultError, recordRunResult } from "../src/lib/record-result";

const prisma = new PrismaClient();

const RUN_URL =
  "https://raider.io/mythic-plus-runs/season-mn-2/3868732-10-the-blinding-vale";

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

async function main() {
  assertTestDatabase();

  const team = await prisma.team.findFirst({
    where: { name: "Testovací tým (z Raider.io)" },
    include: { members: { include: { character: true } } },
  });

  if (!team) {
    console.error("Chybí testovací tým - spusť 'npm run seed:run-team:test'.");
    process.exit(1);
  }

  const actor = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const proposer = team.members[0].characterId;

  // Čistý zápas jen pro tuhle kontrolu.
  await prisma.matchResult.deleteMany({ where: { match: { teamId: team.id } } });
  await prisma.match.deleteMany({ where: { teamId: team.id } });

  const match = await prisma.match.create({
    data: {
      teamId: team.id,
      proposedById: proposer,
      windowStart: new Date("2026-08-25T16:00:00.000Z"),
      windowEnd: new Date("2026-08-25T18:00:00.000Z"),
      status: "CONFIRMED",
    },
  });

  console.log("1. Zápis reálného běhu");
  const out = await recordRunResult(prisma, {
    matchId: match.id,
    runInput: RUN_URL,
    actorId: actor.id,
    requireTeamId: team.id,
  });

  console.log(
    `  ${out.dungeonName} +${out.keyLevel}, čas ${Math.floor(out.clearTimeSeconds / 60)}:${String(out.clearTimeSeconds % 60).padStart(2, "0")}`
  );

  check(out.evaluation.valid, "běh je platný", out.evaluation.reasons.join(" | "));
  check(out.evaluation.outsiders.length === 0, "sestava sedí na tým");
  check(out.evaluation.score.scored, "boduje se");
  if (out.evaluation.score.scored) {
    console.log(`  body: ${out.evaluation.score.points.toFixed(2)}`);
  }

  const ulozeny = await prisma.matchResult.findUniqueOrThrow({
    where: { id: out.resultId },
  });
  check(ulozeny.isValid, "v databázi je platný");
  check(ulozeny.isOfficial, "a rovnou je označený jako oficiální");
  check(ulozeny.points !== null, "má body", String(ulozeny.points));
  check(ulozeny.raiderioRunId === 3868732, "má id běhu", String(ulozeny.raiderioRunId));
  check(ulozeny.rawRaiderioData !== null, "uložila se i původní odpověď");

  console.log("2. Stejný běh podruhé");
  {
    let chyba: string | null = null;
    try {
      await recordRunResult(prisma, {
        matchId: match.id,
        runInput: RUN_URL,
        actorId: actor.id,
        requireTeamId: team.id,
      });
    } catch (err) {
      chyba = err instanceof RecordResultError ? err.message : "jiná chyba";
    }
    check(chyba !== null, "duplicitní běh se odmítne", chyba ?? "prošel!");
    check(
      (await prisma.matchResult.count({ where: { matchId: match.id } })) === 1,
      "a nezaloží se druhý záznam"
    );
  }

  console.log("3. Běh mimo okno zápasu");
  {
    // Okno se posune o den dozadu, takže běh skončí až po jeho konci.
    await prisma.match.update({
      where: { id: match.id },
      data: {
        windowStart: new Date("2026-08-24T16:00:00.000Z"),
        windowEnd: new Date("2026-08-24T18:00:00.000Z"),
      },
    });
    await prisma.matchResult.deleteMany({ where: { matchId: match.id } });

    const mimo = await recordRunResult(prisma, {
      matchId: match.id,
      runInput: RUN_URL,
      actorId: actor.id,
      requireTeamId: team.id,
    });

    check(!mimo.evaluation.valid, "běh mimo okno je neplatný");
    check(
      mimo.evaluation.reasons.some((r) => r.includes("po konci okna")),
      "a řekne proč",
      mimo.evaluation.reasons.join(" | ")
    );

    const zaznam = await prisma.matchResult.findUniqueOrThrow({
      where: { id: mimo.resultId },
    });
    check(!zaznam.isValid, "uloží se jako neplatný");
    check(!zaznam.isOfficial, "a není oficiální");
    check(zaznam.invalidReason !== null, "s vyplněným důvodem");
  }

  console.log("4. Uzavřený zápas výsledky nepřijme");
  {
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });
    let chyba: string | null = null;
    try {
      await recordRunResult(prisma, {
        matchId: match.id,
        runInput: "3868733",
        actorId: actor.id,
        requireTeamId: team.id,
      });
    } catch (err) {
      chyba = err instanceof RecordResultError ? err.message : "jiná chyba";
    }
    check(chyba?.includes("uzavřený") ?? false, "odmítne se", chyba ?? "prošel!");
  }

  console.log("5. Cizí tým");
  {
    await prisma.match.update({ where: { id: match.id }, data: { status: "CONFIRMED" } });
    let chyba: string | null = null;
    try {
      await recordRunResult(prisma, {
        matchId: match.id,
        runInput: RUN_URL,
        actorId: actor.id,
        requireTeamId: "jiny-tym",
      });
    } catch (err) {
      chyba = err instanceof RecordResultError ? err.message : "jiná chyba";
    }
    check(chyba?.includes("nepatří") ?? false, "zápas cizího týmu se odmítne", chyba ?? "prošel!");
  }

  // Úklid.
  await prisma.matchResult.deleteMany({ where: { matchId: match.id } });
  await prisma.match.delete({ where: { id: match.id } });

  console.log(
    `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
