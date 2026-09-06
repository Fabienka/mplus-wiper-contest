/**
 * Kontrola zpráv pro Discord.
 *
 *   npm run check:discord
 *
 * Ověřuje jen skládání zprávy - žádná síť ani databáze. Odesílání se testuje
 * proti reálnému kanálu přes `npm run discord:notify -- --dry-run`.
 */

import {
  buildDiscordMessage,
  escapeMarkdown,
  type MatchResultPayload,
  type NewRegistrationPayload,
  type ShuffleResultPayload,
  type UpcomingMatchPayload,
} from "../src/lib/discord-message";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const BASE = "https://soutez.example.cz";

const registrace: NewRegistrationPayload = {
  seasonName: "Sezóna 1",
  characterName: "Nebojsa",
  realm: "Silvermoon",
  className: "Hunter",
  wowSpec: "Beast Mastery",
  specRole: "DPS",
  rioScore: 2412.6,
  discordNick: "nebojsa#0001",
};

console.log("1. Nová přihláška");
{
  const message = buildDiscordMessage({ eventType: "NEW_REGISTRATION", payload: registrace }, BASE);
  const embed = message.embeds[0];

  check(embed.title === "Nová přihláška", "titulek", embed.title);
  check(
    embed.description?.includes("**Nebojsa-Silvermoon**") ?? false,
    "jméno a realm v popisu",
    embed.description
  );
  check(embed.description?.includes("Sezóna 1") ?? false, "název sezóny v popisu");
  check(embed.url === `${BASE}/admin/registrations`, "odkaz na schvalování", embed.url);

  const rio = embed.fields?.find((f) => f.name === "RIO skóre");
  check(rio?.value === "2413", "RIO se zaokrouhluje", rio?.value);

  const role = embed.fields?.find((f) => f.name === "Role");
  check(role?.value === "DPS - Beast Mastery Hunter", "role se specem", role?.value);
}

console.log("2. Chybějící údaje nezpůsobí prázdné místo");
{
  const message = buildDiscordMessage(
    {
      eventType: "NEW_REGISTRATION",
      payload: { ...registrace, rioScore: null, discordNick: null, wowSpec: null, className: null },
    },
    BASE
  );
  const embed = message.embeds[0];

  check(embed.fields?.find((f) => f.name === "RIO skóre")?.value === "-", "chybějící RIO jako pomlčka");
  check(embed.fields?.find((f) => f.name === "Discord")?.value === "-", "chybějící nick jako pomlčka");
  check(embed.fields?.find((f) => f.name === "Role")?.value === "DPS", "samotná role bez specu");
}

console.log("3. Bez NEXTAUTH_URL odejde zpráva bez odkazu");
{
  const message = buildDiscordMessage({ eventType: "NEW_REGISTRATION", payload: registrace }, null);
  check(message.embeds[0].url === undefined, "žádný odkaz", String(message.embeds[0].url));
}

console.log("4. Text od uživatelů nerozbije markdown ani nepinguje");
{
  const message = buildDiscordMessage(
    {
      eventType: "NEW_REGISTRATION",
      payload: { ...registrace, characterName: "Ne_bo_j", discordNick: "**tucnak**" },
    },
    BASE
  );
  const embed = message.embeds[0];

  check(escapeMarkdown("Ne_bo_j") === "Ne\\_bo\\_j", "podtržítka se escapují", escapeMarkdown("Ne_bo_j"));
  check(
    embed.description?.includes("Ne\\_bo\\_j") ?? false,
    "escapované jméno v popisu",
    embed.description
  );
  check(
    embed.fields?.find((f) => f.name === "Discord")?.value === "\\*\\*tucnak\\*\\*",
    "hvězdičky se escapují"
  );
  check(message.allowed_mentions.parse.length === 0, "zmínky jsou zakázané");
}

console.log("5. Rozdělení do týmů");
{
  const payload: ShuffleResultPayload = {
    seasonName: "Sezóna 1",
    teams: [
      {
        name: "Tým 1",
        members: [
          { characterName: "Tankik", roleInTeam: "TANK" },
          { characterName: "Lecitel", roleInTeam: "HEALER" },
          { characterName: "Nebojsa", roleInTeam: "DPS" },
        ],
      },
      { name: "Tým 2", members: [{ characterName: "Druhy", roleInTeam: "TANK" }] },
    ],
    substitutes: [{ characterName: "Nahradnik", roleInTeam: "DPS" }],
  };

  const embed = buildDiscordMessage({ eventType: "SHUFFLE_RESULT", payload }, BASE).embeds[0];

  check(embed.fields?.length === 2, "jeden tým = jedno pole", String(embed.fields?.length));
  check(embed.fields?.[0].name === "Tým 1", "název týmu jako nadpis pole", embed.fields?.[0].name);
  check(
    embed.fields?.[0].value.startsWith("Tank: Tankik") ?? false,
    "role u jména",
    embed.fields?.[0].value
  );
  check(embed.description?.includes("**2** týmy") ?? false, "počet týmů se skloňuje", embed.description);
  check(embed.description?.includes("Nahradnik") ?? false, "náhradníci v popisu");
  check(embed.url === `${BASE}/leaderboard`, "odkaz na žebříček", embed.url);
}

console.log("6. Víc týmů, než se vejde polí");
{
  const payload: ShuffleResultPayload = {
    seasonName: "Sezóna 1",
    teams: Array.from({ length: 30 }, (_, i) => ({
      name: `Tým ${i + 1}`,
      members: [{ characterName: `Hrac${i}`, roleInTeam: "TANK" as const }],
    })),
    substitutes: [],
  };

  const embed = buildDiscordMessage({ eventType: "SHUFFLE_RESULT", payload }, BASE).embeds[0];

  check(embed.fields?.length === 25, "nejvýš 25 polí", String(embed.fields?.length));
  check(embed.description?.includes("**30** týmů") ?? false, "v popisu je skutečný počet");
  check(
    embed.description?.includes("zbytek najdeš v aplikaci") ?? false,
    "zmínka o oříznutí",
    embed.description
  );
}

console.log("7. Blížící se termín");
{
  // Místní čas schválně - formátování běží v zóně procesu, takže takhle
  // kontrola projde i na stroji, který není v Praze.
  const start = new Date(2026, 8, 14, 18, 0);
  const end = new Date(2026, 8, 14, 20, 0);

  const payload: UpcomingMatchPayload = {
    matchId: "m1",
    teamName: "Tým 1",
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    note: "Sraz na Discordu v 17:50",
    members: ["Tankik", "Lecitel", "Nebojsa"],
  };

  const embed = buildDiscordMessage({ eventType: "UPCOMING_MATCH", payload }, BASE).embeds[0];

  check(embed.description?.includes("18:00") ?? false, "začátek okna v popisu", embed.description);
  check(embed.description?.includes("20:00") ?? false, "konec okna v popisu");
  check(embed.fields?.[0].value === "Tankik, Lecitel, Nebojsa", "sestava", embed.fields?.[0].value);
  check(
    embed.fields?.some((f) => f.name === "Poznámka") ?? false,
    "poznámka jako vlastní pole"
  );
  check(
    !(embed.description?.includes("m1") ?? true),
    "id termínu se do zprávy nedostane",
    embed.description
  );

  const bezPoznamky = buildDiscordMessage(
    { eventType: "UPCOMING_MATCH", payload: { ...payload, note: null } },
    BASE
  ).embeds[0];

  check(
    !(bezPoznamky.fields?.some((f) => f.name === "Poznámka") ?? true),
    "prázdná poznámka se nevypisuje"
  );
}

console.log("8. Výsledek běhu");
{
  const payload: MatchResultPayload = {
    teamName: "Tým 1",
    dungeonName: "Ara-Kara, City of Echoes",
    keyLevel: 18,
    clearTimeSeconds: 1694,
    isValid: true,
    invalidReason: null,
    points: 245.4,
    runUrl: "https://raider.io/mythic-plus-runs/season-mn-2/123456",
  };

  const platny = buildDiscordMessage({ eventType: "MATCH_RESULT", payload }, BASE).embeds[0];

  check(platny.title === "Nahraný běh", "titulek platného běhu", platny.title);
  check(platny.description?.includes("+18 za 28:14") ?? false, "klíč a čas", platny.description);
  check(platny.fields?.[0].value === "245", "body se zaokrouhlují", platny.fields?.[0].value);
  check(platny.url === payload.runUrl, "odkaz vede na Raider.io", platny.url);

  const neplatny = buildDiscordMessage(
    {
      eventType: "MATCH_RESULT",
      payload: {
        ...payload,
        isValid: false,
        points: null,
        invalidReason: "Běh začal mimo schválené okno.",
      },
    },
    BASE
  ).embeds[0];

  check(neplatny.title === "Nahraný běh (neplatný)", "titulek neplatného běhu", neplatny.title);
  check(neplatny.color !== platny.color, "jiná barva než u platného");
  check(
    neplatny.fields?.some((f) => f.name === "Proč se nepočítá") ?? false,
    "důvod neplatnosti"
  );
  check(neplatny.fields?.[0].value === "-", "chybějící body jako pomlčka");
}

console.log("9. Dlouhý text se zkracuje pod limit Discordu");
{
  const payload: UpcomingMatchPayload = {
    matchId: "m2",
    teamName: "Tým 1",
    windowStart: new Date(2026, 8, 14, 18, 0).toISOString(),
    windowEnd: new Date(2026, 8, 14, 20, 0).toISOString(),
    note: "a".repeat(3000),
    members: Array.from({ length: 200 }, (_, i) => `Hrac${i}`),
  };

  const embed = buildDiscordMessage({ eventType: "UPCOMING_MATCH", payload }, BASE).embeds[0];

  for (const field of embed.fields ?? []) {
    check(field.value.length <= 1024, `pole "${field.name}" do 1024 znaků`, String(field.value.length));
  }
}

console.log("");

if (failures > 0) {
  console.error(`Neprošlo ${failures} z ${checks} kontrol.`);
  process.exit(1);
}

console.log(`Všech ${checks} kontrol prošlo.`);
