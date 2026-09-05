/**
 * Založí testovací tým ze sestavy konkrétního běhu na Raider.io.
 *
 *   npm run seed:run-team:test -- <odkaz na běh nebo id>
 *
 * Slouží jako odrazový můstek pro práci s výsledky - vznikne tým s reálnými
 * postavami, na které pak sedí i stažení výsledku z Raider.io.
 *
 * Skript se stejně jako seed-test-players brání spuštění nad databází, jejíž
 * název neobsahuje "test" - jde vynutit přepínačem "--force".
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { fetchRunDetails, parseRunUrl } from "../src/lib/raiderio";

const prisma = new PrismaClient();

/** Prefix, podle kterého jdou vygenerovaní hráči poznat a zase smazat. */
const USERNAME_PREFIX = "runteam-";
const TEAM_NAME = process.env.SEED_RUN_TEAM_NAME ?? "Testovací tým (z Raider.io)";
const DEFAULT_RUN =
  "https://raider.io/mythic-plus-runs/season-mn-2/3868732-10-the-blinding-vale";

function assertTestDatabase(force: boolean) {
  const url = process.env.DATABASE_URL ?? "";
  const database = url.split("/").pop()?.split("?")[0] ?? "";

  if (!database.includes("test") && !force) {
    console.error(
      `Databáze "${database}" nevypadá jako testovací.\n` +
        `Spusť skript přes 'npm run seed:run-team:test', nebo vynuť přes '--force', pokud opravdu chceš zakládat testovací tým tady.`
    );
    process.exit(1);
  }

  return database;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const database = assertTestDatabase(force);

  const input = args.find((arg) => arg !== "--force") ?? DEFAULT_RUN;
  const { seasonSlug, runId } = parseRunUrl(input);

  const season = await prisma.season.findFirst({ orderBy: { createdAt: "desc" } });
  if (!season) {
    console.error("Není založená žádná sezóna - spusť nejdřív 'npm run prisma:seed:test'.");
    process.exit(1);
  }

  const slug = seasonSlug ?? season.raiderioSeasonSlug;
  if (!slug) {
    console.error("Chybí slug sezóny - buď v odkazu, nebo u sezóny v databázi.");
    process.exit(1);
  }

  console.log(`Stahuji běh ${runId} ze sezóny ${slug}...`);
  const run = await fetchRunDetails(runId, slug);

  console.log(
    `  ${run.dungeonName} +${run.keyLevel}, čas ${Math.floor(run.clearTimeSeconds / 60)}:` +
      `${String(run.clearTimeSeconds % 60).padStart(2, "0")} z limitu ${Math.floor(run.parTimeSeconds / 60)}:` +
      `${String(run.parTimeSeconds % 60).padStart(2, "0")}, povýšení klíče: ${run.keystoneUpgrades}`
  );

  if (run.roster.length === 0) {
    console.error("Běh nemá sestavu, není z čeho tým založit.");
    process.exit(1);
  }

  // Úklid předchozího běhu skriptu. Pořadí kvůli cizím klíčům.
  const previous = await prisma.user.findMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
    include: { character: true },
  });

  if (previous.length > 0) {
    const characterIds = previous
      .map((u) => u.character?.id)
      .filter((id): id is string => Boolean(id));

    await prisma.matchResult.deleteMany({
      where: { match: { proposedById: { in: characterIds } } },
    });
    await prisma.match.deleteMany({ where: { proposedById: { in: characterIds } } });
    await prisma.teamMembership.deleteMany({ where: { characterId: { in: characterIds } } });
    await prisma.seasonRegistration.deleteMany({ where: { characterId: { in: characterIds } } });
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    await prisma.user.deleteMany({ where: { id: { in: previous.map((u) => u.id) } } });
    console.log(`Smazáno ${previous.length} dřív vygenerovaných hráčů.`);
  }

  await prisma.team.deleteMany({ where: { seasonId: season.id, name: TEAM_NAME } });

  const passwordHash = await bcrypt.hash("test1234", 10);

  const team = await prisma.team.create({
    data: { seasonId: season.id, name: TEAM_NAME },
  });

  for (const [index, member] of run.roster.entries()) {
    const username = `${USERNAME_PREFIX}${member.characterName.toLowerCase()}`;

    const user = await prisma.user.create({
      data: { username, passwordHash, discordNick: `${member.characterName}#0000` },
    });

    const character = await prisma.character.create({
      data: {
        userId: user.id,
        raiderioUrl: `https://raider.io/characters/${member.region}/${member.realm.replace(/[\s']/g, "-")}/${member.characterName}`,
        characterName: member.characterName,
        realm: member.realm,
        class: member.className,
        wowSpec: member.specName,
        specRole: member.specRole,
        // RIO se tu nedotahuje - pro práci s výsledky není potřeba a ušetří to
        // pět dalších dotazů na Raider.io.
        rioScore: null,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.seasonRegistration.create({
      data: {
        seasonId: season.id,
        characterId: character.id,
        status: "APPROVED",
        entryFeePaidAt: new Date(),
        formAnswers: { generated: true, fromRun: run.keystoneRunId },
        raiderioSnapshot: { generated: true },
      },
    });

    await prisma.teamMembership.create({
      data: {
        seasonId: season.id,
        teamId: team.id,
        characterId: character.id,
        roleInTeam: member.specRole,
        status: "ACTIVE",
      },
    });

    console.log(
      `  ${String(index + 1)}. ${member.characterName.padEnd(12)} ${member.className} - ${member.specName} (${member.specRole})`
    );
  }

  console.log(
    `\nDatabáze ${database}: tým "${team.name}" s ${run.roster.length} postavami.\n` +
      `Přihlášení: ${USERNAME_PREFIX}<jméno postavy malými písmeny> / test1234`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
