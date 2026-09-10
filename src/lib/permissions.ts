import type { UserRole } from "@prisma/client";

/**
 * Oprávnění podle role.
 *
 * - ADMIN     - kompletní práva
 * - MODERATOR - běžný uživatel + provoz sezóny: zápisné, termíny, přesuny
 *               v týmech a drobné úpravy sezóny. Nesmí schvalovat registrace,
 *               pouštět shuffle, sahat na pravidla sezóny ani nic mazat.
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
  /**
   * Vydání jednorázového odkazu na reset hesla. Moderátor ho smí vydat jen
   * běžnému uživateli - o tom rozhoduje canIssueResetFor v password-reset.ts,
   * tohle je jen vstup na stránku.
   */
  issuePasswordReset: ["ADMIN", "MODERATOR"],
  /**
   * Stránka Sezóna a dungeony a její vratné úpravy - název sezóny, stav
   * registrace, doplnění časů z Raider.io a přepínač Aktivní u dungeonu.
   */
  manageSeason: ["ADMIN", "MODERATOR"],
  /**
   * Pravidla sezóny, na kterých závisí bodování a už odehrané zápasy: slug
   * Raider.io, nejnižší bodovaný klíč, body za úroveň klíče, názvy a časy
   * dungeonů a přidávání/mazání dungeonů. Jen admin.
   */
  configureSeason: ["ADMIN"],
  runShuffle: ["ADMIN"],
  /**
   * Stránka Týmy a ruční úpravy soupisek - přesuny mezi týmy a náhradníky,
   * role v týmu, název týmu. Nic z toho nemaže data.
   */
  manageTeams: ["ADMIN", "MODERATOR"],
  /** Smazání celého rozdělení sezóny. Nevratné, proto jen admin. */
  deleteTeams: ["ADMIN"],
  /**
   * Seznam uživatelů a detail jednoho z nich - kdo to je, jakou má postavu,
   * v jakém je týmu, jestli má zaplacené zápisné a co odběhal. Jen čtení.
   */
  viewUsers: ["ADMIN", "MODERATOR"],
  /** Změna role uživatele. */
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
