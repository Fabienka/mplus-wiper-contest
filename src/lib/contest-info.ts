/**
 * Ručně udržovaný obsah veřejných informačních stránek (/info).
 *
 * Kontakty se schválně nedrží v databázi ani v .env: mění se výjimečně, patří
 * do verzí (ať je vidět, kdo je kdy upravil) a nejsou to tajemství. Uprav
 * tenhle soubor a nasaď - žádná administrace k tomu není.
 */

export interface ContactEntry {
  /** Čeho se kontakt týká, např. "Discord server". */
  label: string;
  /** Co se zobrazí - nick, adresa, odkaz. */
  value: string;
  /** Odkaz, pokud na hodnotu jde kliknout. */
  href?: string;
  /** Kdy tenhle kanál použít. */
  note?: string;
}

/**
 * VYPLŇ PŘED SPUŠTĚNÍM SOUTĚŽE.
 *
 * Dokud je pole prázdné, stránka /info/kontakt návštěvníkovi řekne, že se
 * kontakty teprve doplňují - schválně nic nevymýšlí, aby lidi nepsali někam,
 * kde je nikdo nečte.
 *
 * Příklad, jak to vyplnit:
 *
 *   {
 *     label: "Discord server",
 *     value: "discord.gg/nazev-serveru",
 *     href: "https://discord.gg/nazev-serveru",
 *     note: "Nejrychlejší cesta - domlouvání termínů i technické problémy.",
 *   },
 *   {
 *     label: "Pořadatel",
 *     value: "Nick#0000",
 *     note: "Zápisné, přihlášky, spory o výsledek.",
 *   },
 *   {
 *     label: "E-mail",
 *     value: "soutez@example.com",
 *     href: "mailto:soutez@example.com",
 *   },
 */
export const CONTACTS: ContactEntry[] = [];

/**
 * Ve hře se posílá zápisné, takže hráč musí vědět komu. Prázdné = stránka
 * o zápisném mlčí, ať nikdo neposílá zlato naslepo.
 */
export const ENTRY_FEE_RECIPIENT: string | null = null;
