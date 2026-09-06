/**
 * Záchranná brzda pro reset hesla.
 *
 *   npm run reset-password -- <uživatelské jméno>
 *   npm run reset-password:test -- <uživatelské jméno>
 *
 * Vydá stejný jednorázový odkaz jako administrace, jen bez přihlášení - běží
 * přímo na serveru, takže ho spustí jen ten, kdo na server má přístup.
 *
 * Je to jediná cesta, jak dostat zpátky účet posledního admina. Běžné resety
 * patří do /admin/hesla, ať je v auditu vidět, kdo je vydal.
 */

import { PrismaClient } from "@prisma/client";
import { RESET_TOKEN_TTL_MINUTES } from "../src/lib/password-rules";
import { buildResetUrl, createResetToken } from "../src/lib/password-reset";

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.error("Použití: npm run reset-password -- <uživatelské jméno>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    // Nápověda se schválně vypisuje - skript běží na serveru, kde jména
    // uživatelů nejsou tajemství, a překlep ve jménu je tu nejčastější chyba.
    const known = await prisma.user.findMany({
      select: { username: true },
      orderBy: { username: "asc" },
    });

    console.error(`Uživatel "${username}" neexistuje.`);
    console.error(`Známá jména: ${known.map((u) => u.username).join(", ")}`);
    process.exit(1);
  }

  const issued = createResetToken();
  const link = buildResetUrl(process.env.NEXTAUTH_URL, issued.token);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        // Prázdné issuedById = vydáno tímhle skriptem. Přihlášený uživatel
        // tady žádný není, komu zápis přiřknout.
        issuedById: null,
      },
    });

    await tx.auditLog.create({
      data: {
        // Audit potřebuje původce a jediný, koho tu známe, je majitel účtu.
        // Že šlo o skript, pozná se podle actionType.
        actorId: user.id,
        actionType: "PASSWORD_RESET_ISSUED_BY_SCRIPT",
        entityType: "User",
        entityId: user.id,
        newValue: {
          username: user.username,
          expiresAt: issued.expiresAt.toISOString(),
        },
      },
    });
  });

  console.log(`\nÚčet:    ${user.username} (${user.role})`);
  console.log(`Platí:   ${RESET_TOKEN_TTL_MINUTES} minut, na jedno použití`);
  console.log(`\n${link}\n`);
  console.log(
    "Odkaz otevři v prohlížeči a nastav heslo. Nikam ho neposílej dál - kdo ho má, nastaví heslo účtu."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
