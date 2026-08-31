import { scoreRun, type RunScore, type ScoringConfig } from "./scoring";

/**
 * Ověření staženého běhu proti zápasu.
 *
 * Skóre samo o sobě nestačí - běh musí ještě patřit tomu týmu, spadat do okna
 * zápasu a být z dungeonu, který je v rotaci sezóny. Teprve pak má smysl ho
 * bodovat.
 *
 * Modul je čistá funkce bez databáze (viz scripts/check-match-result.ts).
 */

export interface TeamCharacter {
  id: string;
  characterName: string;
  realm: string;
}

export interface SeasonDungeonRef {
  dungeonName: string;
  abbreviation: string;
  bonusMultiplier: number;
}

export interface MatchContext {
  windowStart: Date;
  windowEnd: Date;
  /** Postavy, které za tým smějí hrát - včetně náhradníků. */
  teamCharacters: TeamCharacter[];
  seasonDungeons: SeasonDungeonRef[];
  config: ScoringConfig;
}

export interface RunCandidate {
  dungeonName: string;
  abbreviation: string;
  keyLevel: number;
  clearTimeSeconds: number;
  parTimeSeconds: number;
  keystoneUpgrades: number;
  completedAt: Date;
  roster: { characterName: string; realm: string }[];
}

export interface RunEvaluation {
  /** Běh prošel všemi kontrolami i bodováním. */
  valid: boolean;
  /** Proč běh neprošel - prázdné, když je v pořádku. */
  reasons: string[];
  score: RunScore;
  dungeon: SeasonDungeonRef | null;
  /** Id postav z týmu, které v běhu byly. */
  matchedCharacterIds: string[];
  /** Jména ze sestavy, která do týmu nepatří. */
  outsiders: string[];
}

/** Jména a realmy se porovnávají bez ohledu na velikost písmen a apostrofy. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s'’-]/g, "");
}

function characterKey(name: string, realm: string): string {
  return `${normalize(name)}@${normalize(realm)}`;
}

/** Rozdíl v čase pro hlášku - u velkých odstupů dává minutáž nesmysl. */
function formatOffset(seconds: number): string {
  const abs = Math.abs(Math.round(seconds));

  if (abs >= 86400) {
    const dny = Math.floor(abs / 86400);
    return `${dny} ${dny === 1 ? "den" : dny <= 4 ? "dny" : "dnů"}`;
  }

  if (abs >= 3600) {
    const hodiny = Math.floor(abs / 3600);
    const minuty = Math.floor((abs % 3600) / 60);
    return `${hodiny} h ${minuty} min`;
  }

  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function evaluateRun(run: RunCandidate, context: MatchContext): RunEvaluation {
  const reasons: string[] = [];

  // 1) Dungeon musí být v rotaci sezóny. Páruje se přes zkratku - názvy se
  // mezi Raider.io a naší evidencí liší (Kings' Rest vs King's Rest).
  const dungeon =
    context.seasonDungeons.find(
      (d) => normalize(d.abbreviation) === normalize(run.abbreviation)
    ) ??
    context.seasonDungeons.find(
      (d) => normalize(d.dungeonName) === normalize(run.dungeonName)
    ) ??
    null;

  if (!dungeon) {
    reasons.push(`Dungeon "${run.dungeonName}" není v rotaci sezóny.`);
  }

  // 2) Běh musí spadat do okna zápasu.
  if (run.completedAt < context.windowStart) {
    const rozdil = (context.windowStart.getTime() - run.completedAt.getTime()) / 1000;
    reasons.push(`Běh skončil ${formatOffset(rozdil)} před začátkem okna zápasu.`);
  } else if (run.completedAt > context.windowEnd) {
    const rozdil = (run.completedAt.getTime() - context.windowEnd.getTime()) / 1000;
    reasons.push(`Běh skončil ${formatOffset(rozdil)} po konci okna zápasu.`);
  }

  // 3) Celá sestava musí patřit týmu - jinak by šlo nahlásit cizí běh.
  const byKey = new Map(
    context.teamCharacters.map((c) => [characterKey(c.characterName, c.realm), c])
  );

  const matchedCharacterIds: string[] = [];
  const outsiders: string[] = [];

  for (const member of run.roster) {
    const found = byKey.get(characterKey(member.characterName, member.realm));
    if (found) matchedCharacterIds.push(found.id);
    else outsiders.push(member.characterName);
  }

  if (outsiders.length > 0) {
    reasons.push(
      `V sestavě běhu ${outsiders.length === 1 ? "je hráč, který" : "jsou hráči, kteří"} nepatří do týmu: ${outsiders.join(", ")}.`
    );
  }

  // 4) Teprve teď má smysl bodovat.
  const score = scoreRun(
    {
      keyLevel: run.keyLevel,
      clearTimeSeconds: run.clearTimeSeconds,
      parTimeSeconds: run.parTimeSeconds,
      keystoneUpgrades: run.keystoneUpgrades,
      bonusMultiplier: dungeon?.bonusMultiplier ?? 1,
    },
    context.config
  );

  if (!score.scored) reasons.push(score.reason);

  return {
    valid: reasons.length === 0,
    reasons,
    score,
    dungeon,
    matchedCharacterIds,
    outsiders,
  };
}
