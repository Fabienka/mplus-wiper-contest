import { formatPlayTime, type TimeBudget } from "@/lib/time-budget";

/**
 * Herní čas zápasu jednou větou - pro tým i pro moderátora u zápasu.
 * Vyčerpaný limit je červeně: další běhy se už nepočítají.
 */
export function TimeBudgetLine({ budget }: { budget: TimeBudget }) {
  const exhausted = budget.remainingSeconds === 0;

  return (
    <p className={`time-budget${exhausted ? " time-budget-over" : ""}`}>
      Herní čas: využito <strong>{formatPlayTime(budget.usedSeconds)}</strong> z{" "}
      {formatPlayTime(budget.limitSeconds)}
      {exhausted
        ? " - limit je vyčerpaný, další běhy se nepočítají."
        : `, zbývá ${formatPlayTime(budget.remainingSeconds)}.`}
    </p>
  );
}
