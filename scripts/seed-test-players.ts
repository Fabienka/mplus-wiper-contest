/**
 * Naplní databázi vygenerovanými hráči se schválenou registrací, aby šlo
 * vyzkoušet shuffle. Určeno pro testovací databázi:
 *
 *   npm run seed:players:test
 *
 * Skript se sám brání spuštění nad jinou než testovací databází (viz kontrola
 * názvu níže) - zakládá desítky uživatelů a postav, což na ostrých datech
 * nechceme. Opakované spuštění nejdřív smaže dřív vygenerované hráče, aby
 * nepřibývali; ostatních dat se nedotýká.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { WOW_SPECS } from "../src/lib/wow-specs";

const prisma = new PrismaClient();

/** Prefix, podle kterého se vygenerovaní hráči poznají a dají zase smazat. */
const USERNAME_PREFIX = "testplayer-";

const COUNTS = {
  tanks: Number(process.env.SEED_TANKS ?? 6),
  healers: Number(process.env.SEED_HEALERS ?? 6),
  dps: Number(process.env.SEED_DPS ?? 21),
};

function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const database = url.split("/").pop()?.split("?")[0] ?? "";

  if (!database.includes("test") && process.argv[2] !== "--force") {
    console.error(
      `Databáze "${database}" nevypadá jako testovací.\n` +
        `Spusť skript přes 'npm run seed:players:test', nebo vynuť přes '--force', pokud opravdu chceš zakládat testovací hráče tady.`
    );
    process.exit(1);
  }

  return database;
}

/** Jednoduchý deterministický generátor, ať jsou data mezi běhy stejná. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const database = assertTestDatabase();
  const rng = makeRng(20260824);

  const season = await prisma.season.findFirst({ orderBy: { createdAt: "desc" } });
  if (!season) {
    console.error("Není založená žádná sezóna - spusť nejdřív 'npm run prisma:seed:test'.");
    process.exit(1);
  }

  // Úklid předchozího běhu. Pořadí kvůli cizím klíčům: členství -> registrace
  // -> postava -> uživatel.
  const previous = await prisma.user.findMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
    include: { character: true },
  });

  if (previous.length > 0) {
    const characterIds = previous
      .map((user) => user.character?.id)
      .filter((id): id is string => Boolean(id));

    await prisma.teamMembership.deleteMany({ where: { characterId: { in: characterIds } } });
    await prisma.seasonRegistration.deleteMany({ where: { characterId: { in: characterIds } } });
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    await prisma.user.deleteMany({ where: { id: { in: previous.map((u) => u.id) } } });

    console.log(`Smazáno ${previous.length} dřív vygenerovaných hráčů.`);
  }

  const passwordHash = await bcrypt.hash("test1234", 10);
  let created = 0;

  const addPlayer = async (role: "TANK" | "HEALER" | "DPS", index: number) => {
    const options = WOW_SPECS.filter((spec) => spec.role === role);
    const spec = options[Math.floor(rng() * options.length)];
    const username = `${USERNAME_PREFIX}${role.toLowerCase()}-${index}`;
    const characterName = `${spec.specName.replace(/\s+/g, "")}${index}`;

    const user = await prisma.user.create({
      data: { username, passwordHash, discordNick: `${username}#0000` },
    });

    const character = await prisma.character.create({
      data: {
        userId: user.id,
        raiderioUrl: `https://raider.io/characters/eu/test-realm/${characterName}`,
        characterName,
        realm: "test-realm",
        faction: rng() > 0.5 ? "alliance" : "horde",
        class: spec.className,
        wowSpec: spec.specName,
        specRole: role,
        rioScore: Math.round(rng() * 1600 + 1200),
        lastSyncedAt: new Date(),
      },
    });

    await prisma.seasonRegistration.create({
      data: {
        seasonId: season.id,
        characterId: character.id,
        status: "APPROVED",
        formAnswers: { altCharacter: null, agreedToRules: true, generated: true },
        raiderioSnapshot: { generated: true },
      },
    });

    created++;
  };

  for (let i = 0; i < COUNTS.tanks; i++) await addPlayer("TANK", i);
  for (let i = 0; i < COUNTS.healers; i++) await addPlayer("HEALER", i);
  for (let i = 0; i < COUNTS.dps; i++) await addPlayer("DPS", i);

  console.log(
    `Databáze ${database}: založeno ${created} schválených hráčů ` +
      `(${COUNTS.tanks} tanků, ${COUNTS.healers} healerů, ${COUNTS.dps} DPS) v sezóně "${season.name}".`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
