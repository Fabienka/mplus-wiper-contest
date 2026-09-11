/**
 * Časovač herního času zápasu.
 *
 * Admin nebo moderátor ho na detailu týmu pouští a pozastavuje, aby měl po
 * ruce, kolik času týmu zbývá. Zároveň hlídá, jestli naměřený čas sedí na
 * součet zapsaných běhů - nesoulad znamená nezapsaný běh nebo špatný čas.
 *
 * Stav se drží u zápasu (Match.timerElapsedSeconds + timerStartedAt), takže
 * ho vidí každý ze staffu stejně a nezastaví ho obnovení stránky.
 *
 * Modul je čistý, testuje ho scripts/check-match-timer.ts.
 */

/** Povolený rozdíl mezi časovačem a zapsanými běhy, včetně. */
export const TIMER_TOLERANCE_SECONDS = 10;

/** Naměřený čas v celých sekundách - dřívější úseky plus právě běžící. */
export function timerElapsedSeconds(
  state: { elapsedSeconds: number; runningSince: Date | null },
  now: Date
): number {
  const running = state.runningSince
    ? Math.max(0, now.getTime() - state.runningSince.getTime()) / 1000
    : 0;

  return state.elapsedSeconds + Math.floor(running);
}

export type TimerCheck =
  /** Časovač ještě nikdo nespustil - není co porovnávat. */
  | { kind: "idle" }
  | { kind: "ok" }
  /** Časovač naměřil víc, než dávají zapsané běhy - chybí běh, nebo čas nesedí. */
  | { kind: "missing"; diffSeconds: number }
  /** Zapsané běhy dávají víc, než naměřil časovač - nesedí časy. */
  | { kind: "excess"; diffSeconds: number };

/**
 * Sedí časovač na zapsané běhy?
 *
 * Když časovač běží, tým nejspíš právě hraje klíč, který ještě není zapsaný -
 * že časovač ukazuje víc, je v tu chvíli normální. Hlídá se proto jen opačný
 * směr. Po pozastavení se porovnává oběma směry.
 */
export function timerCheck({
  elapsedSeconds,
  recordedSeconds,
  running,
}: {
  elapsedSeconds: number;
  recordedSeconds: number;
  running: boolean;
}): TimerCheck {
  if (elapsedSeconds === 0 && !running) return { kind: "idle" };

  const diff = elapsedSeconds - recordedSeconds;

  if (-diff > TIMER_TOLERANCE_SECONDS) return { kind: "excess", diffSeconds: -diff };
  if (!running && diff > TIMER_TOLERANCE_SECONDS) {
    return { kind: "missing", diffSeconds: diff };
  }

  return { kind: "ok" };
}

/** Ciferník: "1:05:09", "25:09", u přečerpání "-0:12". */
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.abs(Math.trunc(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return hours > 0
    ? `${sign}${hours}:${pad(minutes)}:${pad(rest)}`
    : `${sign}${minutes}:${pad(rest)}`;
}
