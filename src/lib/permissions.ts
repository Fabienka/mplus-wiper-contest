import type { UserRole } from "@prisma/client";

/**
 * Oprávnění podle role.
 *
 * - ADMIN     - kompletní práva
 * - MODERATOR - běžný uživatel + potvrzování zápisného a schvalování termínů;
 *               nesmí schvalovat registrace ani sahat na sezónu, shuffle a týmy
 * - USER      - do administrace nemá přístup
 *
 * Soubor schválně nemá běhový import z Prisma klienta (jen typ), aby šel
 * použít i v middlewaru, který běží na edge.
 */
export const PERMISSIONS = {
  /** Vstup do /admin vůbec - moderátor sem potřebuje kvůli zápisnému. */
  accessAdmin: ["ADMIN", "MODERATOR"],
  /** Schválení a zamítnutí registrace (kontrola postavy, RIO, pravidel). */
  reviewRegistrations: ["ADMIN"],
  /** Potvrzení, že dorazilo zápisné poslané ve hře. */
  confirmEntryFee: ["ADMIN", "MODERATOR"],
  /** Schválení domluveného termínu zápasu. */
  approveMatchTerms: ["ADMIN", "MODERATOR"],
  manageSeason: ["ADMIN"],
  runShuffle: ["ADMIN"],
  manageTeams: ["ADMIN"],
  manageUsers: ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(
  role: UserRole | string | undefined | null,
  permission: Permission
): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
