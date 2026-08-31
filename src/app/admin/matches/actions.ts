"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";

function revalidateMatches() {
  revalidatePath("/admin/matches");
  revalidatePath("/team");
}

function fail(message: string): never {
  redirect("/admin/matches?error=" + encodeURIComponent(message));
}

/** Schválí termín domluvený týmem. */
export async function confirmMatch(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const id = String(formData.get("matchId"));

  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    include: { team: { select: { name: true } } },
  });

  if (match.status !== "PROPOSED") {
    fail("Schválit jde jen navržený termín.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedById: staff.id,
        confirmedAt: new Date(),
      },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_CONFIRMED",
      entityType: "Match",
      entityId: id,
      oldValue: { status: match.status },
      newValue: {
        status: "CONFIRMED",
        team: match.team.name,
        windowStart: match.windowStart.toISOString(),
        windowEnd: match.windowEnd.toISOString(),
      },
    });
  });

  revalidateMatches();
  redirect("/admin/matches?saved=1");
}

/** Vrátí schválený termín mezi návrhy - na opravu překliku nebo změnu plánu. */
export async function revokeMatch(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const id = String(formData.get("matchId"));

  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    include: {
      team: { select: { name: true } },
      results: { select: { id: true } },
    },
  });

  if (match.status !== "CONFIRMED") {
    fail("Vrátit mezi návrhy jde jen schválený termín.");
  }

  if (match.results.length > 0) {
    fail("K termínu už jsou navázané výsledky, schválení zrušit nejde.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id },
      data: { status: "PROPOSED", confirmedById: null, confirmedAt: null },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_CONFIRMATION_REVOKED",
      entityType: "Match",
      entityId: id,
      oldValue: { status: "CONFIRMED", team: match.team.name },
      newValue: { status: "PROPOSED" },
    });
  });

  revalidateMatches();
  redirect("/admin/matches?saved=1");
}
