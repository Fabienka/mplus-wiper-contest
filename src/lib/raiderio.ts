import type { SpecRole } from "@prisma/client";

/**
 * Raider.io veřejné API - čtení profilu postavy a dat o sezóně.
 * Dokumentace: https://raider.io/api
 *
 * Očekávaný formát URL zadávaného uživatelem:
 * https://raider.io/characters/<region>/<realm>/<jméno>
 */

export interface RaiderioCharacterData {
  characterName: string;
  realm: string;
  region: string;
  faction: string;
  guildName: string | null;
  class: string;
  /** Aktivní specializace (např. "Beast Mastery"). Null, když ji API nevrátí. */
  wowSpec: string | null;
  rioScore: number;
}

/** Jeden odehraný klíč tak, jak ho vrací profil postavy. */
export interface RaiderioRun {
  dungeonName: string;
  abbreviation: string;
  keyLevel: number;
  clearTimeSeconds: number;
  parTimeSeconds: number;
  completedAt: Date;
  /** 0 = klíč se nestihl v limitu, 1-3 = o kolik úrovní se povýšil. */
  keystoneUpgrades: number;
  keystoneRunId: number;
  url: string;
  /** Původní odpověď - ukládá se do MatchResult.rawRaiderioData. */
  raw: unknown;
}

export interface RaiderioSeasonDungeon {
  dungeonName: string;
  abbreviation: string;
  timeLimitSeconds: number;
}

export class RaiderioLookupError extends Error {}

function apiBase() {
  return process.env.RAIDERIO_API_BASE ?? "https://raider.io/api/v1";
}

async function callRaiderio(
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const query = new URLSearchParams(params);
  let response: Response;

  try {
    response = await fetch(`${apiBase()}${path}?${query}`);
  } catch (err) {
    throw new RaiderioLookupError(
      `Raider.io je nedostupné (${err instanceof Error ? err.message : "chyba sítě"}).`
    );
  }

  if (!response.ok) {
    throw new RaiderioLookupError(
      `Raider.io odpovědělo chybou (status ${response.status}).`
    );
  }

  return response.json();
}

export function parseCharacterUrl(url: string) {
  // Příklad: https://raider.io/characters/eu/silvermoon/Priklad
  const match = url.match(
    /raider\.io\/characters\/([a-z]+)\/([a-z0-9-]+)\/([^/?#]+)/i
  );

  if (!match) {
    throw new RaiderioLookupError(
      "Odkaz na Raider.io profil nemá očekávaný formát."
    );
  }

  const [, region, realm, name] = match;
  return { region, realm, name: decodeURIComponent(name) };
}

export async function fetchCharacterFromRaiderio(
  raiderioUrl: string
): Promise<RaiderioCharacterData> {
  const { region, realm, name } = parseCharacterUrl(raiderioUrl);

  const data = (await callRaiderio("/characters/profile", {
    region,
    realm,
    name,
    fields: "guild,mythic_plus_scores_by_season:current",
  })) as {
    name: string;
    realm: string;
    region: string;
    faction: string;
    class: string;
    active_spec_name?: string | null;
    guild?: { name: string } | null;
    mythic_plus_scores_by_season?: { scores?: { all?: number } }[];
  };

  return {
    characterName: data.name,
    realm: data.realm,
    region: data.region,
    faction: data.faction,
    guildName: data.guild?.name ?? null,
    class: data.class,
    // Raider.io vrací spec, se kterým byla postava naposledy viděná - nemusí
    // odpovídat tomu, co hráč plánuje hrát v soutěži, proto jde v registraci
    // přepsat ručně.
    wowSpec: data.active_spec_name ?? null,
    rioScore: data.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0,
  };
}

interface RawRecentRun {
  dungeon: string;
  short_name: string;
  mythic_level: number;
  completed_at: string;
  clear_time_ms: number;
  par_time_ms: number;
  num_keystone_upgrades: number;
  keystone_run_id: number;
  url: string;
}

/**
 * Poslední odehrané klíče postavy, volitelně jen ty spadající do okna.
 *
 * POZOR: Raider.io vrací jen 10 posledních běhů. Pokud hráč po zápase
 * odehraje další klíče, soutěžní běh z tohoto seznamu vypadne - výsledky
 * je proto potřeba stahovat brzy po odehrání.
 */
export async function fetchRecentRuns(
  raiderioUrl: string,
  window?: { from?: Date; to?: Date }
): Promise<RaiderioRun[]> {
  const { region, realm, name } = parseCharacterUrl(raiderioUrl);

  const data = (await callRaiderio("/characters/profile", {
    region,
    realm,
    name,
    fields: "mythic_plus_recent_runs",
  })) as { mythic_plus_recent_runs?: RawRecentRun[] };

  const runs = (data.mythic_plus_recent_runs ?? []).map((run) => ({
    dungeonName: run.dungeon,
    abbreviation: run.short_name,
    keyLevel: run.mythic_level,
    clearTimeSeconds: Math.round(run.clear_time_ms / 1000),
    parTimeSeconds: Math.floor(run.par_time_ms / 1000),
    completedAt: new Date(run.completed_at),
    keystoneUpgrades: run.num_keystone_upgrades,
    keystoneRunId: run.keystone_run_id,
    url: run.url,
    raw: run,
  }));

  if (!window?.from && !window?.to) {
    return runs;
  }

  return runs.filter(
    (run) =>
      (!window.from || run.completedAt >= window.from) &&
      (!window.to || run.completedAt <= window.to)
  );
}

interface RawRanking {
  run: {
    dungeon: {
      name: string;
      short_name: string;
      keystone_timer_ms: number;
    };
  };
}

/**
 * Dungeony sezóny i s časovými limity.
 *
 * Raider.io nemá endpoint, který by dungeony sezóny vracel přímo, takže se
 * skládají z žebříčku běhů - jedna stránka nemusí obsahovat všechny dungeony.
 */
export async function fetchSeasonDungeons(
  seasonSlug: string,
  pages = 3
): Promise<RaiderioSeasonDungeon[]> {
  const found = new Map<string, RaiderioSeasonDungeon>();

  for (let page = 0; page < pages; page++) {
    let data: { rankings?: RawRanking[] };

    try {
      data = (await callRaiderio("/mythic-plus/runs", {
        season: seasonSlug,
        region: "world",
        dungeon: "all",
        page: String(page),
      })) as { rankings?: RawRanking[] };
    } catch (err) {
      // Na neznámý slug sezóny odpovídá API pětistovkou, ze které uživatel
      // nepozná, co je špatně.
      throw new RaiderioLookupError(
        `Nepodařilo se načíst dungeony pro sezónu "${seasonSlug}". Sedí slug sezóny? (${
          err instanceof Error ? err.message : "neznámá chyba"
        })`
      );
    }

    for (const ranking of data.rankings ?? []) {
      const dungeon = ranking.run.dungeon;

      if (!found.has(dungeon.short_name)) {
        found.set(dungeon.short_name, {
          dungeonName: dungeon.name,
          abbreviation: dungeon.short_name,
          // API vrací limit o milisekundu delší (2040999 = 34:00), proto floor.
          timeLimitSeconds: Math.floor(dungeon.keystone_timer_ms / 1000),
        });
      }
    }
  }

  if (found.size === 0) {
    throw new RaiderioLookupError(
      `Pro sezónu "${seasonSlug}" se nepodařilo načíst žádné dungeony. Sedí slug sezóny?`
    );
  }

  return [...found.values()];
}

// ---------- Detail konkrétního běhu ----------

export interface RaiderioRosterMember {
  characterName: string;
  realm: string;
  region: string;
  className: string;
  specName: string;
  specRole: SpecRole;
}

export interface RaiderioRunDetails {
  keystoneRunId: number;
  dungeonName: string;
  abbreviation: string;
  keyLevel: number;
  clearTimeSeconds: number;
  parTimeSeconds: number;
  /** Sjednoceno s profilovým endpointem: 0 = nestihnuto, 1-3 povýšení. */
  keystoneUpgrades: number;
  completedAt: Date;
  url: string;
  roster: RaiderioRosterMember[];
  raw: unknown;
}

/** Raider.io používá "tank" | "healer" | "dps". */
function toSpecRole(role: string | undefined): SpecRole {
  if (role === "tank") return "TANK";
  if (role === "healer") return "HEALER";
  return "DPS";
}

/**
 * Rozebere odkaz na běh, např.
 * https://raider.io/mythic-plus-runs/season-mn-2/3868732-10-the-blinding-vale
 *
 * Bere i samotné číslo běhu - to se ale pak musí doplnit slug sezóny zvlášť.
 */
export function parseRunUrl(input: string): { seasonSlug?: string; runId: number } {
  const trimmed = input.trim();

  const fromUrl = trimmed.match(
    /raider\.io\/mythic-plus-runs\/([a-z0-9-]+)\/(\d+)/i
  );
  if (fromUrl) {
    return { seasonSlug: fromUrl[1], runId: Number(fromUrl[2]) };
  }

  if (/^\d+$/.test(trimmed)) {
    return { runId: Number(trimmed) };
  }

  throw new RaiderioLookupError(
    "Odkaz na běh nemá očekávaný formát (https://raider.io/mythic-plus-runs/<sezóna>/<id>-...)."
  );
}

interface RawRunDetails {
  status?: string;
  deleted_at?: string | null;
  keystone_run_id: number;
  mythic_level: number;
  clear_time_ms: number;
  keystone_time_ms?: number;
  completed_at: string;
  num_chests?: number;
  num_keystone_upgrades?: number;
  dungeon?: {
    name: string;
    short_name: string;
    keystone_timer_ms?: number;
  };
  roster?: {
    role?: string;
    character?: {
      name: string;
      class?: { name: string };
      spec?: { name: string; role?: string };
      realm?: { name: string };
      region?: { slug: string };
    };
  }[];
}

/**
 * Detail jednoho běhu včetně sestavy.
 *
 * POZOR: tenhle endpoint má jiný tvar než profil postavy - časový limit je
 * `keystone_time_ms` (případně `dungeon.keystone_timer_ms`) místo `par_time_ms`
 * a povýšení klíče je `num_chests` místo `num_keystone_upgrades`. Proto se to
 * tady převádí na stejná pole, jaká vrací fetchRecentRuns.
 */
export async function fetchRunDetails(
  runId: number,
  seasonSlug: string
): Promise<RaiderioRunDetails> {
  const data = (await callRaiderio("/mythic-plus/run-details", {
    season: seasonSlug,
    id: String(runId),
  })) as RawRunDetails;

  if (!data?.keystone_run_id) {
    throw new RaiderioLookupError(
      `Běh ${runId} se v sezóně "${seasonSlug}" nepodařilo najít.`
    );
  }

  if (data.deleted_at) {
    throw new RaiderioLookupError("Tenhle běh byl na Raider.io smazaný.");
  }

  const parTimeMs = data.keystone_time_ms ?? data.dungeon?.keystone_timer_ms;
  if (!parTimeMs) {
    throw new RaiderioLookupError("U běhu chybí časový limit klíče.");
  }

  const roster: RaiderioRosterMember[] = (data.roster ?? [])
    .filter((entry) => entry.character?.name)
    .map((entry) => ({
      characterName: entry.character!.name,
      realm: entry.character!.realm?.name ?? "",
      region: entry.character!.region?.slug ?? "eu",
      className: entry.character!.class?.name ?? "",
      specName: entry.character!.spec?.name ?? "",
      specRole: toSpecRole(entry.role ?? entry.character!.spec?.role),
    }));

  return {
    keystoneRunId: data.keystone_run_id,
    dungeonName: data.dungeon?.name ?? "",
    abbreviation: data.dungeon?.short_name ?? "",
    keyLevel: data.mythic_level,
    clearTimeSeconds: Math.round(data.clear_time_ms / 1000),
    // API vrací limit o milisekundu delší (1800999 = 30:00), proto floor.
    parTimeSeconds: Math.floor(parTimeMs / 1000),
    keystoneUpgrades: data.num_chests ?? data.num_keystone_upgrades ?? 0,
    completedAt: new Date(data.completed_at),
    url: `https://raider.io/mythic-plus-runs/${seasonSlug}/${data.keystone_run_id}`,
    roster,
    raw: data,
  };
}
