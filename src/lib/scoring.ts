/**
 * Bodování běhů.
 *
 * Skóre se skládá ze dvou částí:
 *
 *   skóre = (výška klíče − minScoredKeyLevel) × pointsPerKeyLevel
 *           + 100 × (1 − čas běhu / časový limit klíče)
 *
 * První člen říká, jak vysoký klíč tým zaběhl. Druhý je procento limitu, které
 * tým nevyčerpal - tím se srovnají dungeony s různě dlouhým limitem, protože
 * 20 % ušetřeného času znamená v každém dungeonu totéž.
 *
 * Klíčová vlastnost: vyšší klíč porazí nižší vždycky, i kdyby ho nižší zaběhl
 * mnohem rychleji. Časový bonus je totiž vždy menší než 100 a jedna úroveň
 * klíče má hodnotu aspoň 100 (viz kontrola v parseScoringConfig).
 *
 * Modul je čistá funkce bez databáze, aby šel testovat samostatně
 * (viz scripts/check-scoring.ts).
 */

export interface ScoringConfig {
  /**
   * Nejnižší výška klíče, která se ještě boduje. Nižší klíče se nepočítají
   * vůbec, i když je tým stihne - berou se jen jako rozběh na vytažení klíče.
   * Zároveň slouží jako posun, aby nejnižší bodovaný klíč začínal na nule.
   */
  minScoredKeyLevel: number;
  /** Kolik bodů má jedna úroveň klíče. Nesmí být pod 100, viz komentář výše. */
  pointsPerKeyLevel: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  minScoredKeyLevel: 10,
  pointsPerKeyLevel: 100,
};

/** Maximum časového bonusu - odpovídá běhu o nulové délce, tedy nedosažitelné. */
export const MAX_TIME_BONUS = 100;

export class ScoringConfigError extends Error {}

/**
 * Přečte nastavení bodování ze `Season.scoringConfig` (volný JSON).
 * Chybějící hodnoty se doplní z výchozích, nesmysly se odmítnou - špatné
 * nastavení by se jinak projevilo až rozbitým žebříčkem.
 */
export function parseScoringConfig(raw: unknown): ScoringConfig {
  const source = (raw ?? {}) as Partial<Record<keyof ScoringConfig, unknown>>;

  const minScoredKeyLevel =
    source.minScoredKeyLevel === undefined
      ? DEFAULT_SCORING_CONFIG.minScoredKeyLevel
      : Number(source.minScoredKeyLevel);

  const pointsPerKeyLevel =
    source.pointsPerKeyLevel === undefined
      ? DEFAULT_SCORING_CONFIG.pointsPerKeyLevel
      : Number(source.pointsPerKeyLevel);

  if (!Number.isInteger(minScoredKeyLevel) || minScoredKeyLevel < 2) {
    throw new ScoringConfigError(
      "Nejnižší bodovaná výška klíče musí být celé číslo od 2 výš."
    );
  }

  if (!Number.isFinite(pointsPerKeyLevel) || pointsPerKeyLevel < MAX_TIME_BONUS) {
    throw new ScoringConfigError(
      `Jedna úroveň klíče musí mít aspoň ${MAX_TIME_BONUS} bodů, jinak by rychlý čas mohl přebít vyšší klíč.`
    );
  }

  return { minScoredKeyLevel, pointsPerKeyLevel };
}

export interface RunInput {
  keyLevel: number;
  clearTimeSeconds: number;
  /** Časový limit klíče podle hry pro tenhle konkrétní běh. */
  parTimeSeconds: number;
  /**
   * Verdikt hry - 0 znamená nestihnuto, 1-3 o kolik se klíč povýšil.
   * Když chybí (výsledek ze screenshotu), rozhodne se podle časů.
   */
  keystoneUpgrades?: number | null;
}

export type RunScore =
  | {
      scored: true;
      points: number;
      /** Body za výšku klíče. */
      keyLevelPoints: number;
      /** Procento limitu, které tým nevyčerpal (0 až <100). */
      timeBonus: number;
    }
  | { scored: false; reason: string };

/**
 * Ohodnotí jeden běh.
 *
 * Nestihnutý klíč i klíč pod bodovanou hranicí se schválně **nebodují nulou**,
 * ale vrátí se jako nebodované - jinak by neplatný běh dostal body za výšku
 * klíče, přestože se nemá počítat vůbec.
 */
export function scoreRun(run: RunInput, config: ScoringConfig): RunScore {
  if (!Number.isFinite(run.parTimeSeconds) || run.parTimeSeconds <= 0) {
    return { scored: false, reason: "U běhu chybí časový limit klíče." };
  }

  if (!Number.isFinite(run.clearTimeSeconds) || run.clearTimeSeconds <= 0) {
    return { scored: false, reason: "U běhu chybí čas doběhnutí." };
  }

  if (!Number.isInteger(run.keyLevel) || run.keyLevel < 2) {
    return { scored: false, reason: "Neplatná výška klíče." };
  }

  // Verdikt hry má přednost před porovnáním časů - odpadá dohadování, co
  // znamená doběh přesně na limitu, a nezávisí to na našem uloženém čase.
  const timed =
    run.keystoneUpgrades === null || run.keystoneUpgrades === undefined
      ? run.clearTimeSeconds <= run.parTimeSeconds
      : run.keystoneUpgrades >= 1;

  if (!timed) {
    return { scored: false, reason: "Klíč nebyl stihnutý v časovém limitu." };
  }

  if (run.keyLevel < config.minScoredKeyLevel) {
    return {
      scored: false,
      reason: `Bodují se až klíče od +${config.minScoredKeyLevel}.`,
    };
  }

  const keyLevelPoints =
    (run.keyLevel - config.minScoredKeyLevel) * config.pointsPerKeyLevel;

  // Běh stihnutý v limitu má poměr <= 1, takže bonus vyjde 0 až 100.
  const timeBonus = MAX_TIME_BONUS * (1 - run.clearTimeSeconds / run.parTimeSeconds);

  return {
    scored: true,
    points: keyLevelPoints + timeBonus,
    keyLevelPoints,
    timeBonus,
  };
}

export interface ScoredRun<T> {
  run: T;
  score: RunScore;
}

export function scoreRuns<T extends RunInput>(
  runs: T[],
  config: ScoringConfig
): ScoredRun<T>[] {
  return runs.map((run) => ({ run, score: scoreRun(run, config) }));
}

/**
 * Nejlepší z běhů - týmu se počítá jen ten. Nebodované běhy se ignorují,
 * takže neúspěšný pokus nemůže tým připravit o dřív dosažené skóre.
 *
 * Při shodě bodů vyhrává dřívější běh v pořadí, ať je výběr stabilní.
 */
export function bestRun<T>(scored: ScoredRun<T>[]): ScoredRun<T> | null {
  let best: ScoredRun<T> | null = null;

  for (const entry of scored) {
    if (!entry.score.scored) continue;
    if (best === null) {
      best = entry;
      continue;
    }

    const bestPoints = best.score.scored ? best.score.points : -Infinity;
    if (entry.score.points > bestPoints) best = entry;
  }

  return best;
}
