/**
 * Raider.io veřejné API - čtení profilu postavy.
 * Dokumentace: https://raider.io/api#/characters
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
  rioScore: number;
}

export class RaiderioLookupError extends Error {}

function parseCharacterUrl(url: string) {
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

  const apiBase = process.env.RAIDERIO_API_BASE ?? "https://raider.io/api/v1";
  const params = new URLSearchParams({
    region,
    realm,
    name,
    fields: "guild,mythic_plus_scores_by_season:current",
  });

  const response = await fetch(`${apiBase}/characters/profile?${params}`);

  if (!response.ok) {
    throw new RaiderioLookupError(
      `Nepodařilo se najít postavu na Raider.io (status ${response.status}).`
    );
  }

  const data = await response.json();

  return {
    characterName: data.name,
    realm: data.realm,
    region: data.region,
    faction: data.faction,
    guildName: data.guild?.name ?? null,
    class: data.class,
    rioScore:
      data.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0,
  };
}
