/**
 * Kontrola časovače herního času zápasu.
 *
 *   npm run check:match-timer
 */

import {
  TIMER_TOLERANCE_SECONDS,
  formatClock,
  timerCheck,
  timerElapsedSeconds,
} from "../src/lib/match-timer";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 13, 18, 0, seconds));

console.log("1. Naměřený čas");
{
  check(
    timerElapsedSeconds({ elapsedSeconds: 0, runningSince: null }, at(500)) === 0,
    "nespuštěný časovač ukazuje nulu"
  );
  check(
    timerElapsedSeconds({ elapsedSeconds: 600, runningSince: null }, at(9999)) === 600,
    "pozastavený drží naměřený čas, ať je kolik chce hodin"
  );
  check(
    timerElapsedSeconds({ elapsedSeconds: 600, runningSince: at(0) }, at(90)) === 690,
    "běžící přičítá aktuální úsek"
  );
  check(
    timerElapsedSeconds({ elapsedSeconds: 0, runningSince: at(0) }, new Date(at(0).getTime() + 1999)) === 1,
    "zlomky sekundy se nezaokrouhlují nahoru"
  );
  check(
    timerElapsedSeconds({ elapsedSeconds: 30, runningSince: at(100) }, at(50)) === 30,
    "hodiny za začátkem neubírají naměřený čas"
  );
}

console.log("2. Kontrola proti zapsaným běhům - pozastaveno");
{
  const paused = (elapsed: number, recorded: number) =>
    timerCheck({ elapsedSeconds: elapsed, recordedSeconds: recorded, running: false });

  check(paused(0, 0).kind === "idle", "nespuštěný časovač nic nekontroluje");
  check(paused(0, 1800).kind === "idle", "ani když jsou zapsané běhy - časovač se nepoužil");
  check(paused(1800, 1800).kind === "ok", "přesná shoda");
  check(paused(1810, 1800).kind === "ok", `rozdíl ${TIMER_TOLERANCE_SECONDS} s ještě projde`);
  check(paused(1790, 1800).kind === "ok", `i o ${TIMER_TOLERANCE_SECONDS} s méně projde`);

  const missing = paused(1811, 1800);
  check(
    missing.kind === "missing" && missing.diffSeconds === 11,
    "o 11 s víc na časovači = chybí běh",
    JSON.stringify(missing)
  );

  const excess = paused(1789, 1800);
  check(
    excess.kind === "excess" && excess.diffSeconds === 11,
    "o 11 s víc v bězích = nesedí časy",
    JSON.stringify(excess)
  );

  check(paused(3600, 1800).kind === "missing", "celý nezapsaný klíč");
}

console.log("3. Kontrola proti zapsaným běhům - běží");
{
  const running = (elapsed: number, recorded: number) =>
    timerCheck({ elapsedSeconds: elapsed, recordedSeconds: recorded, running: true });

  check(running(0, 0).kind === "ok", "právě spuštěný je v pořádku");
  check(running(2500, 1800).kind === "ok", "rozehraný klíč navíc nevadí");
  check(running(1789, 1800).kind === "excess", "běhy přes naměřený čas vadí i za běhu");
  check(running(1790, 1800).kind === "ok", "v toleranci i za běhu");
}

console.log("4. Ciferník");
{
  const is = (seconds: number, expected: string) =>
    check(formatClock(seconds) === expected, `${seconds} s je ${expected}`, formatClock(seconds));

  is(0, "0:00");
  is(9, "0:09");
  is(25 * 60 + 9, "25:09");
  is(3600 + 5 * 60 + 9, "1:05:09");
  is(2 * 3600, "2:00:00");
  is(-12, "-0:12");
  is(-(3600 + 1), "-1:00:01");
}

if (failures > 0) {
  console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
  process.exit(1);
}

console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
