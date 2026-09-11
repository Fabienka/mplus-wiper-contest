/**
 * Kontrola časového limitu zápasu.
 *
 *   npm run check:time-budget
 */

import { computeTimeBudget, countsForScore, formatPlayTime } from "../src/lib/time-budget";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const min = (m: number) => m * 60;
const at = (hour: number, minute = 0) => new Date(2026, 8, 13, hour, minute);
const LIMIT = min(120);

console.log("1. Běhy v limitu");
{
  const budget = computeTimeBudget(
    [
      { id: "a", clearTimeSeconds: min(30), finishedAt: at(18, 30) },
      { id: "b", clearTimeSeconds: min(35), finishedAt: at(19, 10) },
    ],
    LIMIT
  );
  check(budget.usedSeconds === min(65), "využito 65 min", String(budget.usedSeconds / 60));
  check(budget.remainingSeconds === min(55), "zbývá 55 min");
  check(budget.overLimitIds.size === 0, "nic přes limit");
}

console.log("2. Běh, který limit přetáhne, se nepočítá celý");
{
  const budget = computeTimeBudget(
    [
      { id: "a", clearTimeSeconds: min(40), finishedAt: at(18, 40) },
      { id: "b", clearTimeSeconds: min(40), finishedAt: at(19, 25) },
      { id: "c", clearTimeSeconds: min(41), finishedAt: at(20, 10) },
    ],
    LIMIT
  );
  check(budget.usedSeconds === min(121), "využito 121 min");
  check(budget.remainingSeconds === 0, "zbytek nejde pod nulu");
  check(
    budget.overLimitIds.has("c") && budget.overLimitIds.size === 1,
    "přes limit je jen třetí běh",
    [...budget.overLimitIds].join(",")
  );
}

console.log("3. Přesně na limitu ještě platí");
{
  const budget = computeTimeBudget(
    [
      { id: "a", clearTimeSeconds: min(60), finishedAt: at(19) },
      { id: "b", clearTimeSeconds: min(60), finishedAt: at(20) },
    ],
    LIMIT
  );
  check(budget.overLimitIds.size === 0, "120 z 120 min je v limitu");
  check(budget.remainingSeconds === 0, "a nic nezbývá");
}

console.log("4. Po překročení je přes limit i všechno další");
{
  const budget = computeTimeBudget(
    [
      { id: "a", clearTimeSeconds: min(100), finishedAt: at(19, 40) },
      { id: "b", clearTimeSeconds: min(30), finishedAt: at(20, 15) },
      { id: "c", clearTimeSeconds: min(5), finishedAt: at(20, 25) },
    ],
    LIMIT
  );
  check(
    budget.overLimitIds.has("b") && budget.overLimitIds.has("c") && !budget.overLimitIds.has("a"),
    "b i c přes limit, a ne",
    [...budget.overLimitIds].join(",")
  );
}

console.log("5. Pořadí podle konce běhu, ne podle zápisu");
{
  // Vzdaný pokus (40 min) dopsaný až po nahrání dalšího běhu, ale skončil
  // dřív - limit vyčerpá právě ten pozdější běh.
  const budget = computeTimeBudget(
    [
      { id: "raiderio", clearTimeSeconds: min(90), finishedAt: at(20, 20) },
      { id: "vzdany", clearTimeSeconds: min(40), finishedAt: at(18, 40) },
    ],
    LIMIT
  );
  check(budget.overLimitIds.has("raiderio"), "přes limit je pozdější běh z Raider.io");
  check(!budget.overLimitIds.has("vzdany"), "vzdaný pokus sám limit nepřekročil");
}

console.log("6. Shodný konec - pořadí nezávisí na databázi");
{
  const runs = [
    { id: "b", clearTimeSeconds: min(70), finishedAt: at(20) },
    { id: "a", clearTimeSeconds: min(70), finishedAt: at(20) },
  ];
  const first = [...computeTimeBudget(runs, LIMIT).overLimitIds].join(",");
  const second = [...computeTimeBudget([...runs].reverse(), LIMIT).overLimitIds].join(",");
  check(first === second && first === "b", "vždy stejný běh přes limit", `${first} / ${second}`);
}

console.log("7. Počítá se do skóre?");
{
  const base = { isValid: true, points: 210, overTimeLimit: false, timeLimitOverride: false };
  check(countsForScore(base), "platný běh v limitu se počítá");
  check(!countsForScore({ ...base, isValid: false }), "neplatný ne");
  check(!countsForScore({ ...base, points: null }), "bez bodů ne");
  check(!countsForScore({ ...base, overTimeLimit: true }), "přes limit ne");
  check(
    countsForScore({ ...base, overTimeLimit: true, timeLimitOverride: true }),
    "přes limit s uznáním moderátora ano"
  );
  check(
    !countsForScore({ ...base, isValid: false, overTimeLimit: true, timeLimitOverride: true }),
    "uznání limitu neplatný běh nezplatní"
  );
}

console.log("8. Výpis herního času");
{
  const is = (seconds: number, expected: string) =>
    check(formatPlayTime(seconds) === expected, `${seconds} s je "${expected}"`, formatPlayTime(seconds));

  is(0, "0 min");
  is(min(26), "26 min");
  is(min(120), "2 h");
  is(min(94) + 20, "1 h 34 min 20 s");
  is(45, "45 s");
  is(3600 + 5, "1 h 5 s");
}

if (failures > 0) {
  console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
  process.exit(1);
}

console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
