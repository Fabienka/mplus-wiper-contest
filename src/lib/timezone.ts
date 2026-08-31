/**
 * Časová zóna aplikace.
 *
 * Všechny časy se formátují i parsují na serveru v jeho systémové zóně:
 * `formatRange` a spol. v labels.ts, mřížka v calendar.ts a hlavně
 * `new Date("2026-09-14T18:00")` nad hodnotou z <input type="datetime-local">.
 * Nikde se zóna nepředává explicitně, takže o zobrazených časech rozhoduje
 * systémové nastavení serveru.
 *
 * Na vývojářském stroji v Česku to sedí samo. Hosting ale běží skoro vždy
 * v UTC a termíny by se pak ukazovaly o hodinu (v létě o dvě) posunuté, aniž
 * by cokoliv spadlo. Proto musí mít proces nastavené TZ=Europe/Prague a
 * kontrola níž to při startu ověří.
 */
export const APP_TIME_ZONE = "Europe/Prague";

/** Zóna, ve které proces právě běží. */
export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Ověří zónu procesu. Na produkci vyhodí výjimku - spadlý start je lepší
 * než web, který všem ukazuje špatné časy běhů. V dev jen upozorní, ať to
 * nikomu neblokuje práci.
 */
export function assertAppTimeZone(): void {
  const actual = currentTimeZone();

  if (actual === APP_TIME_ZONE) return;

  const message =
    `Proces běží v zóně "${actual}", ale aplikace počítá s "${APP_TIME_ZONE}". ` +
    `Termíny by se zobrazovaly posunuté. Nastav hostingu proměnnou ` +
    `TZ=${APP_TIME_ZONE} (musí to být proměnná prostředí, ne řádek v .env - ` +
    `Node si zónu čte při startu, dřív než se .env načte).`;

  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }

  console.warn(`[timezone] ${message}`);
}
