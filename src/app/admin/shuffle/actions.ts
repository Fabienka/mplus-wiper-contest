"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";
import { plural } from "@/lib/labels";
import {
  runShuffle,
  type ShufflePlayer,
  type StoredRuleViolations,
  type StoredTeamAssignments,
} from "@/lib/shuffle";

function revalidateShuffle() {
  revalidatePath("/admin");
  revalidatePath("/admin/shuffle");
}

function fail(message: string): never {
  redirect("/admin/shuffle?error=" + encodeURIComponent(message));
}

/**
 * Spustí shuffle nad schválenými registracemi sezóny a uloží 3 navržené
 * varianty. Běhy se nepřepisují - každé spuštění zakládá nový ShuffleRun,
 * takže je dohledatelné, co algoritmus kdy navrhl.
 */
export async function runShuffleForSeason(formData: FormData) {
  const admin = await requirePermission("runShuffle");
  const seasonId = String(formData.get("seasonId"));

  const registrations = await prisma.seasonRegistration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: { character: true },
  });

  if (registrations.length === 0) {
    fail("Sezóna nemá žádné schválené registrace, není z čeho skládat týmy.");
  }

  const players: ShufflePlayer[] = registrations.map((registration) => ({
    characterId: registration.character.id,
    characterName: registration.character.characterName,
    className: registration.character.class,
    wowSpec: registration.character.wowSpec,
    specRole: registration.character.specRole,
    // RIO se používá jen na rozdělení do košů; chybějící skóre spadne naspod.
    rioScore: registration.character.rioScore ?? 0,
  }));

  const result = runShuffle(players);

  if (result.variants.length === 0) {
    fail(
      result.warnings.join(" ") ||
        "Shuffle nevrátil žádnou variantu."
    );
  }

  await prisma.$transaction(async (tx) => {
    const run = await tx.shuffleRun.create({
      data: {
        seasonId,
        executedById: admin.id,
        seed: result.seed,
        status: "PROPOSED",
      },
    });

    for (const variant of result.variants) {
      const teamAssignments: StoredTeamAssignments = {
        teamCount: result.teamCount,
        teams: variant.teams,
        substitutes: variant.substitutes,
      };

      const ruleViolations: StoredRuleViolations = {
        breakdown: variant.breakdown,
        warnings: result.warnings,
      };

      await tx.shuffleProposal.create({
        data: {
          shuffleRunId: run.id,
          variantNumber: variant.variantNumber,
          score: variant.score,
          teamAssignments: teamAssignments as unknown as object,
          ruleViolations: ruleViolations as unknown as object,
        },
      });
    }

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "SHUFFLE_RUN",
      entityType: "ShuffleRun",
      entityId: run.id,
      newValue: {
        seed: result.seed,
        teamCount: result.teamCount,
        players: players.length,
        variants: result.variants.map((v) => ({
          variantNumber: v.variantNumber,
          score: v.score,
        })),
      },
    });
  });

  revalidateShuffle();
  redirect("/admin/shuffle");
}

/**
 * Potvrdí vybranou variantu - založí týmy a členství. Náhradníci se zakládají
 * taky, jen bez týmu (status SUBSTITUTE), aby bylo vidět, kdo se do sezóny
 * přihlásil a zbyl.
 */
export async function applyVariant(formData: FormData) {
  const admin = await requirePermission("runShuffle");
  const proposalId = String(formData.get("proposalId"));

  const proposal = await prisma.shuffleProposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { shuffleRun: true },
  });

  const seasonId = proposal.shuffleRun.seasonId;

  // Rozdělení do týmů je destruktivní krok - přepsání existujících týmů by
  // zahodilo i navázané zápasy, takže se radši nedělá vůbec.
  const existingMemberships = await prisma.teamMembership.count({
    where: { seasonId },
  });

  if (existingMemberships > 0) {
    fail(
      "Sezóna už má rozdělené týmy. Než půjde použít jiná varianta, musí se stávající týmy a členství smazat ručně."
    );
  }

  const assignments = proposal.teamAssignments as unknown as StoredTeamAssignments;

  // Návrh je snapshot - mezi spuštěním shuffle a potvrzením mohl admin někoho
  // zamítnout nebo smazat, což by jinak spadlo až na cizím klíči.
  const proposedIds = [
    ...assignments.teams.flatMap((team) => team.members.map((m) => m.characterId)),
    ...assignments.substitutes.map((s) => s.characterId),
  ];

  const stillApproved = await prisma.seasonRegistration.findMany({
    where: {
      seasonId,
      status: "APPROVED",
      characterId: { in: proposedIds },
    },
    select: { characterId: true },
  });

  const approvedIds = new Set(stillApproved.map((r) => r.characterId));
  const missing = proposedIds.filter((id) => !approvedIds.has(id));

  if (missing.length > 0) {
    fail(
      `Od spuštění shuffle se změnily registrace (${missing.length} ${plural(missing.length, "postava už není schválená", "postavy už nejsou schválené", "postav už není schválených")}). Spusť shuffle znovu.`
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const team of assignments.teams) {
      const created = await tx.team.create({
        data: { seasonId, name: `Tým ${team.teamIndex + 1}` },
      });

      for (const member of team.members) {
        await tx.teamMembership.create({
          data: {
            seasonId,
            teamId: created.id,
            characterId: member.characterId,
            roleInTeam: member.roleInTeam,
            status: "ACTIVE",
          },
        });
      }
    }

    for (const substitute of assignments.substitutes) {
      await tx.teamMembership.create({
        data: {
          seasonId,
          teamId: null,
          characterId: substitute.characterId,
          roleInTeam: substitute.roleInTeam,
          status: "SUBSTITUTE",
        },
      });
    }

    await tx.shuffleRun.update({
      where: { id: proposal.shuffleRunId },
      data: { status: "APPLIED" },
    });

    // Schema si nepamatuje, která varianta se použila - drží to audit log.
    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "SHUFFLE_VARIANT_APPLIED",
      entityType: "ShuffleProposal",
      entityId: proposal.id,
      newValue: {
        shuffleRunId: proposal.shuffleRunId,
        variantNumber: proposal.variantNumber,
        score: proposal.score,
        teams: assignments.teams.length,
        substitutes: assignments.substitutes.length,
      },
    });
  });

  revalidateShuffle();
  redirect("/admin/shuffle?applied=1");
}
