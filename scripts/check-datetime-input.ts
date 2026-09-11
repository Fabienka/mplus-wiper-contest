/**
 * Kontrola čtení data a času z polí výběru termínu.
 *
 *   npm run check:datetime-input
 */

import {
  TIME_SLOTS,
  combineDateTime,
  formatDayInput,
  nearestSlotIndex,
  parseDayInput,
  parseTimeInput,
  timeRangeError,
} from "../src/lib/datetime-input";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const sameDay = (date: Date | null, y: number, m: number, d: number) =>
  date !== null &&
  date.getFullYear() === y &&
  date.getMonth() === m &&
  date.getDate() === d;

// Pevný "dnešek", ať výsledky nezávisí na tom, kdy skript běží.
const TODAY = new Date(2026, 8, 11, 14, 0);

console.log("1. Zápisy dne");
{
  check(sameDay(parseDayInput("17. 9. 2026", TODAY), 2026, 8, 17), "17. 9. 2026");
  check(sameDay(parseDayInput("17.9.2026", TODAY), 2026, 8, 17), "17.9.2026 bez mezer");
  check(sameDay(parseDayInput(" 17 . 9 . 2026 ", TODAY), 2026, 8, 17), "mezery navíc");
  check(sameDay(parseDayInput("17/9/2026", TODAY), 2026, 8, 17), "lomítka");
  check(sameDay(parseDayInput("17. 9. 26", TODAY), 2026, 8, 17), "dvouciferný rok");
  check(sameDay(parseDayInput("2026-09-17", TODAY), 2026, 8, 17), "ISO zápis");
}

console.log("2. Den bez roku");
{
  check(sameDay(parseDayInput("17. 9.", TODAY), 2026, 8, 17), "budoucí den je letos");
  check(sameDay(parseDayInput("17.9", TODAY), 2026, 8, 17), "bez tečky na konci");
  check(sameDay(parseDayInput("11. 9.", TODAY), 2026, 8, 11), "dnešek je letos");
  check(sameDay(parseDayInput("3. 1.", TODAY), 2027, 0, 3), "den, který už byl, je příští rok");
}

console.log("3. Nesmyslné dny");
{
  check(parseDayInput("31. 2. 2026", TODAY) === null, "31. února neexistuje");
  check(parseDayInput("29. 2. 2027", TODAY) === null, "29. února v nepřestupném roce");
  check(parseDayInput("1. 13. 2026", TODAY) === null, "13. měsíc");
  check(parseDayInput("", TODAY) === null, "prázdné pole");
  check(parseDayInput("zítra", TODAY) === null, "text");
  check(parseDayInput("17. 9. 1999", TODAY) === null, "rok mimo rozsah");
}

console.log("4. Formát dne");
{
  check(formatDayInput(new Date(2026, 8, 7)) === "7. 9. 2026", "7. 9. 2026 bez nul");
  const roundTrip = parseDayInput(formatDayInput(new Date(2026, 11, 24)), TODAY);
  check(sameDay(roundTrip, 2026, 11, 24), "formát jde přečíst zpátky");
}

console.log("5. Zápisy času");
{
  const is = (text: string, h: number, m: number) => {
    const parsed = parseTimeInput(text);
    check(
      parsed?.hours === h && parsed?.minutes === m,
      `"${text}" je ${h}:${m}`,
      JSON.stringify(parsed)
    );
  };

  is("19:30", 19, 30);
  is("9:05", 9, 5);
  is("19.30", 19, 30);
  is("1930", 19, 30);
  is("930", 9, 30);
  is("19", 19, 0);
  is("19:07", 19, 7);
  is("0:00", 0, 0);

  check(parseTimeInput("24:00") === null, "24:00 neexistuje");
  check(parseTimeInput("19:60") === null, "60 minut neexistuje");
  check(parseTimeInput("19:5") === null, "jednociferné minuty jsou nejasné");
  check(parseTimeInput("") === null, "prázdné pole");
}

console.log("6. Nabídka po 15 minutách");
{
  check(TIME_SLOTS.length === 96, "96 položek za den");
  check(TIME_SLOTS[0] === "00:00", "začíná půlnocí");
  check(TIME_SLOTS[1] === "00:15", "krok 15 minut");
  check(TIME_SLOTS[95] === "23:45", "končí 23:45");
  check(TIME_SLOTS[nearestSlotIndex({ hours: 19, minutes: 30 })] === "19:30", "přesná shoda");
  check(TIME_SLOTS[nearestSlotIndex({ hours: 19, minutes: 7 })] === "19:00", "19:07 je nejblíž 19:00");
  check(TIME_SLOTS[nearestSlotIndex({ hours: 19, minutes: 8 })] === "19:15", "19:08 je nejblíž 19:15");
  check(TIME_SLOTS[nearestSlotIndex({ hours: 23, minutes: 59 })] === "23:45", "23:59 nepřeteče");
}

console.log("7. Den a čas dohromady");
{
  const value = combineDateTime("17. 9. 2026", "19:30", TODAY);
  check(
    value?.getTime() === new Date(2026, 8, 17, 19, 30).getTime(),
    "17. 9. 2026 19:30",
    value?.toString()
  );
  check(combineDateTime("17. 9. 2026", "", TODAY) === null, "chybí čas");
  check(combineDateTime("", "19:30", TODAY) === null, "chybí den");
  check(combineDateTime("31. 2. 2026", "19:30", TODAY) === null, "nesmyslný den");
}

console.log("8. Úsek od-do");
{
  const at = (hour: number, day = 13) => new Date(2026, 8, day, hour);

  check(timeRangeError(at(18), at(21)) === null, "večer 18-21 je v pořádku");
  check(timeRangeError(at(22), at(1, 14)) === null, "přes půlnoc je v pořádku");
  check(timeRangeError(at(21), at(18)) !== null, "konec před začátkem neprojde");
  check(timeRangeError(at(18), at(18)) !== null, "nulová délka neprojde");
  check(timeRangeError(at(18), at(19, 14)) !== null, "přes 24 hodin neprojde");
  check(timeRangeError(new Date(NaN), at(18)) !== null, "neplatný začátek neprojde");
}

if (failures > 0) {
  console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
  process.exit(1);
}

console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
