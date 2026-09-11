"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MembershipStatus, SpecRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";
import { plural } from "@/lib/labels";
import {
  RecordResultError,
  recordManualResult,
  recordRunResult,
} from "@/lib/record-result";
import { manualResultOutcome, parseManualResultForm } from "@/lib/manual-result-form";
import { OVER_TIME_LIMIT_REASON } from "@/lib/time-budget";
import { readDateTimeField } from "@/lib/manual-result-form";
import { timeRangeError } from "@/lib/datetime-input";

function revalidateTeams() {
  revalidatePath("/admin");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/shuffle");
}

function fail(message: string): never {
  redirect("/admin/teams?error=" + encodeURIComponent(message));
}

const ROLES: SpecRole[] = ["TANK", "HEALER", "DPS"];

interface Destination {
  teamId: string | null;
  status: MembershipStatus;
}

/**
 * Cíl přesunu z formuláře: "team:<id>" | "sub" | "removed".
 * Vrací null, když se hodnota ve formuláři vůbec neobjevila.
 */
function parseDestination(raw: string, teamIds: Set<string>): Destination | null {
  if (!raw) return null;
  if (raw === "sub") return { teamId: null, status: "SUBSTITUTE" };
  if (raw === "removed") return { teamId: null, status: "REMOVED" };

  if (raw.startsWith("team:")) {
    const teamId = raw.slice("team:".length);
    if (!teamIds.has(teamId)) {
      throw new Error("Tým, do kterého se hráč přesouvá, v sezóně neexistuje.");
    }
    return { teamId, status: "ACTIVE" };
  }

  throw new Error(`Neznámý cíl přesunu "${raw}".`);
}

/**
 * Uloží ruční úpravy - přesuny mezi týmy, náhradníky a vyřazenými, změny role
 * v týmu a přejmenování týmů.
 *
 * Rozbité složení týmu (jiné než 1 tank + 1 healer + 3 DPS) se schválně
 * nezakazuje - admin může potřebovat mezikrok. Stránka takový tým označí.
 *
 * Smí i moderátor - nic se tu nemaže, všechny přesuny jdou vzít zpátky.
 */
export async function updateTeams(formData: FormData) {
  const admin = await requirePermission("manageTeams");
  const seasonId = String(formData.get("seasonId"));

  const [teams, memberships] = await Promise.all([
    prisma.team.findMany({ where: { seasonId } }),
    prisma.teamMembership.findMany({
      where: { seasonId },
      include: { character: { select: { characterName: true } } },
    }),
  ]);

  const teamIds = new Set(teams.map((team) => team.id));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  await prisma.$transaction(async (tx) => {
    for (const team of teams) {
      const name = String(formData.get(`teamname-${team.id}`) ?? "").trim();

      if (!name || name === team.name) continue;

      await tx.team.update({ where: { id: team.id }, data: { name } });

      await writeAuditLog(tx, {
        actorId: admin.id,
        actionType: "TEAM_RENAMED",
        entityType: "Team",
        entityId: team.id,
        oldValue: { name: team.name },
        newValue: { name },
      });
    }

    for (const membership of memberships) {
      const destination = parseDestination(
        String(formData.get(`dest-${membership.id}`) ?? ""),
        teamIds
      );

      if (!destination) continue;

      const rawRole = String(formData.get(`role-${membership.id}`) ?? "");
      const roleInTeam = ROLES.includes(rawRole as SpecRole)
        ? (rawRole as SpecRole)
        : membership.roleInTeam;

      const unchanged =
        destination.teamId === membership.teamId &&
        destination.status === membership.status &&
        roleInTeam === membership.roleInTeam;

      if (unchanged) continue;

      // removedAt drží jen vyřazený hráč - při návratu do hry se zase maže.
      const removedAt =
        destination.status === "REMOVED"
          ? membership.removedAt ?? new Date()
          : null;

      await tx.teamMembership.update({
        where: { id: membership.id },
        data: {
          teamId: destination.teamId,
          status: destination.status,
          roleInTeam,
          removedAt,
        },
      });

      await writeAuditLog(tx, {
        actorId: admin.id,
        actionType: "TEAM_MEMBERSHIP_UPDATED",
        entityType: "TeamMembership",
        entityId: membership.id,
        oldValue: {
          characterName: membership.character.characterName,
          team: membership.teamId ? teamNames.get(membership.teamId) : null,
          status: membership.status,
          roleInTeam: membership.roleInTeam,
        },
        newValue: {
          characterName: membership.character.characterName,
          team: destination.teamId ? teamNames.get(destination.teamId) : null,
          status: destination.status,
          roleInTeam,
        },
      });
    }
  });

  revalidateTeams();
  redirect("/admin/teams?saved=1");
}

/**
 * Zařadí schváleného hráče, který ještě nemá členství - typicky někoho
 * schváleného až po spuštění shuffle. Přidává se mezi náhradníky, odkud ho
 * jde přesunout do týmu.
 */
export async function addAsSubstitute(formData: FormData) {
  const admin = await requirePermission("manageTeams");
  const seasonId = String(formData.get("seasonId"));
  const characterId = String(formData.get("characterId"));

  const registration = await prisma.seasonRegistration.findFirst({
    where: { seasonId, characterId, status: "APPROVED" },
    include: { character: { select: { characterName: true, specRole: true } } },
  });

  if (!registration) {
    fail("Postava nemá v této sezóně schválenou registraci.");
  }

  const existing = await prisma.teamMembership.findFirst({
    where: { seasonId, characterId },
  });

  if (existing) {
    fail("Postava už v sezóně členství má.");
  }

  await prisma.$transaction(async (tx) => {
    const membership = await tx.teamMembership.create({
      data: {
        seasonId,
        teamId: null,
        characterId,
        roleInTeam: registration.character.specRole,
        status: "SUBSTITUTE",
      },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "TEAM_MEMBERSHIP_ADDED",
      entityType: "TeamMembership",
      entityId: membership.id,
      newValue: {
        characterName: registration.character.characterName,
        status: "SUBSTITUTE",
      },
    });
  });

  revalidateTeams();
  redirect("/admin/teams?saved=1");
}

/**
 * Zruší zapsaný reroll klíče týmu - typicky kvůli překlepu. Tým si ho pak
 * může zapsat znovu. Maže záznam, proto jen admin.
 */
export async function resetTeamReroll(formData: FormData) {
  const admin = await requirePermission("resetTeamReroll");
  const teamId = String(formData.get("teamId"));

  const reroll = await prisma.teamReroll.findUnique({
    where: { teamId },
    include: {
      team: { select: { name: true } },
      recordedBy: { select: { characterName: true } },
    },
  });

  if (!reroll) {
    fail("Tým nemá zapsaný žádný reroll.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamReroll.delete({ where: { id: reroll.id } });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "TEAM_REROLL_RESET",
      entityType: "TeamReroll",
      entityId: reroll.id,
      oldValue: {
        team: reroll.team.name,
        from: `${reroll.fromDungeonName} +${reroll.fromKeyLevel}`,
        to: `${reroll.toDungeonName} +${reroll.toKeyLevel}`,
        recordedBy: reroll.recordedBy.characterName,
      },
    });
  });

  revalidateTeams();
  revalidatePath("/team");
  redirect("/admin/teams?saved=1");
}

/**
 * Smaže všechny týmy a členství sezóny, aby šlo rozdělení postavit znovu.
 *
 * Zápasy na týmech visí přes cizí klíč s RESTRICT - kdyby nějaké existovaly,
 * mazání by spadlo až v databázi, takže se kontrolují dopředu a admin dostane
 * srozumitelnou hlášku.
 */
export async function deleteAllTeams(formData: FormData) {
  const admin = await requirePermission("deleteTeams");
  const seasonId = String(formData.get("seasonId"));

  const [teamCount, membershipCount, matchCount] = await Promise.all([
    prisma.team.count({ where: { seasonId } }),
    prisma.teamMembership.count({ where: { seasonId } }),
    prisma.match.count({ where: { team: { seasonId } } }),
  ]);

  if (teamCount === 0 && membershipCount === 0) {
    fail("Sezóna žádné týmy nemá.");
  }

  if (matchCount > 0) {
    fail(
      `Týmy nejde smazat - v sezóně ${plural(matchCount, "je", "jsou", "je")} ${matchCount} ${plural(matchCount, "zápas", "zápasy", "zápasů")}. Nejdřív je potřeba smazat zápasy a jejich výsledky.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMembership.deleteMany({ where: { seasonId } });
    await tx.team.deleteMany({ where: { seasonId } });

    // Použitý shuffle běh se vrací mezi návrhy - jeho varianty jde zase použít.
    await tx.shuffleRun.updateMany({
      where: { seasonId, status: "APPLIED" },
      data: { status: "PROPOSED" },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "TEAMS_DELETED",
      entityType: "Season",
      entityId: seasonId,
      oldValue: { teams: teamCount, memberships: membershipCount },
    });
  });

  revalidateTeams();
  redirect("/admin/teams?deleted=1");
}

// ---------- Detail týmu (/admin/teams/[id]) ----------

function failTeam(teamId: string, message: string): never {
  redirect(`/admin/teams/${teamId}?error=` + encodeURIComponent(message));
}

function revalidateTeamDetail(teamId: string) {
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/matches");
  revalidatePath("/team");
}

/**
 * Nahraje za tým běh z Raider.io - stejně jako hráč na Můj tým, jen tým se
 * bere z adresy detailu a zápas se ověří proti němu.
 */
export async function staffAddRunResult(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const teamId = String(formData.get("teamId"));

  let outcome;
  try {
    outcome = await recordRunResult(prisma, {
      matchId: String(formData.get("matchId")),
      runInput: String(formData.get("runUrl") ?? ""),
      actorId: staff.id,
      requireTeamId: teamId,
    });
  } catch (err) {
    if (err instanceof RecordResultError) failTeam(teamId, err.message);
    throw err;
  }

  revalidateTeamDetail(teamId);

  const reasons = outcome.overTimeLimit
    ? [...outcome.evaluation.reasons, OVER_TIME_LIMIT_REASON]
    : outcome.evaluation.reasons;

  if (reasons.length > 0) {
    failTeam(teamId, `Běh se uložil, ale nepočítá se: ${reasons.join(" ")}`);
  }

  redirect(`/admin/teams/${teamId}?saved=1`);
}

/**
 * Ručně zadaný běh za tým. Kdo ho zapsal ze screenshotu, ten ho zkontroloval -
 * běh je rovnou ověřený a platí podle automatické kontroly.
 */
export async function staffAddManualResult(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const teamId = String(formData.get("teamId"));

  const parsed = await parseManualResultForm(formData);
  if (!parsed.ok) failTeam(teamId, parsed.message);

  let outcome;
  try {
    outcome = await recordManualResult(prisma, {
      ...parsed.value,
      actorId: staff.id,
      requireTeamId: teamId,
      verifiedById: staff.id,
    });
  } catch (err) {
    if (err instanceof RecordResultError) failTeam(teamId, err.message);
    throw err;
  }

  revalidateTeamDetail(teamId);

  const next = manualResultOutcome(outcome, parsed.value.abandoned, true);
  if ("error" in next) failTeam(teamId, next.error);

  redirect(`/admin/teams/${teamId}?saved=${next.saved}`);
}

/**
 * Přidá termín za tým - pro tým, který ho v aplikaci nechtěl vyplňovat sám.
 *
 * Přidává admin nebo moderátor, kteří termíny stejně schvalují, takže je
 * rovnou schválený. Navrhovatel z týmu u něj není (proposedById prázdné) -
 * zapíše se, kdo ho přidal (createdById), ať není vydávaný za návrh hráče.
 */
export async function staffAddMatch(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const teamId = String(formData.get("teamId"));

  const start = readDateTimeField(formData, "start");
  const end = readDateTimeField(formData, "end");
  const rangeError = timeRangeError(start, end);
  if (rangeError) failTeam(teamId, rangeError);

  const note = String(formData.get("note") ?? "").trim() || null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  if (!team) fail("Tým neexistuje.");

  const duplicate = await prisma.match.findFirst({
    where: {
      teamId,
      windowStart: start,
      windowEnd: end,
      status: { in: ["PROPOSED", "CONFIRMED"] },
    },
  });

  if (duplicate) failTeam(teamId, "Tenhle termín už tým má.");

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.create({
      data: {
        teamId,
        createdById: staff.id,
        windowStart: start,
        windowEnd: end,
        note,
        status: "CONFIRMED",
        confirmedById: staff.id,
        confirmedAt: new Date(),
      },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_CREATED",
      entityType: "Match",
      entityId: match.id,
      newValue: {
        team: team.name,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        status: "CONFIRMED",
      },
    });
  });

  revalidateTeamDetail(teamId);
  redirect(`/admin/teams/${teamId}?saved=match`);
}

// ---------- Časovač herního času (MatchTimer) ----------

function timerIds(formData: FormData) {
  return {
    matchId: String(formData.get("matchId")),
    teamId: String(formData.get("teamId")),
  };
}

/** Zápas týmu z detailu - id z formuláře se nedá věřit. */
async function loadTeamMatch(matchId: string, teamId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { teamId: true, status: true, timerElapsedSeconds: true, timerStartedAt: true },
  });

  if (!match || match.teamId !== teamId) {
    failTeam(teamId, "Termín nepatří tomuhle týmu.");
  }

  return match;
}

/** Spustí (nebo po pozastavení znovu rozběhne) časovač zápasu. */
export async function startMatchTimer(formData: FormData) {
  await requirePermission("approveMatchTerms");
  const { matchId, teamId } = timerIds(formData);
  const match = await loadTeamMatch(matchId, teamId);

  if (match.status !== "CONFIRMED") {
    failTeam(teamId, "Časovač jde pustit jen u schváleného termínu.");
  }

  // Jen když neběží - dvojklik ani dva moderátoři naráz ho nesmí restartovat
  // a zahodit tím běžící úsek.
  await prisma.match.updateMany({
    where: { id: matchId, timerStartedAt: null },
    data: { timerStartedAt: new Date() },
  });

  revalidatePath(`/admin/teams/${teamId}`);
  redirect(`/admin/teams/${teamId}`);
}

/** Pozastaví časovač - běžící úsek se přičte k naměřenému času. */
export async function pauseMatchTimer(formData: FormData) {
  await requirePermission("approveMatchTerms");
  const { matchId, teamId } = timerIds(formData);
  const match = await loadTeamMatch(matchId, teamId);

  if (match.timerStartedAt) {
    const running = Math.floor((Date.now() - match.timerStartedAt.getTime()) / 1000);

    // Podmínka na původní začátek: kdyby ho mezitím pozastavil někdo jiný,
    // úsek se nepřičte dvakrát.
    await prisma.match.updateMany({
      where: { id: matchId, timerStartedAt: match.timerStartedAt },
      data: {
        timerStartedAt: null,
        timerElapsedSeconds: match.timerElapsedSeconds + Math.max(0, running),
      },
    });
  }

  revalidatePath(`/admin/teams/${teamId}`);
  redirect(`/admin/teams/${teamId}`);
}

/**
 * Vynuluje časovač - třeba po spuštění omylem. Zapsané běhy se nemění.
 * Na rozdíl od spuštění a pozastavení se zapisuje do auditu: zahazuje
 * naměřený čas.
 */
export async function resetMatchTimer(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const { matchId, teamId } = timerIds(formData);
  const match = await loadTeamMatch(matchId, teamId);

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { timerStartedAt: null, timerElapsedSeconds: 0 },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_TIMER_RESET",
      entityType: "Match",
      entityId: matchId,
      oldValue: {
        timerElapsedSeconds: match.timerElapsedSeconds,
        running: match.timerStartedAt !== null,
      },
      newValue: { timerElapsedSeconds: 0 },
    });
  });

  revalidatePath(`/admin/teams/${teamId}`);
  redirect(`/admin/teams/${teamId}`);
}

/** Neveřejná poznámka k týmu - vidí ji jen admini a moderátoři. */
export async function addTeamNote(formData: FormData) {
  const staff = await requirePermission("manageTeams");
  const teamId = String(formData.get("teamId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!body) failTeam(teamId, "Poznámka je prázdná.");
  if (body.length > 2000) failTeam(teamId, "Poznámka může mít nejvýš 2000 znaků.");

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });

  if (!team) fail("Tým neexistuje.");

  await prisma.$transaction(async (tx) => {
    const note = await tx.teamNote.create({
      data: { teamId, authorId: staff.id, body },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "TEAM_NOTE_ADDED",
      entityType: "TeamNote",
      entityId: note.id,
      newValue: { team: team.name },
    });
  });

  revalidatePath(`/admin/teams/${teamId}`);
  redirect(`/admin/teams/${teamId}?saved=note`);
}
