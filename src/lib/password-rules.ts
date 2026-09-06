/**
 * Pravidla pro reset a změnu hesla - platnost odkazu, kdo komu smí reset vydat
 * a jak vypadá přijatelné heslo.
 *
 * Soubor schválně nemá jediný běhový import: sahají na něj i formuláře běžící
 * v prohlížeči (délka hesla, hlášky) a cokoliv z Node by se do nich nedalo
 * zabalit. Práce s tokeny, která potřebuje node:crypto, je v password-reset.ts.
 */

import type { UserRole } from "@prisma/client";

/**
 * Platnost odkazu. Hodina je kompromis: dost dlouhá, aby stihl admin odkaz
 * poslat na Discord a hráč ho vyzvednout, a dost krátká, aby zapomenutý odkaz
 * v historii chatu nebyl použitelný napořád.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

/** Stejný spodní limit jako v registraci - jinak by se dal resetem obejít. */
export const MIN_PASSWORD_LENGTH = 8;

export type ResetTokenState = "VALID" | "EXPIRED" | "USED";

export interface ResetTokenRecord {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Stav odkazu. Rozlišuje se schválně - hráč, kterému odkaz vypršel, potřebuje
 * vědět, že si má říct o nový, ne aby hádal, jestli si ho špatně zkopíroval.
 */
export function resetTokenState(
  record: ResetTokenRecord,
  now: Date = new Date()
): ResetTokenState {
  if (record.usedAt) return "USED";
  if (record.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "VALID";
}

export const RESET_TOKEN_STATE_MESSAGES: Record<
  Exclude<ResetTokenState, "VALID">,
  string
> = {
  EXPIRED: `Platnost odkazu vypršela (odkaz platí ${RESET_TOKEN_TTL_MINUTES} minut). Požádej admina nebo moderátora o nový.`,
  USED: "Tenhle odkaz už byl použitý. Každý odkaz jde použít jen jednou - o další si řekni adminovi nebo moderátorovi.",
};

/**
 * Kdo komu smí vydat odkaz na reset.
 *
 * Moderátor smí resetovat jen běžné uživatele. Kdyby směl adminovi, mohl by
 * si vydat odkaz na admin účet, nastavit mu heslo a povýšit se - moderátor
 * přitom nemá ani právo měnit role.
 */
export function canIssueResetFor(
  actorRole: UserRole | string | undefined | null,
  targetRole: UserRole | string
): boolean {
  if (actorRole === "ADMIN") return true;
  if (actorRole === "MODERATOR") return targetRole === "USER";
  return false;
}

/**
 * Kontrola nového hesla. Vrací hlášku, nebo null, když je heslo v pořádku.
 *
 * Kontroluje se schválně jen délka a shoda opisu. Složitější pravidla
 * (velká písmena, číslice) lidi vedou ke krátkým heslům s vykřičníkem na
 * konci a proti zkoušení hesel tu stojí omezení počtu pokusů při přihlášení.
 */
export function validateNewPassword(
  password: string,
  confirmation: string
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Heslo musí mít aspoň ${MIN_PASSWORD_LENGTH} znaků.`;
  }

  if (password !== confirmation) {
    return "Hesla se neshodují.";
  }

  return null;
}

