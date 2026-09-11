/**
 * Čtení a formátování data a času z polí výběru termínu.
 *
 * Výběr termínu má dvě textová pole - den ("17. 9. 2026") a čas ("19:30").
 * Stejné funkce běží v prohlížeči (kontrola a srovnání zápisu) i v server
 * action, takže prohlížeč nemůže pustit nic, co by server nepřečetl. A když
 * JavaScript nenaběhne, formulář pořád funguje - server si text přečte sám.
 *
 * Modul je čistý, testuje ho scripts/check-datetime-input.ts. Časy se
 * skládají v místní zóně procesu, stejně jako dřív z <input type="datetime-local">
 * (viz src/lib/timezone.ts).
 */

/** Krok nabídky časů. Ručně jde zapsat i přesná minuta. */
export const TIME_STEP_MINUTES = 15;

/** Kam se nabídka časů posune, když ještě nic zadaného není - hraje se večer. */
export const DEFAULT_TIME = "18:00";

export interface TimeValue {
  hours: number;
  minutes: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Nabídka časů po TIME_STEP_MINUTES: "00:00", "00:15", ... "23:45". */
export const TIME_SLOTS: string[] = Array.from(
  { length: (24 * 60) / TIME_STEP_MINUTES },
  (_, i) => {
    const total = i * TIME_STEP_MINUTES;
    return formatTimeInput({ hours: Math.floor(total / 60), minutes: total % 60 });
  }
);

/** Datum, které opravdu existuje - 31. 2. by Date potichu převedl na 3. 3. */
function exactDate(year: number, month: number, day: number): Date | null {
  if (year < 2000 || year > 2100) return null;

  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * "17. 9. 2026" -> půlnoc toho dne. Nesmysl vrátí null.
 *
 * Bere i "17.9.2026", "17/9/2026", dvouciferný rok a ISO "2026-09-17".
 * Bez roku ("17. 9.") je to letošek, a když už ten den byl, příští rok -
 * termíny se zadávají dopředu.
 */
export function parseDayInput(text: string, today: Date = new Date()): Date | null {
  const value = text.trim();

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return exactDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const czech = value.match(
    /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*(?:[./]\s*(\d{4}|\d{2})?)?$/
  );
  if (!czech) return null;

  const day = Number(czech[1]);
  const month = Number(czech[2]) - 1;

  if (czech[3]) {
    const year = Number(czech[3]) + (czech[3].length === 2 ? 2000 : 0);
    return exactDate(year, month, day);
  }

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisYear = exactDate(today.getFullYear(), month, day);

  if (thisYear && thisYear >= todayStart) return thisYear;
  return exactDate(today.getFullYear() + 1, month, day);
}

/** Date -> "17. 9. 2026", stejný zápis jako všude jinde v aplikaci. */
export function formatDayInput(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`;
}

/**
 * "19:30" -> { hours: 19, minutes: 30 }. Nesmysl vrátí null.
 *
 * Bere i "19.30" (telefonní klávesnice nemá dvojtečku), "1930", "930"
 * a samotnou hodinu "19".
 */
export function parseTimeInput(text: string): TimeValue | null {
  const value = text.trim();
  const match =
    value.match(/^(\d{1,2})(?:\s*[:.,]\s*(\d{2}))?$/) ?? value.match(/^(\d{1,2})(\d{2})$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);

  if (hours > 23 || minutes > 59) return null;

  return { hours, minutes };
}

export function formatTimeInput({ hours, minutes }: TimeValue): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Index nejbližší položky nabídky časů - na ni se nabídka po otevření posune. */
export function nearestSlotIndex({ hours, minutes }: TimeValue): number {
  const index = Math.round((hours * 60 + minutes) / TIME_STEP_MINUTES);
  return Math.min(index, TIME_SLOTS.length - 1);
}

/**
 * Proč úsek od-do nedává smysl, nebo null. Stejná pravidla pro zadaný čas
 * hráče i pro termín zápasu - ať ho zadává tým, nebo admin za tým.
 */
export function timeRangeError(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Zadaný čas nedává smysl.";
  }

  if (end <= start) return "Konec musí být později než začátek.";

  // Delší než den je skoro jistě překlep (např. špatný rok) a rozbilo by to
  // přehled překryvů.
  if (end.getTime() - start.getTime() > 24 * 3600_000) {
    return "Jeden úsek může být nejvýš 24 hodin. Rozděl ho na víc dnů.";
  }

  return null;
}

/** Den a čas z obou polí jako jeden okamžik. Když jedno nedává smysl, null. */
export function combineDateTime(
  dayText: string,
  timeText: string,
  today: Date = new Date()
): Date | null {
  const day = parseDayInput(dayText, today);
  const time = parseTimeInput(timeText);

  if (!day || !time) return null;

  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.hours,
    time.minutes
  );
}
