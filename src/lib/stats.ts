import type { SpecRole } from "@prisma/client";
import { findSpec } from "./wow-specs";

/**
 * Souhrny o složení pole přihlášených - co hrají za classy, jak je pole
 * rozložené mezi role a jestli jsou v něm potřebné schopnosti.
 *
 * Modul je čistá funkce bez databáze, aby šel testovat samostatně
 * (viz scripts/check-stats.ts).
 */

export interface StatsPlayer {
  className: string | null;
  wowSpec: string | null;
  specRole: SpecRole;
  rioScore: number | null;
}

export interface SpecCount {
  className: string;
  specName: string;
  count: number;
}

export interface PoolStats {
  total: number;
  byRole: Record<SpecRole, number>;
  /** Nejčastější specy v každé roli, od nejčastějšího. */
  topSpecs: Record<SpecRole, SpecCount[]>;
  classCounts: { className: string; count: number }[];
  range: { melee: number; ranged: number; unknown: number };
  /** Kolik postav umí danou schopnost - vypovídá o skladbě pole. */
  coverage: { battleRez: number; bloodlust: number };
  rio: { highest: number; lowest: number; average: number } | null;
}

const ROLES: SpecRole[] = ["TANK", "HEALER", "DPS"];

/** Seřadí podle počtu sestupně, při shodě abecedně - ať je pořadí stabilní. */
function sortByCount<T extends { count: number }>(items: T[], name: (item: T) => string) {
  return items.sort((a, b) => b.count - a.count || name(a).localeCompare(name(b)));
}

export function computePoolStats(players: StatsPlayer[]): PoolStats {
  const byRole: Record<SpecRole, number> = { TANK: 0, HEALER: 0, DPS: 0 };
  const specTally = new Map<string, SpecCount & { role: SpecRole }>();
  const classTally = new Map<string, number>();
  const range = { melee: 0, ranged: 0, unknown: 0 };
  const coverage = { battleRez: 0, bloodlust: 0 };
  const scores: number[] = [];

  for (const player of players) {
    byRole[player.specRole]++;

    if (player.className) {
      classTally.set(player.className, (classTally.get(player.className) ?? 0) + 1);
    }

    const spec = findSpec(player.className, player.wowSpec);

    if (!spec) {
      range.unknown++;
    } else {
      if (spec.range === "MELEE") range.melee++;
      else range.ranged++;

      if (spec.battleRez) coverage.battleRez++;
      if (spec.bloodlust) coverage.bloodlust++;

      const key = `${spec.className}|${spec.specName}`;
      const found = specTally.get(key);
      if (found) found.count++;
      else
        specTally.set(key, {
          className: spec.className,
          specName: spec.specName,
          count: 1,
          // Role se bere ze specu, ne z přihlášky - kdyby se rozcházely,
          // do statistiky patří to, co postava reálně hraje.
          role: spec.role,
        });
    }

    if (player.rioScore !== null && Number.isFinite(player.rioScore)) {
      scores.push(player.rioScore);
    }
  }

  const topSpecs = {} as Record<SpecRole, SpecCount[]>;
  for (const role of ROLES) {
    topSpecs[role] = sortByCount(
      [...specTally.values()].filter((s) => s.role === role).map(({ role: _r, ...rest }) => rest),
      (s) => `${s.className} ${s.specName}`
    );
  }

  const classCounts = sortByCount(
    [...classTally.entries()].map(([className, count]) => ({ className, count })),
    (c) => c.className
  );

  return {
    total: players.length,
    byRole,
    topSpecs,
    classCounts,
    range,
    coverage,
    rio: scores.length
      ? {
          highest: Math.max(...scores),
          lowest: Math.min(...scores),
          average: scores.reduce((sum, s) => sum + s, 0) / scores.length,
        }
      : null,
  };
}
