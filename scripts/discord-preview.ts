/**
 * Náhled zpráv v reálném kanálu.
 *
 *   npm run discord:preview
 *   npm run discord:preview -- --only MATCH_RESULT
 *
 * Pošle na webhook po jedné ukázce od každého typu události, aby šlo vidět,
 * jak zprávy v kanálu vypadají, bez čekání na skutečnou přihlášku nebo běh.
 *
 * Data jsou vymyšlená a nic se nezapisuje do databáze - fronta DiscordEvent
 * zůstane nedotčená. Míří to do toho kanálu, který má nastavený
 * DISCORD_WEBHOOK_URL, takže se to pouští proti testovacímu Discordu.
 */

import { discordWebhookUrl, postToWebhook } from "../src/lib/discord";
import { buildDiscordMessage, type DiscordEvent } from "../src/lib/discord-message";

/** Okno začínající za tři hodiny - ať je v náhledu vidět reálně vypadající čas. */
const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

const UKAZKY: DiscordEvent[] = [
  {
    eventType: "NEW_REGISTRATION",
    payload: {
      seasonName: "Ukázková sezóna",
      characterName: "Nebojsa",
      realm: "Silvermoon",
      className: "Hunter",
      wowSpec: "Beast Mastery",
      specRole: "DPS",
      rioScore: 2412.6,
      discordNick: "nebojsa",
    },
  },
  {
    eventType: "SHUFFLE_RESULT",
    payload: {
      seasonName: "Ukázková sezóna",
      teams: [
        {
          name: "Tým 1",
          members: [
            { characterName: "Tankik", roleInTeam: "TANK" },
            { characterName: "Lecitel", roleInTeam: "HEALER" },
            { characterName: "Nebojsa", roleInTeam: "DPS" },
            { characterName: "Bleskovka", roleInTeam: "DPS" },
            { characterName: "Stinohled", roleInTeam: "DPS" },
          ],
        },
        {
          name: "Tým 2",
          members: [
            { characterName: "Kamenna", roleInTeam: "TANK" },
            { characterName: "Svetlonos", roleInTeam: "HEALER" },
            { characterName: "Mrazik", roleInTeam: "DPS" },
            { characterName: "Ostrikat", roleInTeam: "DPS" },
            { characterName: "Tichoslap", roleInTeam: "DPS" },
          ],
        },
      ],
      substitutes: [{ characterName: "Nahradnik", roleInTeam: "DPS" }],
    },
  },
  {
    eventType: "UPCOMING_MATCH",
    payload: {
      matchId: "ukazka",
      teamName: "Tým 1",
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      note: "Sraz na Discordu deset minut předem.",
      members: ["Tankik", "Lecitel", "Nebojsa", "Bleskovka", "Stinohled"],
    },
  },
  {
    eventType: "MATCH_RESULT",
    payload: {
      teamName: "Tým 1",
      dungeonName: "Ara-Kara, City of Echoes",
      keyLevel: 18,
      clearTimeSeconds: 1694,
      isValid: true,
      invalidReason: null,
      points: 245.4,
      runUrl: null,
    },
  },
  {
    eventType: "MATCH_RESULT",
    payload: {
      teamName: "Tým 2",
      dungeonName: "The Dawnbreaker",
      keyLevel: 16,
      clearTimeSeconds: 2210,
      isValid: false,
      invalidReason: "Běh začal mimo schválené okno termínu.",
      points: null,
      runUrl: null,
    },
  },
];

async function main() {
  if (!discordWebhookUrl()) {
    console.error(
      "DISCORD_WEBHOOK_URL není nastavený - doplň ho do .env a spusť to znovu."
    );
    process.exit(1);
  }

  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
  const vybrane = only ? UKAZKY.filter((u) => u.eventType === only) : UKAZKY;

  if (vybrane.length === 0) {
    console.error(`Typ "${only}" neznám. Na výběr: ${[...new Set(UKAZKY.map((u) => u.eventType))].join(", ")}`);
    process.exit(1);
  }

  let odeslano = 0;

  for (const ukazka of vybrane) {
    const outcome = await postToWebhook(buildDiscordMessage(ukazka));

    if (outcome.ok) {
      odeslano++;
      console.log(`  ✓ ${ukazka.eventType}`);
    } else {
      console.error(`  ✗ ${ukazka.eventType} - ${outcome.detail}`);
    }

    // Discord má na webhook rate limit; mezera mezi zprávami ho nedráždí
    // a zprávy zároveň dorazí ve správném pořadí.
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  console.log(`\nOdesláno ${odeslano} z ${vybrane.length}. Mrkni do kanálu.`);

  if (odeslano < vybrane.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
