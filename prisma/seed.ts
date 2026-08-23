import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev seed - admin účet + otevřená sezóna, aby šlo projít registračním flow.
// Skript je idempotentní, dá se pustit opakovaně.

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
const SEASON_NAME = process.env.SEED_SEASON_NAME ?? "Testovací sezóna";

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

  const season =
    (await prisma.season.findFirst({ where: { name: SEASON_NAME } })) ??
    (await prisma.season.create({
      data: {
        name: SEASON_NAME,
        status: "REGISTRATION_OPEN",
        registrationOpenedAt: new Date(),
      },
    }));

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
      create: { ...dungeon, seasonId: season.id, coefficient: 1 },
    });
  }

  console.log(`Admin: ${admin.username} / ${ADMIN_PASSWORD}`);
  console.log(`Sezóna: ${season.name} (${season.status}), id=${season.id}`);
  console.log(`Dungeonů: ${DUNGEONS.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
