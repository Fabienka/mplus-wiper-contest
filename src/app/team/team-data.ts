import { prisma } from "@/lib/prisma";
import { findOverlaps, type MemberSlots, type Overlap } from "@/lib/availability";
import type { CalendarEvent } from "@/lib/calendar";
import { MATCH_STATUS_LABELS, formatRange } from "@/lib/labels";
import { classColor } from "@/lib/wow-specs";
import { DEFAULT_SCORING_CONFIG, parseScoringConfig } from "@/lib/scoring";
import { budgetRunsOf, computeTimeBudget } from "@/lib/time-budget";
import { matchAuthorText } from "@/lib/match-author";

/**
 * Data stránky týmu - sdílená mezi Můj tým (/team) a detailem týmu
 * v administraci (/admin/teams/[id]). Obě stránky ukazují stejné karty,
 * liší se jen tím, kdo se dívá a co smí dělat.
 */

interface TeamMemberRef {
  characterId: string;
  character: { characterName: string; class: string | null };
}

export async function loadTeamData(team: {
  id: string;
  seasonId: string;
  members: { characterId: string }[];
}) {
  const teamCharacterIds = team.members.map((m) => m.characterId);

  const [availabilities, matches, reroll, activeDungeons, seasonRow] = await Promise.all([
    prisma.availability.findMany({
      where: {
        seasonId: team.seasonId,
        characterId: { in: teamCharacterIds },
        // Minulé termíny jen zabírají místo.
        end: { gte: new Date() },
      },
      orderBy: { start: "asc" },
    }),
    prisma.match.findMany({
      where: { teamId: team.id },
      orderBy: { windowStart: "asc" },
      include: {
        proposedBy: { select: { characterName: true, class: true } },
        createdBy: { select: { username: true } },
        confirmedBy: { select: { username: true } },
        // Ze screenshotu jen id na odkaz - samotný obrázek se tahá zvlášť.
        results: {
          orderBy: { createdAt: "asc" },
          include: { screenshot: { select: { id: true } } },
        },
      },
    }),
    prisma.teamReroll.findUnique({
      where: { teamId: team.id },
      include: { recordedBy: { select: { characterName: true, class: true } } },
    }),
    prisma.seasonDungeon.findMany({
      where: { seasonId: team.seasonId, isActive: true },
      orderBy: { dungeonName: "asc" },
      select: { id: true, dungeonName: true },
    }),
    prisma.season.findUnique({
      where: { id: team.seasonId },
      select: { scoringConfig: true },
    }),
  ]);

  // Rozbité nastavení sezóny nesmí shodit stránku - platí výchozí herní čas.
  let timeBudgetMinutes = DEFAULT_SCORING_CONFIG.timeBudgetMinutes;
  try {
    timeBudgetMinutes = parseScoringConfig(seasonRow?.scoringConfig).timeBudgetMinutes;
  } catch {
    timeBudgetMinutes = DEFAULT_SCORING_CONFIG.timeBudgetMinutes;
  }

  const budgetByMatch = new Map(
    matches.map((match) => [
      match.id,
      computeTimeBudget(budgetRunsOf(match.results), timeBudgetMinutes * 60),
    ])
  );

  return { availabilities, matches, reroll, activeDungeons, budgetByMatch };
}

export type TeamData = Awaited<ReturnType<typeof loadTeamData>>;

/** Nejdřív se hledá termín pro celý tým, pak se povolí chybějící hráči. */
const FALLBACK_STEPS = [0, 1, 2];

/**
 * Společné časy týmu. Nejdřív termín pro celý tým; když žádný není, povolí se
 * postupně chybějící hráči, ať stránka neukáže prázdno, když se jeden člověk
 * nezapsal. `fullTeamOverlaps` jsou jen časy celého týmu - ty jdou do
 * kalendáře, ať ho nezaplní skoro-termíny.
 */
export function findTeamOverlaps(
  members: TeamMemberRef[],
  availabilities: TeamData["availabilities"]
) {
  const memberSlots: MemberSlots[] = members.map((member) => ({
    characterId: member.characterId,
    characterName: member.character.characterName,
    slots: availabilities
      .filter((a) => a.characterId === member.characterId)
      .map((a) => ({ start: a.start, end: a.end })),
  }));

  let overlaps: Overlap[] = [];
  let overlapMissing = 0;

  for (const step of FALLBACK_STEPS) {
    const needed = members.length - step;
    if (needed < 2) break;

    overlaps = findOverlaps(memberSlots, needed, { minDurationMinutes: 30 });
    if (overlaps.length > 0) {
      overlapMissing = step;
      break;
    }
  }

  const fullTeamOverlaps =
    overlapMissing === 0
      ? overlaps
      : findOverlaps(memberSlots, members.length, { minDurationMinutes: 30 });

  return { overlaps, overlapMissing, fullTeamOverlaps };
}

/**
 * Události kalendáře týmu: termíny, společné časy a zadané časy hráčů.
 *
 * `viewerCharacterId` je postava toho, kdo se dívá - její časy se ukazují
 * jako "můj čas". Moderátor v administraci (null) vidí všechny časy jako
 * časy hráčů, i když je sám v týmu.
 */
export function buildTeamCalendarEvents({
  matches,
  availabilities,
  members,
  fullTeamOverlaps,
  viewerCharacterId,
}: {
  matches: TeamData["matches"];
  availabilities: TeamData["availabilities"];
  members: TeamMemberRef[];
  fullTeamOverlaps: Overlap[];
  viewerCharacterId: string | null;
}): CalendarEvent[] {
  const memberById = new Map(
    members.map((m) => [
      m.characterId,
      { name: m.character.characterName, wowClass: m.character.class },
    ])
  );

  const mySlots = viewerCharacterId
    ? availabilities.filter((a) => a.characterId === viewerCharacterId)
    : [];
  const otherSlots = availabilities.filter((a) => a.characterId !== viewerCharacterId);

  return [
    ...matches.map((match) => ({
      id: `match-${match.id}`,
      start: match.windowStart,
      end: match.windowEnd,
      kind:
        match.status === "PROPOSED"
          ? ("MATCH_PROPOSED" as const)
          : ("MATCH_CONFIRMED" as const),
      label: matchAuthorText(match).name,
      labelColor: classColor(matchAuthorText(match).wowClass),
      detail: `${matchAuthorText(match).name} ${matchAuthorText(match).verb} termín ${formatRange(
        match.windowStart,
        match.windowEnd
      )} - ${MATCH_STATUS_LABELS[match.status].toLowerCase()}`,
    })),
    ...fullTeamOverlaps.map((overlap) => ({
      id: `overlap-${overlap.start.toISOString()}`,
      start: overlap.start,
      end: overlap.end,
      kind: "OVERLAP" as const,
      label: "může tým",
      detail: `Celý tým může ${formatRange(overlap.start, overlap.end)}`,
    })),
    ...mySlots.map((slot) => ({
      id: `slot-${slot.id}`,
      start: slot.start,
      end: slot.end,
      kind: "AVAILABILITY" as const,
      label: "můj čas",
      detail: `Zadal jsi si čas ${formatRange(slot.start, slot.end)}${
        slot.note ? ` (${slot.note})` : ""
      }`,
    })),
    // Časy ostatních se ukazují jednotlivě - jinak by byl cizí čas vidět jen
    // jako překryv, a ten vznikne až když se zapíše celý tým.
    ...otherSlots.map((slot) => {
      const member = memberById.get(slot.characterId);
      const name = member?.name ?? "hráč";

      return {
        id: `slot-${slot.id}`,
        start: slot.start,
        end: slot.end,
        kind: "TEAMMATE_AVAILABILITY" as const,
        label: name,
        labelColor: classColor(member?.wowClass),
        detail: `${name} má čas ${formatRange(slot.start, slot.end)}${
          slot.note ? ` (${slot.note})` : ""
        }`,
      };
    }),
  ];
}
