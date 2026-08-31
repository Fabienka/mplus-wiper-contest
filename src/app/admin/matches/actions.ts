"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";
import { recomputeOfficialResult } from "@/lib/match-official";

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

/**
 * Uzavře zápas - výsledky se tím zamknou a tým už nemůže nahrát další běh.
 *
 * Dělá se to ručně, ne automaticky koncem okna, aby šlo doplnit běh odehraný
 * těsně před koncem. Po uzavření může zasáhnout už jen admin.
 */
export async function closeMatch(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const id = String(formData.get("matchId"));

  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    include: {
      team: { select: { name: true } },
      results: { select: { id: true, isOfficial: true, points: true } },
    },
  });

  if (match.status !== "CONFIRMED") {
    fail(
      match.status === "PROPOSED"
        ? "Uzavřít jde jen schválený termín."
        : "Zápas už je uzavřený."
    );
  }

  const official = match.results.find((r) => r.isOfficial) ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id }, data: { status: "COMPLETED" } });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_CLOSED",
      entityType: "Match",
      entityId: id,
      oldValue: { status: match.status },
      newValue: {
        status: "COMPLETED",
        team: match.team.name,
        results: match.results.length,
        officialPoints: official?.points ?? null,
      },
    });
  });

  revalidateMatches();
  redirect("/admin/matches?saved=1");
}

/**
 * Znovu otevře uzavřený zápas - na opravu překliku nebo dodatečné doplnění
 * běhu. Vrací se do stavu, kdy jdou přidávat výsledky.
 */
export async function reopenMatch(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const id = String(formData.get("matchId"));

  const match = await prisma.match.findUniqueOrThrow({ where: { id } });

  if (match.status !== "COMPLETED") {
    fail("Znovu otevřít jde jen uzavřený zápas.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id }, data: { status: "CONFIRMED" } });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "MATCH_REOPENED",
      entityType: "Match",
      entityId: id,
      oldValue: { status: "COMPLETED" },
      newValue: { status: "CONFIRMED" },
    });
  });

  revalidateMatches();
  redirect("/admin/matches?saved=1");
}

/**
 * Ruční přepnutí platnosti výsledku moderátorem.
 *
 * Automatická kontrola nemusí pokrýt všechno (výpadek Raider.io, výjimka
 * domluvená předem), proto musí jít rozhodnutí přebít. Oficiální výsledek se
 * hned přepočítá, ať se pořadí nerozejde.
 */
export async function setResultValidity(formData: FormData) {
  const staff = await requirePermission("approveMatchTerms");
  const resultId = String(formData.get("resultId"));
  const valid = String(formData.get("valid")) === "1";
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await prisma.matchResult.findUniqueOrThrow({
    where: { id: resultId },
    include: { match: { select: { id: true, status: true } } },
  });

  if (result.match.status === "COMPLETED") {
    fail("Zápas je uzavřený. Nejdřív ho znovu otevři.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.update({
      where: { id: resultId },
      data: {
        isValid: valid,
        invalidReason: valid ? null : note ?? result.invalidReason,
        verifiedById: staff.id,
      },
    });

    await recomputeOfficialResult(tx, result.match.id);

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: valid ? "MATCH_RESULT_VALIDATED" : "MATCH_RESULT_INVALIDATED",
      entityType: "MatchResult",
      entityId: resultId,
      oldValue: { isValid: result.isValid, invalidReason: result.invalidReason },
      newValue: { isValid: valid, invalidReason: valid ? null : note },
    });
  });

  revalidateMatches();
  redirect("/admin/matches?saved=1");
}
