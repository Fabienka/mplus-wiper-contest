/**
 * Vydávání a ověřování jednorázových tokenů pro reset hesla.
 *
 * Aplikace nemá SMTP, takže odkaz na nastavení hesla se nikam neposílá sama -
 * vydá ho admin nebo moderátor a předá ho hráči na Discordu. Doručení je tedy
 * mimo aplikaci a všechno, co se dá pohlídat, se hlídá tady a v
 * password-rules.ts (odkud si tenhle soubor bere platnost odkazu).
 *
 * Kvůli node:crypto smí tenhle modul importovat jen serverový kód.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { RESET_TOKEN_TTL_MS } from "@/lib/password-rules";

/**
 * Délka tokenu v bajtech. 32 bajtů = 256 bitů náhody, takže odkaz nejde
 * uhodnout ani hrubou silou. Právě proto se stránka resetu neomezuje počtem
 * pokusů: bez platného tokenu se ke kontrole hesla vůbec nedojde a neplatný
 * token stojí jen jeden otisk a jeden dotaz do indexu.
 */
const TOKEN_BYTES = 32;

export interface IssuedResetToken {
  /** Tajemství pro odkaz. Ukazuje se jedinkrát a nikam se neukládá. */
  token: string;
  /** To, co jde do databáze. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Otisk tokenu. SHA-256 stačí - na rozdíl od hesla je token dlouhý a náhodný,
 * takže se proti němu nedá stavět slovník a pomalá funkce (bcrypt) by tu byla
 * jen zdržení při každém otevření odkazu.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createResetToken(now: Date = new Date()): IssuedResetToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  };
}

/**
 * Porovnání otisků v konstantním čase. Databáze token hledá podle indexu, kde
 * se času stejně nevyhneme, ale tam, kde už dvojici v ruce máme (skript,
 * ověření před zápisem hesla), se porovnává takhle.
 */
export function tokenHashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Odkaz, který admin pošle hráči.
 *
 * Základ se bere z NEXTAUTH_URL, protože na serveru nemá server action
 * spolehlivě k dispozici veřejnou adresu (proxy, jiný port). Když proměnná
 * chybí, je lepší spadnout tady než vydat odkaz na "undefined/reset-hesla".
 */
export function buildResetUrl(baseUrl: string | undefined, token: string): string {
  if (!baseUrl) {
    throw new Error(
      "Chybí NEXTAUTH_URL - bez ní se nedá sestavit odkaz na reset hesla."
    );
  }

  return `${baseUrl.replace(/\/+$/, "")}/reset-hesla/${token}`;
}
