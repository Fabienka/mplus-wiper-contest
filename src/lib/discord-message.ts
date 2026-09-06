import type { DiscordEventType, SpecRole } from "@prisma/client";
import { SPEC_ROLE_LABELS, formatRange, formatTimeLimit, plural } from "./labels";

/**
 * Skládání zpráv pro Discord webhook.
 *
 * Schválně bez sítě i bez databáze - tvar zprávy jde díky tomu ověřit
 * skriptem (`npm run check:discord`). Odesílání a fronta jsou v discord.ts.
 *
 * Payloady se ukládají do DiscordEvent.payload jako JSON, takže tu nesmí být
 * nic, co JSON neunese: časy jdou dovnitř jako ISO řetězce. Odesílání pak umí
 * zprávu poskládat i zpětně z uloženého záznamu.
 */

// ---------- Payloady jednotlivých událostí ----------

export interface NewRegistrationPayload {
  seasonName: string;
  characterName: string;
  realm: string;
  className: string | null;
  wowSpec: string | null;
  specRole: SpecRole;
  rioScore: number | null;
  discordNick: string | null;
}

export interface ShuffleResultPayload {
  seasonName: string;
  teams: {
    name: string;
    members: { characterName: string; roleInTeam: SpecRole }[];
  }[];
  substitutes: { characterName: string; roleInTeam: SpecRole }[];
}

export interface UpcomingMatchPayload {
  /**
   * Ve zprávě se nezobrazuje - slouží připomínkovému skriptu k poznání, na
   * který termín už upozornil. Jinak by při každém běhu cronu odešel znovu.
   */
  matchId: string;
  teamName: string;
  /** ISO řetězec, ne Date - payload musí přežít uložení do JSON sloupce. */
  windowStart: string;
  windowEnd: string;
  note: string | null;
  members: string[];
}

export interface MatchResultPayload {
  teamName: string;
  dungeonName: string;
  keyLevel: number;
  clearTimeSeconds: number;
  isValid: boolean;
  invalidReason: string | null;
  points: number | null;
  runUrl: string | null;
}

export interface DiscordEventPayloadMap {
  NEW_REGISTRATION: NewRegistrationPayload;
  SHUFFLE_RESULT: ShuffleResultPayload;
  UPCOMING_MATCH: UpcomingMatchPayload;
  MATCH_RESULT: MatchResultPayload;
}

/** Událost i s payloadem, který k jejímu typu patří. */
export type DiscordEvent = {
  [K in DiscordEventType]: { eventType: K; payload: DiscordEventPayloadMap[K] };
}[DiscordEventType];

// ---------- Tvar zprávy pro webhook ----------

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color: number;
  fields?: DiscordEmbedField[];
}

export interface DiscordWebhookMessage {
  embeds: DiscordEmbed[];
  /**
   * Do zpráv se dostávají jména postav, týmů a poznámky od hráčů. Bez tohohle
   * by stačilo napsat si do poznámky @everyone a aplikace by ping rozeslala
   * za něj. Prázdné `parse` zakazuje všechny zmínky bez ohledu na text.
   */
  allowed_mentions: { parse: [] };
}

// Barvy jsou jen vizuální rozlišení v kanálu, ať se událost pozná od pohledu.
const COLORS = {
  registration: 0x5865f2,
  shuffle: 0x9b59b6,
  match: 0xf1c40f,
  resultValid: 0x2ecc71,
  resultInvalid: 0xe67e22,
} as const;

// Limity Discordu. Delší zprávu API odmítne s 400, takže se radši zkracuje.
const LIMIT_TITLE = 256;
const LIMIT_DESCRIPTION = 4096;
const LIMIT_FIELD_VALUE = 1024;
const LIMIT_FIELDS = 25;

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

/**
 * Zneškodní Discord markdown v textu od uživatelů - jméno postavy typu
 * Ne_bo_j by se jinak vykreslilo jako kurzíva a poznámka s trojitým
 * apostrofem rozbila celou zprávu.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/([\\*_~`|>])/g, "\\$1");
}

function specLabel(role: SpecRole): string {
  return SPEC_ROLE_LABELS[role];
}

// ---------- Jednotlivé zprávy ----------

function newRegistrationEmbed(
  payload: NewRegistrationPayload,
  baseUrl: string | null
): DiscordEmbed {
  const spec = [payload.wowSpec, payload.className].filter(Boolean).join(" ");

  const fields: DiscordEmbedField[] = [
    {
      name: "Role",
      value: spec
        ? `${specLabel(payload.specRole)} - ${escapeMarkdown(spec)}`
        : specLabel(payload.specRole),
      inline: true,
    },
    {
      name: "RIO skóre",
      value: payload.rioScore === null ? "-" : String(Math.round(payload.rioScore)),
      inline: true,
    },
    {
      name: "Discord",
      value: payload.discordNick ? escapeMarkdown(payload.discordNick) : "-",
      inline: true,
    },
  ];

  return {
    title: "Nová přihláška",
    description:
      `**${escapeMarkdown(payload.characterName)}-${escapeMarkdown(payload.realm)}** ` +
      `se hlásí do sezóny ${escapeMarkdown(payload.seasonName)}. Čeká na schválení.`,
    url: baseUrl ? `${baseUrl}/admin/registrations` : undefined,
    color: COLORS.registration,
    fields,
  };
}

function shuffleResultEmbed(
  payload: ShuffleResultPayload,
  baseUrl: string | null
): DiscordEmbed {
  // Jeden tým = jedno pole. Při větším počtu týmů by se přes limit polí
  // zbytek tiše ztratil, takže se zbývající aspoň spočítají do popisu.
  const shown = payload.teams.slice(0, LIMIT_FIELDS);
  const hidden = payload.teams.length - shown.length;

  const fields: DiscordEmbedField[] = shown.map((team) => ({
    name: truncate(escapeMarkdown(team.name), LIMIT_TITLE),
    value: truncate(
      team.members
        .map((m) => `${specLabel(m.roleInTeam)}: ${escapeMarkdown(m.characterName)}`)
        .join("\n") || "-",
      LIMIT_FIELD_VALUE
    ),
    inline: true,
  }));

  const lines = [
    `Rozdělení do týmů pro sezónu ${escapeMarkdown(payload.seasonName)} je hotové: ` +
      `**${payload.teams.length}** ${plural(payload.teams.length, "tým", "týmy", "týmů")}.`,
  ];

  if (hidden > 0) {
    lines.push(`Ve zprávě se vešlo prvních ${shown.length}, zbytek najdeš v aplikaci.`);
  }

  if (payload.substitutes.length > 0) {
    lines.push(
      `**Náhradníci:** ${payload.substitutes
        .map((s) => escapeMarkdown(s.characterName))
        .join(", ")}`
    );
  }

  return {
    title: "Týmy jsou rozdělené",
    description: truncate(lines.join("\n"), LIMIT_DESCRIPTION),
    url: baseUrl ? `${baseUrl}/leaderboard` : undefined,
    color: COLORS.shuffle,
    fields,
  };
}

function upcomingMatchEmbed(
  payload: UpcomingMatchPayload,
  baseUrl: string | null
): DiscordEmbed {
  const start = new Date(payload.windowStart);
  const end = new Date(payload.windowEnd);

  const fields: DiscordEmbedField[] = [
    {
      name: "Sestava",
      value: truncate(
        payload.members.map((m) => escapeMarkdown(m)).join(", ") || "-",
        LIMIT_FIELD_VALUE
      ),
    },
  ];

  if (payload.note) {
    fields.push({
      name: "Poznámka",
      value: truncate(escapeMarkdown(payload.note), LIMIT_FIELD_VALUE),
    });
  }

  return {
    title: "Blíží se termín",
    description: `**${escapeMarkdown(payload.teamName)}** hraje ${formatRange(start, end)}.`,
    url: baseUrl ? `${baseUrl}/team` : undefined,
    color: COLORS.match,
    fields,
  };
}

function matchResultEmbed(payload: MatchResultPayload): DiscordEmbed {
  const key = `${escapeMarkdown(payload.dungeonName)} +${payload.keyLevel}`;
  const time = formatTimeLimit(payload.clearTimeSeconds);

  const fields: DiscordEmbedField[] = [
    {
      name: "Body",
      value: payload.points === null ? "-" : String(Math.round(payload.points)),
      inline: true,
    },
  ];

  if (!payload.isValid) {
    fields.push({
      name: "Proč se nepočítá",
      value: truncate(
        payload.invalidReason ? escapeMarkdown(payload.invalidReason) : "Neuvedeno.",
        LIMIT_FIELD_VALUE
      ),
    });
  }

  return {
    title: payload.isValid ? "Nahraný běh" : "Nahraný běh (neplatný)",
    description: `**${escapeMarkdown(payload.teamName)}** - ${key} za ${time}.`,
    // Odkaz vede na Raider.io, ne do aplikace - běh si každý ověří u zdroje.
    url: payload.runUrl ?? undefined,
    color: payload.isValid ? COLORS.resultValid : COLORS.resultInvalid,
    fields,
  };
}

/**
 * Veřejná adresa aplikace pro odkazy ve zprávách. Bere se ze stejné proměnné
 * jako odkazy na reset hesla - když chybí, zpráva prostě odejde bez odkazu.
 */
export function publicBaseUrl(): string | null {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function buildDiscordMessage(
  event: DiscordEvent,
  baseUrl: string | null = publicBaseUrl()
): DiscordWebhookMessage {
  let embed: DiscordEmbed;

  switch (event.eventType) {
    case "NEW_REGISTRATION":
      embed = newRegistrationEmbed(event.payload, baseUrl);
      break;
    case "SHUFFLE_RESULT":
      embed = shuffleResultEmbed(event.payload, baseUrl);
      break;
    case "UPCOMING_MATCH":
      embed = upcomingMatchEmbed(event.payload, baseUrl);
      break;
    case "MATCH_RESULT":
      embed = matchResultEmbed(event.payload);
      break;
  }

  embed.title = truncate(embed.title, LIMIT_TITLE);

  return { embeds: [embed], allowed_mentions: { parse: [] } };
}
