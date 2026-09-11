/**
 * Pomocné funkce pro měsíční kalendář.
 *
 * Modul je čistý (bez databáze i bez Reactu), aby šel testovat samostatně
 * (viz scripts/check-calendar.ts). Týden začíná pondělím.
 */

export const CZECH_MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export const CZECH_WEEKDAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

/** Pondělí = 0 ... neděle = 6. Date.getDay() má neděli jako 0. */
export function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Půlnoc daného dne v místním čase. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Mřížka celých týdnů pokrývajících daný měsíc. Dny z okolních měsíců se
 * doplní, aby byl každý řádek úplný - jinak by mřížka měla díry.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  today: Date = new Date()
): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - mondayFirstIndex(first));

  const weeks: CalendarDay[][] = [];
  const cursor = new Date(gridStart);

  // Měsíc se vejde nejvýš do šesti týdnů; smyčka končí, jakmile je celý za námi.
  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor);
      const weekday = mondayFirstIndex(date);

      days.push({
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
        isToday: isSameDay(date, today),
        isWeekend: weekday >= 5,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(days);

    const nextDayIsPastMonth =
      cursor.getFullYear() > year ||
      (cursor.getFullYear() === year && cursor.getMonth() > month);

    if (nextDayIsPastMonth) break;
  }

  return weeks;
}

export interface MonthRef {
  year: number;
  month: number;
}

/** "2026-09" -> { year: 2026, month: 8 }. Nesmysl spadne na výchozí měsíc. */
export function parseMonthParam(
  value: string | undefined,
  fallback: Date = new Date()
): MonthRef {
  const match = value?.match(/^(\d{4})-(\d{2})$/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;

    if (year >= 2000 && year <= 2100 && month >= 0 && month <= 11) {
      return { year, month };
    }
  }

  return { year: fallback.getFullYear(), month: fallback.getMonth() };
}

export function formatMonthParam({ year, month }: MonthRef): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Date -> "2026-09-14" v místním čase (toISOString by posunul přes UTC). */
export function formatDayParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "2026-09-14" -> půlnoc toho dne. Nesmysl i neexistující datum vrátí null. */
export function parseDayParam(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  // Date normalizuje přetečení (31. února = 3. března), takže se zpětnou
  // kontrolou odfiltrují data, která ve skutečnosti neexistují.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const shifted = new Date(year, month + delta, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function monthTitle({ year, month }: MonthRef): string {
  return `${CZECH_MONTHS[month]} ${year}`;
}

// ---------- Události ----------

export type CalendarEventKind =
  | "MATCH_PROPOSED"
  | "MATCH_CONFIRMED"
  | "AVAILABILITY"
  | "TEAMMATE_AVAILABILITY"
  | "OVERLAP";

export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  kind: CalendarEventKind;
  /** Krátký popis do buňky, např. jméno navrhovatele. */
  label: string;
  /** Barva popisku - u jména postavy barva její classy (classColor). */
  labelColor?: string | null;
  /** Delší popis do title atributu. */
  detail?: string;
}

/**
 * Události zasahující do daného dne, seřazené podle začátku.
 *
 * Úsek přes půlnoc se objeví u obou dnů - jinak by termín od 23:00 do 1:00
 * z druhého dne zmizel.
 */
export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return events
    .filter((event) => event.start < dayEnd && event.end > dayStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Zasahuje událost do daného měsíce? Úsek přes konec měsíce se počítá. */
export function eventInMonth(event: CalendarEvent, { year, month }: MonthRef) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  return event.start < monthEnd && event.end > monthStart;
}

export function monthHasEvents(events: CalendarEvent[], month: MonthRef) {
  return events.some((event) => eventInMonth(event, month));
}

/**
 * Nejbližší událost k danému okamžiku.
 *
 * Přednost má nejbližší budoucí - koho zajímá kalendář, ten obvykle řeší, co
 * bude, ne co bylo. Když už všechno proběhlo, vrátí se poslední minulá, ať se
 * dá aspoň dohledat, co se odehrálo.
 *
 * Slouží k tomu, aby prázdný měsíc nebyl slepá ulička: kalendář se otevírá na
 * dnešku, a když v něm nic není, ukáže odkaz tam, kde něco je.
 */
export function nearestEvent(
  events: CalendarEvent[],
  now: Date = new Date()
): CalendarEvent | null {
  if (events.length === 0) return null;

  const upcoming = events
    .filter((event) => event.end >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (upcoming.length > 0) return upcoming[0];

  return events
    .slice()
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0];
}
