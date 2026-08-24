import type { SpecRole } from "@prisma/client";
import { findSpec, type WowSpec } from "./wow-specs";

/**
 * Shuffle - rozdělení schválených hráčů do týmů po 5 (1 tank, 1 healer, 3 DPS).
 *
 * Algoritmus nevrací jedno "správné" řešení. Vygeneruje N náhodných kandidátů,
 * každého zlepší lokálním prohledáváním, ohodnotí podle prioritizovaných
 * pravidel a vrátí 3 nejlepší vzájemně odlišné varianty adminovi na výběr.
 *
 * Modul je čistá funkce bez závislosti na databázi, aby šel testovat samostatně
 * (viz scripts/check-shuffle.ts).
 */

export type DpsBucket = "A" | "B" | "C";

export interface ShufflePlayer {
  characterId: string;
  characterName: string;
  className: string | null;
  wowSpec: string | null;
  specRole: SpecRole;
  rioScore: number;
}

export interface ShuffleMember {
  characterId: string;
  roleInTeam: SpecRole;
  /** Snapshot v době shuffle - postava se může později přejmenovat/přespecovat. */
  characterName: string;
  className: string | null;
  wowSpec: string | null;
  rioScore: number;
  dpsBucket: DpsBucket | null;
}

export interface ShuffleTeam {
  teamIndex: number;
  members: ShuffleMember[];
  violations: string[];
}

export interface ShuffleVariant {
  variantNumber: number;
  score: number;
  /** Kolikrát bylo které pravidlo porušené - čitelnější než samotné score. */
  breakdown: {
    dpsBucketCoverage: number;
    rangedMeleeBalance: number;
    battleRezOrBloodlust: number;
    duplicateDpsClass: number;
  };
  teams: ShuffleTeam[];
  substitutes: ShuffleMember[];
}

/**
 * Tvar JSON sloupců ShuffleProposal. Je to snapshot stavu v době shuffle -
 * jména, specy a RIO se od té doby můžou změnit, ale návrh má zůstat čitelný
 * tak, jak ho admin viděl.
 */
export interface StoredTeamAssignments {
  teamCount: number;
  teams: ShuffleTeam[];
  substitutes: ShuffleMember[];
}

export interface StoredRuleViolations {
  breakdown: ShuffleVariant["breakdown"];
  /** Varování k celému běhu (málo healerů, neznámé specy, ...). */
  warnings: string[];
}

export interface ShuffleResult {
  seed: number;
  teamCount: number;
  variants: ShuffleVariant[];
  warnings: string[];
  pool: {
    total: number;
    tanks: number;
    healers: number;
    dps: number;
    bucketSizes: Record<DpsBucket, number>;
  };
}

// ---------- Interní typy ----------

const CATEGORIES = ["TANK", "HEALER", "DPS_A", "DPS_B", "DPS_C"] as const;
type SlotCategory = (typeof CATEGORIES)[number];

const DPS_CATEGORY: Record<DpsBucket, SlotCategory> = {
  A: "DPS_A",
  B: "DPS_B",
  C: "DPS_C",
};

interface PoolPlayer extends ShufflePlayer {
  bucket: DpsBucket | null;
  /** Předpočítané, ať se v horké smyčce nehledá v mapě znovu. */
  spec: WowSpec | null;
}

type Pools = Record<SlotCategory, PoolPlayer[]>;

interface Candidate {
  assigned: Record<SlotCategory, PoolPlayer[]>;
  leftovers: Record<SlotCategory, PoolPlayer[]>;
}

interface TeamSlots {
  tank: PoolPlayer;
  healer: PoolPlayer;
  dps: PoolPlayer[];
}

/** Penalizace jednoho týmu, po pravidlech. Nižší = lepší. */
interface TeamPenalty {
  /** Pravidlo 1: kolik ze tří košů A/B/C mezi DPS chybí (0-2). */
  r1: number;
  /** Pravidlo 2: nevyváženost melee/ranged v půlbodech (0-8). */
  r2: number;
  /** Pravidlo 3: chybí battle rez (1) + chybí bloodlust (1). */
  r3: number;
  /** Pravidlo 4: počet dvojic DPS se stejnou class (0-3). */
  r4: number;
}

// ---------- Nastavení ----------

const DEFAULT_CANDIDATES = 300;
const MAX_IMPROVEMENT_PASSES = 20;
const VARIANTS_WANTED = 3;

/**
 * Do poměru melee/ranged se počítá i tank a healer, ale s poloviční vahou -
 * melee tank vadí míň než melee DPS. Váhy jsou zdvojené, aby zůstaly celočíselné.
 */
const RANGE_WEIGHT_DPS = 2;
const RANGE_WEIGHT_SUPPORT = 1;

/** Od jaké nevyváženosti se poměr melee/ranged hlásí adminovi jako problém. */
const IMBALANCE_REPORT_THRESHOLD = 4;

// ---------- Náhoda ----------

/** mulberry32 - malý deterministický PRNG, aby šel shuffle zopakovat ze seedu. */
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Koše ----------

/**
 * DPS se seřadí podle RIO sestupně a rozdělí na tři přibližně stejné části
 * (A = nejvyšší třetina). Zbytek po dělení třemi dostávají odshora koše A a B.
 */
function splitDpsIntoBuckets(dps: PoolPlayer[]): Record<DpsBucket, PoolPlayer[]> {
  const sorted = [...dps].sort(
    // Shodné RIO se rozhoduje podle id, ať je rozdělení do košů deterministické.
    (a, b) => b.rioScore - a.rioScore || a.characterId.localeCompare(b.characterId)
  );

  const base = Math.floor(sorted.length / 3);
  const rest = sorted.length % 3;
  const sizes: Record<DpsBucket, number> = {
    A: base + (rest > 0 ? 1 : 0),
    B: base + (rest > 1 ? 1 : 0),
    C: base,
  };

  let offset = 0;
  const buckets = {} as Record<DpsBucket, PoolPlayer[]>;

  for (const bucket of ["A", "B", "C"] as DpsBucket[]) {
    buckets[bucket] = sorted.slice(offset, offset + sizes[bucket]);
    for (const player of buckets[bucket]) {
      player.bucket = bucket;
    }
    offset += sizes[bucket];
  }

  return buckets;
}

// ---------- Hodnocení ----------

function evaluateTeam(slots: TeamSlots): TeamPenalty {
  const { tank, healer, dps } = slots;

  // Pravidlo 1 - pokrytí košů A/B/C
  const buckets = new Set(dps.map((p) => p.bucket).filter(Boolean));
  const r1 = 3 - buckets.size;

  // Pravidlo 2 - poměr melee/ranged (postavy s neznámým specem se nepočítají)
  let melee = 0;
  let ranged = 0;
  const weigh = (player: PoolPlayer, weight: number) => {
    if (!player.spec) return;
    if (player.spec.range === "MELEE") melee += weight;
    else ranged += weight;
  };
  weigh(tank, RANGE_WEIGHT_SUPPORT);
  weigh(healer, RANGE_WEIGHT_SUPPORT);
  for (const player of dps) weigh(player, RANGE_WEIGHT_DPS);
  const r2 = Math.abs(melee - ranged);

  // Pravidlo 3 - battle rez a bloodlust
  const all = [tank, healer, ...dps];
  const hasBattleRez = all.some((p) => p.spec?.battleRez);
  const hasBloodlust = all.some((p) => p.spec?.bloodlust);
  const r3 = (hasBattleRez ? 0 : 1) + (hasBloodlust ? 0 : 1);

  // Pravidlo 4 - opakující se class mezi DPS (tank a healer jsou vyjmuti)
  let r4 = 0;
  for (let i = 0; i < dps.length; i++) {
    for (let j = i + 1; j < dps.length; j++) {
      if (dps[i].className && dps[i].className === dps[j].className) r4++;
    }
  }

  return { r1, r2, r3, r4 };
}

interface Weights {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
}

/**
 * Váhy pravidel.
 *
 * Zadání navrhovalo pevné 1000/100/10/1, jenže penalizace se sčítají přes
 * všechny týmy - při větším počtu týmů by se součet nižšího pravidla přes
 * několik týmů vyhoupl nad jediné porušení vyššího pravidla a algoritmus by
 * vyšší pravidlo obětoval. Váhy se proto odvozují z maximální možné penalizace
 * všech nižších pravidel dohromady. Tím je pořadí kandidátů podle score přesně
 * lexikografické: rozhoduje pravidlo 1, při shodě pravidlo 2 atd. - bez ohledu
 * na počet týmů.
 */
function makeWeights(teamCount: number): Weights {
  const teams = Math.max(teamCount, 1);
  const maxR4 = 3 * teams;
  const w3 = maxR4 + 1;
  const maxR3 = 2 * teams * w3 + maxR4;
  const w2 = maxR3 + 1;
  const maxR2 = 8 * teams * w2 + maxR3;
  const w1 = maxR2 + 1;
  return { w1, w2, w3, w4: 1 };
}

function penaltyScore(penalty: TeamPenalty, weights: Weights): number {
  return (
    penalty.r1 * weights.w1 +
    penalty.r2 * weights.w2 +
    penalty.r3 * weights.w3 +
    penalty.r4 * weights.w4
  );
}

// ---------- Kandidáti ----------

function slotsAt(candidate: Candidate, teamIndex: number): TeamSlots {
  return {
    tank: candidate.assigned.TANK[teamIndex],
    healer: candidate.assigned.HEALER[teamIndex],
    dps: [
      candidate.assigned.DPS_A[teamIndex],
      candidate.assigned.DPS_B[teamIndex],
      candidate.assigned.DPS_C[teamIndex],
    ],
  };
}

function totalScore(candidate: Candidate, teamCount: number, weights: Weights): number {
  let total = 0;
  for (let t = 0; t < teamCount; t++) {
    total += penaltyScore(evaluateTeam(slotsAt(candidate, t)), weights);
  }
  return total;
}

function generateCandidate(pools: Pools, teamCount: number, rng: () => number): Candidate {
  const assigned = {} as Candidate["assigned"];
  const leftovers = {} as Candidate["leftovers"];

  for (const category of CATEGORIES) {
    const order = shuffled(pools[category], rng);
    assigned[category] = order.slice(0, teamCount);
    leftovers[category] = order.slice(teamCount);
  }

  return { assigned, leftovers };
}

/**
 * Lokální zlepšování - zkouší prohodit dva hráče ve stejné kategorii (stejná
 * role, u DPS navíc stejný koš) mezi týmy, případně hráče v týmu za náhradníka
 * ze stejné kategorie. Prohození uvnitř kategorie nemůže porušit tvrdé pravidlo
 * ani pokrytí košů, takže kandidát zůstává platný.
 *
 * Bez tohohle kroku by čistě náhodné losování muselo generovat řádově víc
 * kandidátů, aby našlo srovnatelně dobré rozdělení.
 */
function improveCandidate(candidate: Candidate, teamCount: number, weights: Weights): number {
  const scoreTeam = (teamIndex: number) =>
    penaltyScore(evaluateTeam(slotsAt(candidate, teamIndex)), weights);

  const scores = Array.from({ length: teamCount }, (_, t) => scoreTeam(t));

  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
    let improved = false;

    for (const category of CATEGORIES) {
      const slots = candidate.assigned[category];
      const bench = candidate.leftovers[category];

      for (let a = 0; a < teamCount; a++) {
        for (let b = a + 1; b < teamCount; b++) {
          const before = scores[a] + scores[b];
          [slots[a], slots[b]] = [slots[b], slots[a]];
          const afterA = scoreTeam(a);
          const afterB = scoreTeam(b);

          if (afterA + afterB < before) {
            scores[a] = afterA;
            scores[b] = afterB;
            improved = true;
          } else {
            [slots[a], slots[b]] = [slots[b], slots[a]];
          }
        }
      }

      for (let a = 0; a < teamCount; a++) {
        for (let i = 0; i < bench.length; i++) {
          const before = scores[a];
          [slots[a], bench[i]] = [bench[i], slots[a]];
          const after = scoreTeam(a);

          if (after < before) {
            scores[a] = after;
            improved = true;
          } else {
            [slots[a], bench[i]] = [bench[i], slots[a]];
          }
        }
      }
    }

    if (!improved) break;
  }

  return scores.reduce((sum, value) => sum + value, 0);
}

// ---------- Odlišnost variant ----------

function teamSignatures(candidate: Candidate, teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, t) => {
    const slots = slotsAt(candidate, t);
    return [slots.tank, slots.healer, ...slots.dps]
      .map((p) => p.characterId)
      .sort()
      .join(",");
  }).sort();
}

/**
 * Varianty se musí lišit víc než prohozením dvou hráčů. Jedno prohození změní
 * přesně dva týmy, takže se vyžadují aspoň tři odlišné týmy (u méně než tří
 * týmů stačí jakýkoli rozdíl - víc jich nejde dosáhnout).
 */
function isDistinctEnough(a: string[], b: string[], teamCount: number): boolean {
  const remaining = [...b];
  let shared = 0;

  for (const signature of a) {
    const index = remaining.indexOf(signature);
    if (index !== -1) {
      remaining.splice(index, 1);
      shared++;
    }
  }

  return teamCount - shared >= Math.min(3, teamCount);
}

// ---------- Popisy porušených pravidel ----------

function describeViolations(slots: TeamSlots, penalty: TeamPenalty): string[] {
  const violations: string[] = [];
  const { tank, healer, dps } = slots;
  const all = [tank, healer, ...dps];

  if (penalty.r1 > 0) {
    const buckets = dps.map((p) => p.bucket ?? "?").join(", ");
    violations.push(`DPS nepokrývají všechny tři koše (${buckets})`);
  }

  if (penalty.r2 >= IMBALANCE_REPORT_THRESHOLD) {
    const melee = all.filter((p) => p.spec?.range === "MELEE").length;
    const ranged = all.filter((p) => p.spec?.range === "RANGED").length;
    violations.push(
      `Nevyvážený poměr melee/ranged (${melee} melee / ${ranged} ranged včetně tanka a healera)`
    );
  }

  if (!all.some((p) => p.spec?.battleRez)) {
    violations.push("Chybí battle rez");
  }

  if (!all.some((p) => p.spec?.bloodlust)) {
    violations.push("Chybí bloodlust/heroism (pokud tým nepoužije drums)");
  }

  if (penalty.r4 > 0) {
    const counts = new Map<string, number>();
    for (const player of dps) {
      if (player.className) {
        counts.set(player.className, (counts.get(player.className) ?? 0) + 1);
      }
    }
    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([className, count]) => `${className} ${count}×`)
      .join(", ");
    violations.push(`Stejná class u DPS: ${duplicates}`);
  }

  const unknown = all.filter((p) => !p.spec);
  if (unknown.length > 0) {
    violations.push(
      `Neznámý spec u: ${unknown.map((p) => p.characterName).join(", ")} - pravidla o poměru a schopnostech je nezapočítala`
    );
  }

  return violations;
}

// ---------- Převod na výstup ----------

function toMember(player: PoolPlayer, roleInTeam: SpecRole): ShuffleMember {
  return {
    characterId: player.characterId,
    roleInTeam,
    characterName: player.characterName,
    className: player.className,
    wowSpec: player.wowSpec,
    rioScore: player.rioScore,
    dpsBucket: player.bucket,
  };
}

function toVariant(
  candidate: Candidate,
  variantNumber: number,
  teamCount: number,
  weights: Weights
): ShuffleVariant {
  const teams: ShuffleTeam[] = [];
  const breakdown = {
    dpsBucketCoverage: 0,
    rangedMeleeBalance: 0,
    battleRezOrBloodlust: 0,
    duplicateDpsClass: 0,
  };
  let score = 0;

  for (let t = 0; t < teamCount; t++) {
    const slots = slotsAt(candidate, t);
    const penalty = evaluateTeam(slots);
    score += penaltyScore(penalty, weights);

    if (penalty.r1 > 0) breakdown.dpsBucketCoverage++;
    if (penalty.r2 >= IMBALANCE_REPORT_THRESHOLD) breakdown.rangedMeleeBalance++;
    if (penalty.r3 > 0) breakdown.battleRezOrBloodlust++;
    if (penalty.r4 > 0) breakdown.duplicateDpsClass++;

    teams.push({
      teamIndex: t,
      members: [
        toMember(slots.tank, "TANK"),
        toMember(slots.healer, "HEALER"),
        ...slots.dps.map((player) => toMember(player, "DPS")),
      ],
      violations: describeViolations(slots, penalty),
    });
  }

  const substitutes = CATEGORIES.flatMap((category) =>
    candidate.leftovers[category].map((player) =>
      toMember(player, category === "TANK" ? "TANK" : category === "HEALER" ? "HEALER" : "DPS")
    )
  ).sort((a, b) => b.rioScore - a.rioScore);

  return { variantNumber, score, breakdown, teams, substitutes };
}

// ---------- Hlavní vstupní bod ----------

export interface ShuffleOptions {
  /** Kolik náhodných kandidátů vygenerovat před výběrem nejlepších. */
  candidateCount?: number;
  /** Vlastní seed - stejný seed a stejný vstup dají stejné varianty. */
  seed?: number;
  /**
   * Vypnutí lokálního zlepšování - jen pro měření, jak moc pomáhá
   * (viz scripts/check-shuffle.ts). V provozu se nechává zapnuté.
   */
  localSearch?: boolean;
}

export function runShuffle(
  players: ShufflePlayer[],
  options: ShuffleOptions = {}
): ShuffleResult {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const candidateCount = options.candidateCount ?? DEFAULT_CANDIDATES;
  const rng = createRng(seed);
  const warnings: string[] = [];

  const pool: PoolPlayer[] = players.map((player) => ({
    ...player,
    bucket: null,
    spec: findSpec(player.className, player.wowSpec),
  }));

  const tanks = pool.filter((p) => p.specRole === "TANK");
  const healers = pool.filter((p) => p.specRole === "HEALER");
  const dps = pool.filter((p) => p.specRole === "DPS");

  const buckets = splitDpsIntoBuckets(dps);

  // Zadání počítá počet týmů jako floor(hráčů / 5). To ale nezohledňuje složení
  // rolí - při 30 hráčích, z toho jen 4 healerech, by šesti týmům chyběli
  // healeři a tvrdé pravidlo (1 tank + 1 healer + 3 DPS) by nešlo splnit.
  // Počet týmů proto omezuje i nejvzácnější role; důvod se hlásí adminovi.
  const byTotal = Math.floor(pool.length / 5);
  const teamCount = Math.min(byTotal, tanks.length, healers.length, Math.floor(dps.length / 3));

  if (teamCount < byTotal) {
    const limits: string[] = [];
    if (tanks.length === teamCount) limits.push(`tanků (${tanks.length})`);
    if (healers.length === teamCount) limits.push(`healerů (${healers.length})`);
    if (Math.floor(dps.length / 3) === teamCount) limits.push(`DPS (${dps.length})`);
    warnings.push(
      `Podle počtu hráčů (${pool.length}) by vyšlo ${byTotal} týmů, ale složení rolí dovoluje jen ${teamCount}. Omezuje počet ${limits.join(" a ")}.`
    );
  }

  const unknownSpecs = pool.filter((p) => !p.spec);
  if (unknownSpecs.length > 0) {
    warnings.push(
      `${unknownSpecs.length} postav nemá rozpoznaný spec (${unknownSpecs
        .map((p) => p.characterName)
        .join(", ")}). Nezapočítaly se do poměru melee/ranged ani do battle rezu a bloodlustu.`
    );
  }

  const roleMismatches = pool.filter((p) => p.spec && p.spec.role !== p.specRole);
  if (roleMismatches.length > 0) {
    warnings.push(
      `U ${roleMismatches.length} postav nesedí zvolená role se specem: ${roleMismatches
        .map((p) => `${p.characterName} (${p.wowSpec} = ${p.spec!.role}, přihlášen jako ${p.specRole})`)
        .join(", ")}.`
    );
  }

  const bucketSizes: Record<DpsBucket, number> = {
    A: buckets.A.length,
    B: buckets.B.length,
    C: buckets.C.length,
  };

  const poolSummary = {
    total: pool.length,
    tanks: tanks.length,
    healers: healers.length,
    dps: dps.length,
    bucketSizes,
  };

  if (teamCount === 0) {
    warnings.push(
      "Z aktuálně schválených hráčů nejde složit ani jeden kompletní tým (potřeba aspoň 1 tank, 1 healer a 3 DPS)."
    );
    return { seed, teamCount: 0, variants: [], warnings, pool: poolSummary };
  }

  const pools: Pools = {
    TANK: tanks,
    HEALER: healers,
    DPS_A: buckets.A,
    DPS_B: buckets.B,
    DPS_C: buckets.C,
  };

  const weights = makeWeights(teamCount);

  const useLocalSearch = options.localSearch ?? true;

  const scored = Array.from({ length: candidateCount }, () => {
    const candidate = generateCandidate(pools, teamCount, rng);
    const score = useLocalSearch
      ? improveCandidate(candidate, teamCount, weights)
      : totalScore(candidate, teamCount, weights);
    return { candidate, score, signatures: teamSignatures(candidate, teamCount) };
  }).sort((a, b) => a.score - b.score);

  const picked: typeof scored = [];

  for (const entry of scored) {
    if (picked.length >= VARIANTS_WANTED) break;
    const distinct = picked.every((chosen) =>
      isDistinctEnough(chosen.signatures, entry.signatures, teamCount)
    );
    if (distinct) picked.push(entry);
  }

  if (picked.length < VARIANTS_WANTED) {
    warnings.push(
      `Podařilo se najít jen ${picked.length} dostatečně odlišných variant. Při malém počtu týmů je kombinací málo.`
    );
  }

  const variants = picked.map((entry, index) =>
    toVariant(entry.candidate, index + 1, teamCount, weights)
  );

  return { seed, teamCount, variants, warnings, pool: poolSummary };
}
