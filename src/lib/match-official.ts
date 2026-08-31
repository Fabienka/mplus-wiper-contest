import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Přepočítá, který výsledek zápasu je ten oficiální.
 *
 * Týmu se počítá jen nejlepší platný běh. Neúspěšný pokus proto nikdy
 * nepřepíše dřív dosažený výsledek - neplatné běhy se do výběru vůbec
 * nedostanou.
 *
 * Volá se po každé změně výsledků, ať je příznak vždy odvozený od aktuálního
 * stavu a nemůže zůstat viset na smazaném běhu.
 */
export async function recomputeOfficialResult(db: DbClient, matchId: string) {
  const results = await db.matchResult.findMany({
    where: { matchId },
    select: { id: true, isValid: true, points: true },
  });

  let best: { id: string; points: number } | null = null;

  for (const result of results) {
    if (!result.isValid || result.points === null) continue;
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
