import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_SCORING_CONFIG, parseScoringConfig } from "./scoring";
import { budgetRunsOf, computeTimeBudget, countsForScore } from "./time-budget";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Přepočítá, který výsledek zápasu je ten oficiální.
 *
 * Týmu se počítá jen nejlepší běh, který se počítá do skóre - platný, s body
 * a v herním čase zápasu (countsForScore). Neúspěšný pokus proto nikdy
 * nepřepíše dřív dosažený výsledek.
 *
 * Volá se po každé změně výsledků, ať je příznak vždy odvozený od aktuálního
 * stavu a nemůže zůstat viset na smazaném běhu.
 */
export async function recomputeOfficialResult(db: DbClient, matchId: string) {
  const results = await db.matchResult.findMany({
    where: { matchId },
    select: {
      id: true,
      isValid: true,
      points: true,
      overTimeLimit: true,
      timeLimitOverride: true,
    },
  });

  let best: { id: string; points: number } | null = null;

  for (const result of results) {
    if (!countsForScore(result) || result.points === null) continue;
    if (best === null || result.points > best.points) {
      best = { id: result.id, points: result.points };
    }
  }

  const shouldBeOfficial = new Set(best ? [best.id] : []);

  // Aktualizuje se jen to, co se opravdu mění - ať audit i případné hooky
  // nevidí zbytečné zápisy.
  for (const result of results) {
    const next = shouldBeOfficial.has(result.id);
    await db.matchResult.updateMany({
      where: { id: result.id, isOfficial: { not: next } },
      data: { isOfficial: next },
    });
  }

  return best;
}

/**
 * Přepočítá herní čas zápasu - kterým během tým limit vyčerpal
 * (MatchResult.overTimeLimit).
 *
 * Počítá se nad celým zápasem, protože pořadí rozhoduje konec běhu:
 * dodatečně zapsaný vzdaný pokus může limit vyčerpat i běhu nahranému dřív.
 */
export async function recomputeTimeBudget(db: DbClient, matchId: string) {
  const match = await db.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { team: { select: { season: { select: { scoringConfig: true } } } } },
  });

  // Rozbité nastavení sezóny nesmí zablokovat zápis výsledku - platí výchozí
  // limit a admin chybu uvidí v administraci sezóny.
  let config = DEFAULT_SCORING_CONFIG;
  try {
    config = parseScoringConfig(match.team.season.scoringConfig);
  } catch {
    config = DEFAULT_SCORING_CONFIG;
  }

  const results = await db.matchResult.findMany({
    where: { matchId },
    select: {
      id: true,
      clearTimeSeconds: true,
      completedAt: true,
      createdAt: true,
      overTimeLimit: true,
      countsTowardTimeLimit: true,
    },
  });

  // Běhy mimo termín se do herního času nepočítají, a tak ani nemůžou být
  // přes limit.
  const budget = computeTimeBudget(budgetRunsOf(results), config.timeBudgetMinutes * 60);

  for (const result of results) {
    const next = budget.overLimitIds.has(result.id);
    if (result.overTimeLimit !== next) {
      await db.matchResult.update({ where: { id: result.id }, data: { overTimeLimit: next } });
    }
  }

  return budget;
}

/**
 * Po každé změně výsledků zápasu: nejdřív herní čas, pak oficiální výsledek -
 * ten na limitu závisí.
 */
export async function recomputeMatchResults(db: DbClient, matchId: string) {
  const budget = await recomputeTimeBudget(db, matchId);
  await recomputeOfficialResult(db, matchId);
  return budget;
}
