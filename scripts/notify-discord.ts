/**
 * Odchozí notifikace na Discord, které nevyvolá žádná akce v aplikaci.
 *
 *   npm run discord:notify
 *   npm run discord:notify -- --hours 3
 *   npm run discord:notify -- --dry-run
 *
 * Dělá dvě věci:
 *
 * 1. Připomene schválené termíny, které začínají v nejbližších hodinách
 *    (UPCOMING_MATCH). Aplikace nemá plánovač, takže tohle musí pouštět cron -
 *    viz README, sekce Discord.
 * 2. Dorovná frontu - odešle události, které zůstaly v PENDING, protože měl
 *    Discord zrovna výpadek.
 *
 * Skript je bezpečné pouštět opakovaně: na jeden termín upozorní jen jednou,
 * podle už zapsaných událostí v tabulce DiscordEvent.
 */

import { PrismaClient } from "@prisma/client";
import {
  enqueueDiscordEvent,
  flushPendingDiscordEvents,
  isDiscordConfigured,
} from "../src/lib/discord";
import { buildDiscordMessage, type UpcomingMatchPayload } from "../src/lib/discord-message";
import { formatRange, plural } from "../src/lib/labels";

const prisma = new PrismaClient();

const DEFAULT_HOURS = 24;

/** Jak daleko zpátky se kouká po už odeslaných připomínkách. */
const DEDUPE_WINDOW_DAYS = 30;

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const hoursIndex = argv.indexOf("--hours");
  let hours = DEFAULT_HOURS;

  if (hoursIndex !== -1) {
    const raw = argv[hoursIndex + 1];
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.error(`Neplatná hodnota --hours: "${raw ?? ""}". Čekám kladné číslo.`);
      process.exit(1);
    }

    hours = parsed;
  }

  return { hours, dryRun };
}

/** Id termínů, na které už připomínka odešla (nebo je aspoň ve frontě). */
async function alreadyNotifiedMatchIds(): Promise<Set<string>> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await prisma.discordEvent.findMany({
    where: { eventType: "UPCOMING_MATCH", createdAt: { gte: since } },
    select: { payload: true },
  });

  const ids = new Set<string>();

  for (const event of events) {
    const payload = event.payload as { matchId?: unknown } | null;
    if (payload && typeof payload.matchId === "string") ids.add(payload.matchId);
  }

  return ids;
}

async function main() {
  const { hours, dryRun } = parseArgs(process.argv.slice(2));

  if (!isDiscordConfigured() && !dryRun) {
    console.log("DISCORD_WEBHOOK_URL není nastavený, není kam posílat. Končím.");
    return;
  }

  const now = new Date();
  const until = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "CONFIRMED",
      windowStart: { gte: now, lte: until },
    },
    orderBy: { windowStart: "asc" },
    include: { team: { select: { id: true, name: true } } },
  });

  const notified = await alreadyNotifiedMatchIds();
  const pending = matches.filter((match) => !notified.has(match.id));

  console.log(
    `Termínů v nejbližších ${hours} h: ${matches.length}, ` +
      `z toho neohlášených: ${pending.length}`
  );

  let enqueued = 0;

  for (const match of pending) {
    const members = await prisma.teamMembership.findMany({
      where: { teamId: match.team.id, status: { not: "REMOVED" } },
      include: { character: { select: { characterName: true } } },
      orderBy: { roleInTeam: "asc" },
    });

    const payload: UpcomingMatchPayload = {
      matchId: match.id,
      teamName: match.team.name,
      windowStart: match.windowStart.toISOString(),
      windowEnd: match.windowEnd.toISOString(),
      note: match.note,
      members: members.map((m) => m.character.characterName),
    };

    if (dryRun) {
      console.log(`  [dry-run] ${match.team.name}: ${formatRange(match.windowStart, match.windowEnd)}`);
      console.log(
        JSON.stringify(buildDiscordMessage({ eventType: "UPCOMING_MATCH", payload }), null, 2)
      );
      continue;
    }

    const id = await enqueueDiscordEvent(prisma, {
      eventType: "UPCOMING_MATCH",
      payload,
    });

    if (id) enqueued++;
  }

  if (dryRun) {
    console.log("Dry run - nic se nezapsalo ani neodeslalo.");
    return;
  }

  console.log(`Zařazeno ${enqueued} ${plural(enqueued, "připomínka", "připomínky", "připomínek")}.`);

  // Odesílá se až tady, aby se v jedné dávce vyřídily i připomínky právě
  // zařazené, i to, co ve frontě zbylo z dřívějška.
  const flushed = await flushPendingDiscordEvents(prisma);

  console.log(
    `Odesláno: ${flushed.sent}, trvale odmítnuto: ${flushed.failed}, ` +
      `zůstává ve frontě: ${flushed.pending}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
