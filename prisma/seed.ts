import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev seed - admin účet + otevřená sezóna, aby šlo projít registračním flow.
// Skript je idempotentní, dá se pustit opakovaně.

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Vývojová hesla jsou natvrdo v repu, takže je zná každý, kdo vidí kód.
 * Na produkci se proto nesmí použít - buď přijdou z prostředí, nebo seed
 * skončí chybou. Tiché založení admina s heslem "admin1234" na veřejné
 * adrese je horší než neproběhlý seed.
 */
function seedPassword(envName: string, devDefault: string): string {
  const value = process.env[envName];

  if (!value) {
    if (IS_PRODUCTION) {
      throw new Error(
        `${envName} není nastavené. Na produkci se výchozí vývojové heslo ` +
          `nepoužije - nastav ${envName} na vlastní heslo (aspoň 12 znaků).`
      );
    }

    return devDefault;
  }

  if (IS_PRODUCTION && value.length < 12) {
    throw new Error(`${envName} má jen ${value.length} znaků, potřeba je aspoň 12.`);
  }

  return value;
}

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = seedPassword("SEED_ADMIN_PASSWORD", "admin1234");
const MODERATOR_USERNAME = process.env.SEED_MODERATOR_USERNAME ?? "moderator";
const MODERATOR_PASSWORD = seedPassword("SEED_MODERATOR_PASSWORD", "moderator1234");
const SEASON_NAME = process.env.SEED_SEASON_NAME ?? "Testovací sezóna";
const SEASON_SLUG = process.env.SEED_SEASON_SLUG ?? "season-mn-2";

// timeLimitSeconds zatím není známý (TBD) - doplní se, až budou časy klíčů potvrzené.
const DUNGEONS = [
  { dungeonName: "Altar of Fangs", abbreviation: "AOF" },
  { dungeonName: "Den of Nalorakk", abbreviation: "DON" },
  { dungeonName: "King's Rest", abbreviation: "KR" },
  { dungeonName: "Murder Row", abbreviation: "MR" },
  { dungeonName: "Ruby Life Pools", abbreviation: "RLP" },
  { dungeonName: "Temple of Sethraliss", abbreviation: "TOS" },
  { dungeonName: "The Blinding Vale", abbreviation: "BV" },
  { dungeonName: "Voidscar Arena", abbreviation: "VSA" },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { role: "ADMIN" },
    create: {
      username: ADMIN_USERNAME,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });

  const moderator = await prisma.user.upsert({
    where: { username: MODERATOR_USERNAME },
    update: { role: "MODERATOR" },
    create: {
      username: MODERATOR_USERNAME,
      passwordHash: await bcrypt.hash(MODERATOR_PASSWORD, 10),
      role: "MODERATOR",
    },
  });

  let season = await prisma.season.findFirst({ where: { name: SEASON_NAME } });

  if (!season) {
    season = await prisma.season.create({
      data: {
        name: SEASON_NAME,
        status: "REGISTRATION_OPEN",
        registrationOpenedAt: new Date(),
        raiderioSeasonSlug: SEASON_SLUG,
      },
    });
  } else if (!season.raiderioSeasonSlug) {
    season = await prisma.season.update({
      where: { id: season.id },
      data: { raiderioSeasonSlug: SEASON_SLUG },
    });
  }

  // Dungeony se synchronizují i do už existující sezóny, ať se seed dá pustit
  // znovu po úpravě seznamu. Ruční změny koeficientů zůstávají zachované.
  for (const dungeon of DUNGEONS) {
    await prisma.seasonDungeon.upsert({
      where: {
        seasonId_dungeonName: {
          seasonId: season.id,
          dungeonName: dungeon.dungeonName,
        },
      },
      update: { abbreviation: dungeon.abbreviation },
      create: { ...dungeon, seasonId: season.id, bonusMultiplier: 1 },
    });
  }

  // Logy hostingu bývají čitelné víc lidem, než by se do hesel mělo dostat.
  const shown = (password: string) => (IS_PRODUCTION ? "(z prostředí)" : password);

  console.log(`Admin: ${admin.username} / ${shown(ADMIN_PASSWORD)}`);
  console.log(`Moderátor: ${moderator.username} / ${shown(MODERATOR_PASSWORD)}`);
  console.log(`Sezóna: ${season.name} (${season.status}), id=${season.id}`);
  console.log(`Dungeonů: ${DUNGEONS.length}, Raider.io sezóna: ${season.raiderioSeasonSlug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
