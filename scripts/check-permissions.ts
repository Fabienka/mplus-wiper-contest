/**
 * Kontrola matice oprávnění.
 *
 * Smyslem je, aby budoucí úprava PERMISSIONS nemohla tiše přidat moderátorovi
 * práva, která mít nemá. Očekávaný stav je tady vypsaný natvrdo - když se
 * oprávnění zámyslně mění, musí se změnit i tahle tabulka.
 *
 *   npm run check:permissions
 */

import type { UserRole } from "@prisma/client";
import { PERMISSIONS, can, type Permission } from "../src/lib/permissions";
import { compareUsersByRole } from "../src/lib/labels";

const EXPECTED: Record<UserRole, Permission[]> = {
  ADMIN: [
    "accessAdmin",
    "reviewRegistrations",
    "confirmEntryFee",
    "approveMatchTerms",
    "manageSeason",
    "configureSeason",
    "runShuffle",
    "manageTeams",
    "deleteTeams",
    "resetTeamReroll",
    "viewUsers",
    "manageUsers",
    "issuePasswordReset",
  ],
  // Moderátor smí vydat odkaz na reset hesla, ale jen běžnému uživateli - tuhle
  // část hlídá canIssueResetFor (npm run check:password-reset), sem se vejde
  // jen to, že na stránku vůbec smí.
  // Sezónu a týmy moderátor vidí a upravuje, ale jen vratně: název sezóny,
  // stav registrace, časy z Raider.io, přepínač Aktivní u dungeonu a přesuny
  // v soupiskách. Pravidla bodování (configureSeason), mazání rozdělení
  // (deleteTeams), rušení rerollu (resetTeamReroll) i změny rolí (manageUsers)
  // zůstávají adminovi.
  MODERATOR: [
    "accessAdmin",
    "confirmEntryFee",
    "approveMatchTerms",
    "issuePasswordReset",
    "manageSeason",
    "manageTeams",
    "viewUsers",
  ],
  USER: [],
};

const ALL = Object.keys(PERMISSIONS) as Permission[];
let failures = 0;
let checks = 0;

for (const role of Object.keys(EXPECTED) as UserRole[]) {
  for (const permission of ALL) {
    checks++;
    const expected = EXPECTED[role].includes(permission);
    const actual = can(role, permission);

    if (expected !== actual) {
      failures++;
      console.error(
        `  ✗ ${role} / ${permission}: čekáno ${expected ? "povoleno" : "zakázáno"}, je ${actual ? "povoleno" : "zakázáno"}`
      );
    }
  }
}

// Nepřihlášený nesmí projít nikam.
for (const permission of ALL) {
  checks++;
  if (can(null, permission) || can(undefined, permission) || can("", permission)) {
    failures++;
    console.error(`  ✗ bez role prošlo oprávnění ${permission}`);
  }
}

// Neznámá role (např. zbylá v JWT po přejmenování) taky ne.
for (const permission of ALL) {
  checks++;
  if (can("SOMETHING_ELSE", permission)) {
    failures++;
    console.error(`  ✗ neznámá role prošla oprávnění ${permission}`);
  }
}

// Řazení uživatelů podle role. Patří sem, protože jde o stejnou past jako
// oprávnění: MODERATOR přibyl do enumu až migrací a v Postgresu se proto řadí
// až za USER - kdo by se vrátil k `ORDER BY role`, dostane nesmyslné pořadí.
{
  const user = (role: UserRole, username: string) => ({ role, username });

  const sorted = [
    user("USER", "zdenek"),
    user("MODERATOR", "moderator"),
    user("USER", "adam"),
    user("ADMIN", "admin"),
  ]
    .sort(compareUsersByRole)
    .map((u) => u.username);

  checks++;
  const expected = ["admin", "moderator", "adam", "zdenek"];
  if (sorted.join(",") !== expected.join(",")) {
    failures++;
    console.error(
      `  ✗ řazení podle role: čekáno ${expected.join(", ")}, je ${sorted.join(", ")}`
    );
  }

  checks++;
  if (compareUsersByRole(user("USER", "a"), user("MODERATOR", "z")) <= 0) {
    failures++;
    console.error("  ✗ moderátor se musí řadit před běžného uživatele");
  }

  checks++;
  if (compareUsersByRole(user("USER", "a"), user("USER", "b")) >= 0) {
    failures++;
    console.error("  ✗ ve stejné roli rozhoduje jméno");
  }
}

console.log(
  `${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol oprávnění prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
