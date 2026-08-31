/**
 * Žebříček týmů.
 *
 * Soutěž je postavená na jednom výkonu: tým má v termínu zhruba dvě hodiny na
 * to, aby zaběhl co nejlepší klíč. Do žebříčku se proto počítá **jediný
 * nejlepší platný běh celé sezóny**, ne součet přes zápasy.
 *
 * Modul je čistá funkce bez databáze (viz scripts/check-leaderboard.ts).
 */

export interface TeamResultEntry {
  matchId: string;
  dungeonName: string;
  keyLevel: number;
  clearTimeSeconds: number;
  points: number | null;
  isValid: boolean;
  completedAt: Date;
}

export interface TeamEntry {
  teamId: string;
  teamName: string;
  results: TeamResultEntry[];
}

export interface LeaderboardRow {
  /** Pořadí od 1. Null u týmu, který zatím nemá platný běh. */
  rank: number | null;
  teamId: string;
  teamName: string;
  /** Nejlepší platný běh sezóny, podle kterého se řadí. */
  best: TeamResultEntry | null;
  totalRuns: number;
  validRuns: number;
}

/**
 * Nejlepší platný běh týmu. Neplatné běhy se ignorují - neúspěšný pokus
 * o vyšší klíč tým o dřív dosažený výsledek nepřipraví.
 *
 * Při shodě bodů vyhrává dřívější běh: kdo výkonu dosáhl první.
 */
function bestOf(results: TeamResultEntry[]): TeamResultEntry | null {
  let best: TeamResultEntry | null = null;

  for (const result of results) {
    if (!result.isValid || result.points === null) continue;

    if (
      best === null ||
      result.points > best.points! ||
      (result.points === best.points && result.completedAt < best.completedAt)
    ) {
      best = result;
    }
  }

  return best;
}

export function buildLeaderboard(teams: TeamEntry[]): LeaderboardRow[] {
  const rows = teams.map((team) => {
    const best = bestOf(team.results);
    return {
      rank: null as number | null,
      teamId: team.teamId,
      teamName: team.teamName,
      best,
      totalRuns: team.results.length,
      validRuns: team.results.filter((r) => r.isValid && r.points !== null).length,
    };
  });

  rows.sort((a, b) => {
    // Týmy bez platného běhu jdou nakonec, ale ze žebříčku nevypadnou -
    // odehráno mají, jen jim zatím nic neuznali.
    if (a.best && !b.best) return -1;
    if (!a.best && b.best) return 1;

    if (a.best && b.best) {
      if (b.best.points! !== a.best.points!) return b.best.points! - a.best.points!;
      // Shoda bodů: dřívější běh napřed, pak podle jména kvůli stabilitě.
      const rozdilCasu = a.best.completedAt.getTime() - b.best.completedAt.getTime();
      if (rozdilCasu !== 0) return rozdilCasu;
    }

    return a.teamName.localeCompare(b.teamName, "cs");
  });

  // Stejné body = sdílené umístění (1., 2., 2., 4.).
  let poradi = 0;
  let predchoziBody: number | null = null;

  rows.forEach((row, index) => {
    if (!row.best) {
      row.rank = null;
      return;
    }

    if (predchoziBody === null || row.best.points !== predchoziBody) {
      poradi = index + 1;
      predchoziBody = row.best.points;
    }

    row.rank = poradi;
  });

  return rows;
}
