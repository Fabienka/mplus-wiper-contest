/**
 * Časový limit zápasu.
 *
 * Tým má na zápas omezený herní čas (ScoringConfig.timeBudgetMinutes). Čerpá
 * ho časem na časovači pokusů, které k zápasu patří (countsTowardTimeLimit):
 * začaly v termínu, hraje je tým a dungeon je v rotaci - bodované,
 * nestihnuté i vzdané. Běhy mimo termín ho nečerpají, pauzy mezi klíči taky ne.
 *
 * Běh, kterým tým limit překročí, a všechny po něm se nepočítají
 * (MatchResult.overTimeLimit). Moderátor je může uznat ručně
 * (timeLimitOverride).
 *
 * Pořadí rozhoduje konec běhu, ne okamžik zápisu: vzdaný pokus zapsaný
 * dodatečně může limit vyčerpat i běhu, který byl nahraný dřív. Proto se
 * limit přepočítává nad celým zápasem po každé změně (recomputeTimeBudget).
 *
 * Modul je čistý, testuje ho scripts/check-time-budget.ts.
 */

/** Proč se běh přes limit nepočítá - u výsledku i v hlášce týmu. */
export const OVER_TIME_LIMIT_REASON = "Tým tímhle během vyčerpal herní čas zápasu.";

export interface BudgetRun {
  id: string;
  clearTimeSeconds: number;
  /** Konec běhu; u starších záznamů bez něj čas zápisu. */
  finishedAt: Date;
}

/** Výsledek z databáze ve tvaru pro computeTimeBudget. */
export function budgetRunOf(result: {
  id: string;
  clearTimeSeconds: number;
  completedAt: Date | null;
  createdAt: Date;
}): BudgetRun {
  return {
    id: result.id,
    clearTimeSeconds: result.clearTimeSeconds,
    finishedAt: result.completedAt ?? result.createdAt,
  };
}

/**
 * Běhy zápasu, které ubírají z herního času, ve tvaru pro computeTimeBudget.
 * Běhy mimo termín (countsTowardTimeLimit = false) se vynechají úplně.
 */
export function budgetRunsOf(
  results: {
    id: string;
    clearTimeSeconds: number;
    completedAt: Date | null;
    createdAt: Date;
    countsTowardTimeLimit: boolean;
  }[]
): BudgetRun[] {
  return results.filter((result) => result.countsTowardTimeLimit).map(budgetRunOf);
}

/** Herní čas pro výpis: "1 h 34 min", u zbytku sekund "1 h 34 min 20 s". */
export function formatPlayTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0 || (hours === 0 && rest === 0)) parts.push(`${minutes} min`);
  if (rest > 0) parts.push(`${rest} s`);
  return parts.join(" ");
}

export interface TimeBudget {
  limitSeconds: number;
  usedSeconds: number;
  /** Nikdy pod nulou - přečerpání ukazuje overLimitIds. */
  remainingSeconds: number;
  /** Běhy, kterými (nebo po kterých) tým limit překročil. */
  overLimitIds: Set<string>;
}

export function computeTimeBudget(runs: BudgetRun[], limitSeconds: number): TimeBudget {
  // Při shodném konci rozhoduje id, ať výsledek nezávisí na pořadí z databáze.
  const ordered = [...runs].sort(
    (a, b) => a.finishedAt.getTime() - b.finishedAt.getTime() || a.id.localeCompare(b.id)
  );

  let usedSeconds = 0;
  const overLimitIds = new Set<string>();

  for (const run of ordered) {
    usedSeconds += Math.max(0, run.clearTimeSeconds);
    // Běh, který limit přetáhne, se nepočítá celý - i když začal ještě
    // v limitu. Jinak by šlo poslední klíč natáhnout libovolně.
    if (usedSeconds > limitSeconds) overLimitIds.add(run.id);
  }

  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usedSeconds),
    overLimitIds,
  };
}

/**
 * Počítá se výsledek do skóre?
 *
 * Musí být platný a mít body. Běh přes časový limit jen tehdy, když ho
 * moderátor výslovně uznal i přes limit.
 */
export function countsForScore(result: {
  isValid: boolean;
  points: number | null;
  overTimeLimit: boolean;
  timeLimitOverride: boolean;
}): boolean {
  if (!result.isValid || result.points === null) return false;
  return !result.overTimeLimit || result.timeLimitOverride;
}
