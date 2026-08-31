/**
 * Kontrola měsíční mřížky kalendáře.
 *
 *   npm run check:calendar
 */

import {
  buildMonthGrid,
  eventsForDay,
  formatDayParam,
  formatMonthParam,
  mondayFirstIndex,
  parseDayParam,
  parseMonthParam,
  shiftMonth,
  type CalendarEvent,
} from "../src/lib/calendar";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log("1. Týden začíná pondělím");
{
  // 2026-09-01 je úterý.
  check(mondayFirstIndex(new Date(2026, 8, 1)) === 1, "úterý má index 1");
  check(mondayFirstIndex(new Date(2026, 8, 7)) === 0, "pondělí má index 0");
  check(mondayFirstIndex(new Date(2026, 8, 6)) === 6, "neděle má index 6");
}

console.log("2. Mřížka pokrývá celé týdny");
{
  const weeks = buildMonthGrid(2026, 8, new Date(2026, 8, 15));

  check(
    weeks.every((week) => week.length === 7),
    "každý řádek má 7 dnů"
  );
  check(
    weeks.every((week) => mondayFirstIndex(week[0].date) === 0),
    "každý řádek začíná pondělím"
  );

  const days = weeks.flat();
  const inMonth = days.filter((d) => d.isCurrentMonth);
  check(inMonth.length === 30, "září má 30 dnů", `${inMonth.length}`);
  check(inMonth[0].dayOfMonth === 1, "první den měsíce je 1.");
  check(inMonth[inMonth.length - 1].dayOfMonth === 30, "poslední je 30.");

  // Dny musí jít po sobě bez děr.
  const ok = days.every((d, i) => {
    if (i === 0) return true;
    const prev = days[i - 1].date;
    const expected = new Date(prev);
    expected.setDate(expected.getDate() + 1);
    return d.date.toDateString() === expected.toDateString();
  });
  check(ok, "dny jdou souvisle po sobě");
}

console.log("3. Dnešek a víkend");
{
  const today = new Date(2026, 8, 15);
  const days = buildMonthGrid(2026, 8, today).flat();

  check(days.filter((d) => d.isToday).length === 1, "právě jeden den je dnešek");
  check(
    days.find((d) => d.isToday)!.dayOfMonth === 15,
    "dnešek je 15."
  );
  check(
    days.filter((d) => d.isWeekend).every((d) => [5, 6].includes(mondayFirstIndex(d.date))),
    "víkend je sobota a neděle"
  );
}

console.log("4. Měsíce s hraničním začátkem");
{
  // Únor 2027 začíná v pondělí - mřížka nesmí přidat zbytečný týden navíc.
  const feb = buildMonthGrid(2027, 1, new Date(2027, 1, 10));
  check(feb[0][0].dayOfMonth === 1, "únor 2027 začíná rovnou 1.", `${feb[0][0].dayOfMonth}`);
  check(feb.length === 4, "vejde se do 4 týdnů", `${feb.length}`);

  // Přestupný rok.
  const leap = buildMonthGrid(2028, 1, new Date(2028, 1, 10)).flat();
  check(
    leap.filter((d) => d.isCurrentMonth).length === 29,
    "únor 2028 má 29 dnů",
    `${leap.filter((d) => d.isCurrentMonth).length}`
  );

  // Nejdelší varianta: měsíc o 31 dnech začínající nedělí.
  const long = buildMonthGrid(2026, 2, new Date(2026, 2, 10));
  check(long.every((w) => w.length === 7), "i šestitýdenní měsíc má plné řádky");
}

console.log("5. Parametr měsíce v URL");
{
  const fallback = new Date(2026, 8, 1);

  check(parseMonthParam("2026-05", fallback).month === 4, "2026-05 = květen");
  check(parseMonthParam("2026-05", fallback).year === 2026, "rok se přečte");
  check(parseMonthParam(undefined, fallback).month === 8, "bez parametru výchozí měsíc");
  check(parseMonthParam("nesmysl", fallback).month === 8, "nesmysl spadne na výchozí");
  check(parseMonthParam("2026-13", fallback).month === 8, "měsíc 13 spadne na výchozí");
  check(parseMonthParam("1200-01", fallback).year === 2026, "rok mimo rozsah spadne na výchozí");

  check(formatMonthParam({ year: 2026, month: 4 }) === "2026-05", "formát zpět na 2026-05");

  check(
    formatMonthParam(shiftMonth({ year: 2026, month: 11 }, 1)) === "2027-01",
    "prosinec + 1 = leden dalšího roku"
  );
  check(
    formatMonthParam(shiftMonth({ year: 2026, month: 0 }, -1)) === "2025-12",
    "leden - 1 = prosinec předchozího roku"
  );
}

console.log("6. Události na dnech");
{
  const events: CalendarEvent[] = [
    {
      id: "a",
      start: new Date(2026, 8, 1, 20, 0),
      end: new Date(2026, 8, 1, 21, 30),
      kind: "MATCH_PROPOSED",
      label: "Guardian0",
    },
    {
      id: "b",
      start: new Date(2026, 8, 1, 18, 0),
      end: new Date(2026, 8, 1, 22, 0),
      kind: "AVAILABILITY",
      label: "můj čas",
    },
    {
      // Přes půlnoc - musí se objevit u obou dnů.
      id: "c",
      start: new Date(2026, 8, 3, 23, 0),
      end: new Date(2026, 8, 4, 1, 0),
      kind: "MATCH_CONFIRMED",
      label: "Feral14",
    },
  ];

  const first = eventsForDay(events, new Date(2026, 8, 1));
  check(first.length === 2, "1. září má dvě události", `${first.length}`);
  check(first[0].id === "b", "řadí se podle začátku (18:00 před 20:00)", first[0]?.id);

  check(eventsForDay(events, new Date(2026, 8, 2)).length === 0, "2. září je prázdné");
  check(eventsForDay(events, new Date(2026, 8, 3)).length === 1, "3. září má půlnoční událost");
  check(
    eventsForDay(events, new Date(2026, 8, 4)).length === 1,
    "a objeví se i 4. září"
  );
  check(eventsForDay(events, new Date(2026, 8, 5)).length === 0, "5. září už ne");

  // Událost končící přesně o půlnoci nepatří do dalšího dne.
  const midnight: CalendarEvent[] = [
    {
      id: "d",
      start: new Date(2026, 8, 10, 22, 0),
      end: new Date(2026, 8, 11, 0, 0),
      kind: "AVAILABILITY",
      label: "x",
    },
  ];
  check(eventsForDay(midnight, new Date(2026, 8, 10)).length === 1, "patří 10. září");
  check(
    eventsForDay(midnight, new Date(2026, 8, 11)).length === 0,
    "konec přesně o půlnoci nepatří do 11."
  );
}

console.log("7. Parametr dne v URL");
{
  check(formatDayParam(new Date(2026, 8, 14)) === "2026-09-14", "formát dne");
  check(formatDayParam(new Date(2026, 0, 5)) === "2026-01-05", "doplní nuly");

  // Ranní hodina by přes toISOString v záporném posunu spadla o den zpět.
  check(
    formatDayParam(new Date(2026, 8, 14, 1, 30)) === "2026-09-14",
    "bere místní čas, ne UTC"
  );

  const parsed = parseDayParam("2026-09-14");
  check(parsed !== null, "platný den se přečte");
  check(
    parsed?.getFullYear() === 2026 && parsed?.getMonth() === 8 && parsed?.getDate() === 14,
    "a je to správné datum"
  );
  check(parsed?.getHours() === 0 && parsed?.getMinutes() === 0, "vrací půlnoc");

  check(parseDayParam(undefined) === null, "chybějící hodnota je null");
  check(parseDayParam("") === null, "prázdný řetězec je null");
  check(parseDayParam("2026-09") === null, "samotný měsíc je null");
  check(parseDayParam("nesmysl") === null, "nesmysl je null");
  check(parseDayParam("2026-02-31") === null, "31. února neexistuje");
  check(parseDayParam("2026-13-01") === null, "třináctý měsíc neexistuje");
  check(parseDayParam("2024-02-29") !== null, "přestupný den 2024 existuje");
  check(parseDayParam("2026-02-29") === null, "ale v roce 2026 ne");

  const roundTrip = parseDayParam(formatDayParam(new Date(2026, 11, 31)));
  check(
    roundTrip?.getMonth() === 11 && roundTrip?.getDate() === 31,
    "formát a zpět dá stejný den"
  );
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
