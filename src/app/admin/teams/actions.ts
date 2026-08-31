"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MembershipStatus, SpecRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";
import { plural } from "@/lib/labels";

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
 * Smaže všechny týmy a členství sezóny, aby šlo rozdělení postavit znovu.
 *
 * Zápasy na týmech visí přes cizí klíč s RESTRICT - kdyby nějaké existovaly,
 * mazání by spadlo až v databázi, takže se kontrolují dopředu a admin dostane
 * srozumitelnou hlášku.
 */
export async function deleteAllTeams(formData: FormData) {
  const admin = await requirePermission("manageTeams");
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
