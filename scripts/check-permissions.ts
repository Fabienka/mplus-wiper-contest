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

const EXPECTED: Record<UserRole, Permission[]> = {
  ADMIN: [
    "accessAdmin",
    "reviewRegistrations",
    "confirmEntryFee",
    "approveMatchTerms",
    "manageSeason",
    "runShuffle",
    "manageTeams",
    "manageUsers",
  ],
  MODERATOR: ["accessAdmin", "confirmEntryFee", "approveMatchTerms"],
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

console.log(
  `${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol oprávnění prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
