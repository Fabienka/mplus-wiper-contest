import type { SpecRole } from "@prisma/client";
import { SPEC_ROLE_LABELS, plural } from "./labels";
import { findSpec, type WowSpec } from "./wow-specs";

/**
 * Shuffle - rozdělení schválených hráčů do týmů po 5 (1 tank, 1 healer, 3 DPS).
 *
 * Algoritmus nevrací jedno "správné" řešení. Vygeneruje N náhodných kandidátů,
 * každého zlepší lokálním prohledáváním, ohodnotí podle prioritizovaných
 * pravidel a vrátí 3 nejlepší vzájemně odlišné varianty adminovi na výběr.
 *
 * Když některá role chybí, doplní ji předem hráči, kteří nabídli switch specu
 * (viz planRoleSwitches) - jinak by jich víc skončilo mezi náhradníky.
 *
 * Modul je čistá funkce bez závislosti na databázi, aby šel testovat samostatně
 * (viz scripts/check-shuffle.ts).
 */

export type DpsBucket = "A" | "B" | "C";

/** Spec, na který je hráč ochotný switchnout (CharacterSwitchSpec). */
export interface SwitchSpecOption {
  specName: string;
  specRole: SpecRole;
  rioScore: number | null;
}

/** Původní role a spec hráče, který jde do týmu switchnutý. */
export interface SwitchedFrom {
  specRole: SpecRole;
  wowSpec: string | null;
  rioScore: number;
}

export interface ShufflePlayer {
  characterId: string;
  characterName: string;
  className: string | null;
  wowSpec: string | null;
  specRole: SpecRole;
  rioScore: number;
  switchSpecs?: SwitchSpecOption[];
  /** Vyplní planRoleSwitches - specRole, wowSpec a rioScore jsou pak ze switche. */
  switchedFrom?: SwitchedFrom;
}

export interface ShuffleMember {
  characterId: string;
  roleInTeam: SpecRole;
  /** Snapshot v době shuffle - postava se může později přejmenovat/přespecovat. */
  characterName: string;
  className: string | null;
  /** U switchnutého hráče spec, na který switchne. */
  wowSpec: string | null;
  rioScore: number;
  dpsBucket: DpsBucket | null;
  /** Hráč jde do týmu switchnutý. Návrhy z doby před switchem pole nemají. */
  switchedFrom?: SwitchedFrom | null;
}

/** Jeden switch, kterým shuffle doplnil chybějící roli. */
export interface RoleSwitch {
  characterId: string;
  characterName: string;
  className: string | null;
  from: SwitchedFrom;
  toRole: SpecRole;
  toSpec: string;
  rioScore: number | null;
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
  switches: RoleSwitch[];
  /** Počty rolí už po switchích. */
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

/**
 * Člen týmu pro vyhodnocení pravidel. Používá ho shuffle i ruční úpravy týmů,
 * aby se hodnocení nerozešlo - ruční úprava musí hlásit stejné problémy, jaké
 * algoritmus penalizuje.
 */
export interface TeamCompositionMember {
  characterName: string;
  className: string | null;
  wowSpec: string | null;
  roleInTeam: SpecRole;
}

interface RatedMember {
  characterName: string;
  className: string | null;
  roleInTeam: SpecRole;
  spec: WowSpec | null;
}

/**
 * Nevyváženost melee/ranged v půlbodech. Tank a healer se počítají poloviční
 * vahou - melee tank vadí míň než melee DPS. Postavy s neznámým specem se
 * nepočítají do žádné strany.
 */
function rangeImbalance(members: RatedMember[]): number {
  let melee = 0;
  let ranged = 0;

  for (const member of members) {
    if (!member.spec) continue;
    const weight =
      member.roleInTeam === "DPS" ? RANGE_WEIGHT_DPS : RANGE_WEIGHT_SUPPORT;
    if (member.spec.range === "MELEE") melee += weight;
    else ranged += weight;
  }

  return Math.abs(melee - ranged);
}

/** Počet dvojic DPS se stejnou class (tank a healer jsou z pravidla vyjmuti). */
function duplicateDpsPairs(members: RatedMember[]): number {
  const dps = members.filter((m) => m.roleInTeam === "DPS");
  let pairs = 0;

  for (let i = 0; i < dps.length; i++) {
    for (let j = i + 1; j < dps.length; j++) {
      if (dps[i].className && dps[i].className === dps[j].className) pairs++;
    }
  }

  return pairs;
}

function toRated(player: PoolPlayer): RatedMember {
  return {
    characterName: player.characterName,
    className: player.className,
    roleInTeam: player.specRole,
    spec: player.spec,
  };
}

function evaluateTeam(slots: TeamSlots): TeamPenalty {
  const { tank, healer, dps } = slots;
  const rated = [tank, healer, ...dps].map(toRated);

  // Pravidlo 1 - pokrytí košů A/B/C
  const buckets = new Set(dps.map((p) => p.bucket).filter(Boolean));
  const r1 = 3 - buckets.size;

  // Pravidlo 2 - poměr melee/ranged
  const r2 = rangeImbalance(rated);

  // Pravidlo 3 - battle rez a bloodlust
  const hasBattleRez = rated.some((m) => m.spec?.battleRez);
  const hasBloodlust = rated.some((m) => m.spec?.bloodlust);
  const r3 = (hasBattleRez ? 0 : 1) + (hasBloodlust ? 0 : 1);

  // Pravidlo 4 - opakující se class mezi DPS
  const r4 = duplicateDpsPairs(rated);

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

/**
 * Popisy porušených pravidel, která nezávisí na koších - platí stejně pro
 * navrženou variantu i pro ručně upravený tým.
 */
function describeSharedViolations(members: RatedMember[]): string[] {
  const violations: string[] = [];

  if (rangeImbalance(members) >= IMBALANCE_REPORT_THRESHOLD) {
    const melee = members.filter((m) => m.spec?.range === "MELEE").length;
    const ranged = members.filter((m) => m.spec?.range === "RANGED").length;
    violations.push(
      `Nevyvážený poměr melee/ranged (${melee} melee / ${ranged} ranged včetně tanka a healera)`
    );
  }

  if (!members.some((m) => m.spec?.battleRez)) {
    violations.push("Chybí battle rez");
  }

  if (!members.some((m) => m.spec?.bloodlust)) {
    violations.push("Chybí bloodlust/heroism (pokud tým nepoužije drums)");
  }

  if (duplicateDpsPairs(members) > 0) {
    const counts = new Map<string, number>();
    for (const member of members) {
      if (member.roleInTeam === "DPS" && member.className) {
        counts.set(member.className, (counts.get(member.className) ?? 0) + 1);
      }
    }
    const duplicates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([className, count]) => `${className} ${count}×`)
      .join(", ");
    violations.push(`Stejná class u DPS: ${duplicates}`);
  }

  const unknown = members.filter((m) => !m.spec);
  if (unknown.length > 0) {
    violations.push(
      `Neznámý spec u: ${unknown.map((m) => m.characterName).join(", ")} - pravidla o poměru a schopnostech je nezapočítala`
    );
  }

  return violations;
}

function describeViolations(slots: TeamSlots, penalty: TeamPenalty): string[] {
  const violations: string[] = [];
  const { dps } = slots;
  const rated = [slots.tank, slots.healer, ...dps].map(toRated);

  if (penalty.r1 > 0) {
    const buckets = dps.map((p) => p.bucket ?? "?").join(", ");
    violations.push(`DPS nepokrývají všechny tři koše (${buckets})`);
  }

  return [...violations, ...describeSharedViolations(rated)];
}

/**
 * Porušená pravidla ručně sestaveného týmu. Oproti shuffle nekontroluje pokrytí
 * košů - koše jsou jen pomůcka losování a po rozdělení do týmů se nedrží.
 * Navíc hlídá složení rolí, které si admin ruční úpravou může rozbít.
 */
export function describeTeamComposition(members: TeamCompositionMember[]): string[] {
  const rated: RatedMember[] = members.map((member) => ({
    characterName: member.characterName,
    className: member.className,
    roleInTeam: member.roleInTeam,
    spec: findSpec(member.className, member.wowSpec),
  }));

  const violations: string[] = [];
  const tanks = rated.filter((m) => m.roleInTeam === "TANK").length;
  const healers = rated.filter((m) => m.roleInTeam === "HEALER").length;
  const dps = rated.filter((m) => m.roleInTeam === "DPS").length;

  if (tanks !== 1 || healers !== 1 || dps !== 3) {
    violations.push(
      `Nestandardní složení: ${tanks}× tank, ${healers}× healer, ${dps}× DPS (má být 1/1/3)`
    );
  }

  return [...violations, ...describeSharedViolations(rated)];
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
    switchedFrom: player.switchedFrom ?? null,
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

// ---------- Switch specu ----------

/** Hráč pro shuffle z postavy, jak ji drží databáze. */
export function toShufflePlayer(character: {
  id: string;
  characterName: string;
  class: string | null;
  wowSpec: string | null;
  specRole: SpecRole;
  rioScore: number | null;
  canSwitchSpec: boolean;
  switchSpecs: SwitchSpecOption[];
}): ShufflePlayer {
  return {
    characterId: character.id,
    characterName: character.characterName,
    className: character.class,
    wowSpec: character.wowSpec,
    specRole: character.specRole,
    // RIO se používá jen na rozdělení do košů; chybějící skóre spadne naspod.
    rioScore: character.rioScore ?? 0,
    switchSpecs: character.canSwitchSpec
      ? character.switchSpecs.map(({ specName, specRole, rioScore }) => ({
          specName,
          specRole,
          rioScore,
        }))
      : [],
  };
}

const ROLES: SpecRole[] = ["TANK", "HEALER", "DPS"];

function countRoles(players: { specRole: SpecRole }[]): Record<SpecRole, number> {
  const counts: Record<SpecRole, number> = { TANK: 0, HEALER: 0, DPS: 0 };
  for (const player of players) counts[player.specRole]++;
  return counts;
}

/**
 * Kolik kompletních týmů jde z hráčů složit. Zadání počítá jen floor(hráčů / 5),
 * to ale nezohledňuje role - při 30 hráčích a 4 healerech by šesti týmům
 * chyběli healeři. Počet proto omezuje i nejvzácnější role.
 */
function teamCountFor(players: { specRole: SpecRole }[]): number {
  const counts = countRoles(players);
  return Math.min(
    Math.floor(players.length / 5),
    counts.TANK,
    counts.HEALER,
    Math.floor(counts.DPS / 3)
  );
}

/**
 * Nejlepší spec, na který hráč umí switchnout do dané role - podle RIO v tom
 * specu. Null, když na tu roli nic nenabídl nebo je to jeho hlavní role.
 * Spec, který k classe nepatří nebo má jinou roli, se nepočítá.
 */
export function bestSwitchSpec(
  player: {
    className: string | null;
    specRole: SpecRole;
    switchSpecs?: SwitchSpecOption[];
  },
  role: SpecRole
): SwitchSpecOption | null {
  if (role === player.specRole) return null;

  let best: SwitchSpecOption | null = null;

  for (const option of player.switchSpecs ?? []) {
    if (findSpec(player.className, option.specName)?.role !== role) continue;
    if (!best || (option.rioScore ?? -1) > (best.rioScore ?? -1)) best = option;
  }

  return best;
}

interface SwitchEdge {
  target: SpecRole;
  option: SwitchSpecOption;
}

/**
 * Hráči, kteří switchem pokryjí role chybějící do daného počtu týmů. Null,
 * když je pokrýt nejde.
 *
 * Hráči se berou jen z rolí, kterých je nadbytek, a jen tolik, aby jejich
 * role sama nespadla pod potřebu. Pořadí je podle RIO v cílovém specu - každý
 * další se přidá, jen když se tím nevyřadí nikdo dřív vybraný. Dřív vybraného
 * ale smí přesunout na jinou chybějící roli: když chybí tank i healer, druid
 * s Guardianem i Restem uvolní tanka warriorovi, který umí jen Protection.
 */
function findSwitches(
  players: ShufflePlayer[],
  teamCount: number
): Map<ShufflePlayer, SwitchEdge> | null {
  const counts = countRoles(players);
  const need: Record<SpecRole, number> = {
    TANK: teamCount,
    HEALER: teamCount,
    DPS: 3 * teamCount,
  };
  const deficit = {} as Record<SpecRole, number>;
  const surplus = {} as Record<SpecRole, number>;

  for (const role of ROLES) {
    deficit[role] = Math.max(0, need[role] - counts[role]);
    surplus[role] = Math.max(0, counts[role] - need[role]);
  }

  const missing = ROLES.reduce((sum, role) => sum + deficit[role], 0);
  const rio = (edge: SwitchEdge) => edge.option.rioScore ?? -1;

  const candidates = players
    .filter((player) => surplus[player.specRole] > 0)
    .map((player) => ({
      player,
      edges: ROLES.filter((role) => deficit[role] > 0)
        .map((target) => ({ target, option: bestSwitchSpec(player, target) }))
        .filter((edge): edge is SwitchEdge => edge.option !== null)
        .sort((a, b) => rio(b) - rio(a)),
    }))
    .filter((candidate) => candidate.edges.length > 0)
    .sort(
      (a, b) =>
        rio(b.edges[0]) - rio(a.edges[0]) ||
        a.player.characterId.localeCompare(b.player.characterId)
    );

  const edgesOf = new Map(candidates.map((c) => [c.player, c.edges]));
  const assigned = new Map<ShufflePlayer, SwitchEdge>();
  const slots: Record<SpecRole, ShufflePlayer[]> = { TANK: [], HEALER: [], DPS: [] };

  // Párování s přesouváním (Kuhnův algoritmus): hráč obsadí volné místo
  // v některé ze svých rolí, nebo ho uvolní tím, že obsazujícího přesune jinam.
  const place = (player: ShufflePlayer, visited: Set<SpecRole>): boolean => {
    for (const edge of edgesOf.get(player)!) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);

      const slot = slots[edge.target];

      if (slot.length < deficit[edge.target]) {
        slot.push(player);
        assigned.set(player, edge);
        return true;
      }

      for (let i = 0; i < slot.length; i++) {
        if (place(slot[i], visited)) {
          slot[i] = player;
          assigned.set(player, edge);
          return true;
        }
      }
    }

    return false;
  };

  const taken: Record<SpecRole, number> = { TANK: 0, HEALER: 0, DPS: 0 };

  for (const { player } of candidates) {
    if (assigned.size === missing) break;
    if (taken[player.specRole] >= surplus[player.specRole]) continue;
    if (place(player, new Set())) taken[player.specRole]++;
  }

  return assigned.size === missing ? assigned : null;
}

export interface RoleSwitchPlan {
  /** Hráči po switchích - switchnutí mají roli, spec a RIO ze switche. */
  players: ShufflePlayer[];
  switches: RoleSwitch[];
  teamCountBefore: number;
  teamCount: number;
}

/**
 * Doplní chybějící role switchem specu.
 *
 * Při třech tancích vzniknou jen tři týmy, i kdyby hráčů bylo na pět. Když ale
 * některý DPS nabídl, že umí tanka, může chybějící místo zaplnit. Zkouší se
 * nejvyšší počet týmů, jaký dovolí počet hráčů, a postupně nižší, dokud se
 * chybějící role nedají pokrýt. Switchne se jen tolik hráčů, kolik je potřeba.
 */
export function planRoleSwitches(players: ShufflePlayer[]): RoleSwitchPlan {
  const teamCountBefore = teamCountFor(players);
  const byTotal = Math.floor(players.length / 5);

  for (let teamCount = byTotal; teamCount > teamCountBefore; teamCount--) {
    const chosen = findSwitches(players, teamCount);
    if (!chosen) continue;

    const switches: RoleSwitch[] = [];

    const switched = players.map((player): ShufflePlayer => {
      const edge = chosen.get(player);
      if (!edge) return player;

      const from: SwitchedFrom = {
        specRole: player.specRole,
        wowSpec: player.wowSpec,
        rioScore: player.rioScore,
      };

      switches.push({
        characterId: player.characterId,
        characterName: player.characterName,
        className: player.className,
        from,
        toRole: edge.target,
        toSpec: edge.option.specName,
        rioScore: edge.option.rioScore,
      });

      return {
        ...player,
        specRole: edge.target,
        wowSpec: edge.option.specName,
        // Do koše DPS patří podle RIO ve specu, který bude hrát.
        rioScore: edge.option.rioScore ?? player.rioScore,
        switchedFrom: from,
      };
    });

    return { players: switched, switches, teamCountBefore, teamCount };
  }

  return { players, switches: [], teamCountBefore, teamCount: teamCountBefore };
}

/** "Feral (DPS) → Guardian (Tank), RIO 2122" - pro varování a výpisy. */
export function describeSwitch(change: RoleSwitch): string {
  const from = change.from.wowSpec
    ? `${change.from.wowSpec} (${SPEC_ROLE_LABELS[change.from.specRole]})`
    : SPEC_ROLE_LABELS[change.from.specRole];
  const rio = change.rioScore === null ? "RIO nenačteno" : `RIO ${Math.round(change.rioScore)}`;
  return `${change.characterName}: ${from} → ${change.toSpec} (${SPEC_ROLE_LABELS[change.toRole]}), ${rio}`;
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

  const plan = planRoleSwitches(players);

  const pool: PoolPlayer[] = plan.players.map((player) => ({
    ...player,
    bucket: null,
    spec: findSpec(player.className, player.wowSpec),
  }));

  const tanks = pool.filter((p) => p.specRole === "TANK");
  const healers = pool.filter((p) => p.specRole === "HEALER");
  const dps = pool.filter((p) => p.specRole === "DPS");

  const buckets = splitDpsIntoBuckets(dps);

  // Počet týmů omezuje i nejvzácnější role (viz teamCountFor) - po switchích,
  // které ji doplnily, co to šlo. Důvod omezení se hlásí adminovi.
  const byTotal = Math.floor(pool.length / 5);
  const teamCount = plan.teamCount;

  if (plan.switches.length > 0) {
    const count = plan.switches.length;
    warnings.push(
      `Switch specu: ${count} ${plural(count, "hráč přepne", "hráči přepnou", "hráčů přepne")} roli, aby vyšlo ${teamCount} ${plural(teamCount, "tým", "týmy", "týmů")} místo ${plan.teamCountBefore}. ${plan.switches
        .map(describeSwitch)
        .join("; ")}.`
    );
  }

  if (teamCount < byTotal) {
    const limits: string[] = [];
    if (tanks.length === teamCount) limits.push(`tanků (${tanks.length})`);
    if (healers.length === teamCount) limits.push(`healerů (${healers.length})`);
    if (Math.floor(dps.length / 3) === teamCount) limits.push(`DPS (${dps.length})`);
    warnings.push(
      `Podle počtu hráčů (${pool.length}) by vyšlo ${byTotal} týmů, ale složení rolí dovoluje jen ${teamCount}. Omezuje počet ${limits.join(" a ")}${
        plan.switches.length > 0 ? " i po switchích specu" : ""
      }.`
    );
  }

  const unknownSpecs = pool.filter((p) => !p.spec);
  if (unknownSpecs.length > 0) {
    warnings.push(
      `${unknownSpecs.length} ${plural(unknownSpecs.length, "postava nemá", "postavy nemají", "postav nemá")} rozpoznaný spec (${unknownSpecs
        .map((p) => p.characterName)
        .join(", ")}). Nezapočítaly se do poměru melee/ranged ani do battle rezu a bloodlustu.`
    );
  }

  const roleMismatches = pool.filter((p) => p.spec && p.spec.role !== p.specRole);
  if (roleMismatches.length > 0) {
    warnings.push(
      `U ${roleMismatches.length} ${plural(roleMismatches.length, "postavy", "postav", "postav")} nesedí zvolená role se specem: ${roleMismatches
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
    return { seed, teamCount: 0, variants: [], warnings, switches: [], pool: poolSummary };
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
      `Podařilo se najít jen ${picked.length} ${plural(picked.length, "dostatečně odlišnou variantu", "dostatečně odlišné varianty", "dostatečně odlišných variant")}. Při malém počtu týmů je kombinací málo.`
    );
  }

  const variants = picked.map((entry, index) =>
    toVariant(entry.candidate, index + 1, teamCount, weights)
  );

  return { seed, teamCount, variants, warnings, switches: plan.switches, pool: poolSummary };
}
