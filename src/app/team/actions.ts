"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/admin";

function fail(message: string): never {
  redirect("/team?error=" + encodeURIComponent(message));
}

/** Postava přihlášeného uživatele - všechny akce se dějí jejím jménem. */
async function requireCharacter() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nepřihlášený uživatel.");

  const character = await prisma.character.findUnique({
    where: { userId: session.user.id },
    select: { id: true, characterName: true },
  });

  if (!character) throw new Error("K účtu není přiřazená žádná postava.");

  return { user: session.user, character };
}

/** Aktivní členství v týmu - bez něj nemá smysl zadávat časy ani termíny. */
async function requireMembership(characterId: string) {
  const membership = await prisma.teamMembership.findFirst({
    where: { characterId, status: "ACTIVE", teamId: { not: null } },
    orderBy: { joinedAt: "desc" },
  });

  if (!membership?.teamId) {
    fail("Nejsi zařazený v žádném týmu, termíny zadávat nejde.");
  }

  return membership as typeof membership & { teamId: string };
}

function parseRange(formData: FormData) {
  const start = new Date(String(formData.get("start") ?? ""));
  const end = new Date(String(formData.get("end") ?? ""));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    fail("Zadaný čas nedává smysl.");
  }

  if (end <= start) {
    fail("Konec musí být později než začátek.");
  }

  // Delší než den je skoro jistě překlep (např. špatný rok) a rozbilo by to
  // přehled překryvů.
  if (end.getTime() - start.getTime() > 24 * 3600_000) {
    fail("Jeden úsek může být nejvýš 24 hodin. Rozděl ho na víc dnů.");
  }

  return { start, end };
}

/** Přidá úsek, kdy má hráč čas. */
export async function addAvailability(formData: FormData) {
  const { character } = await requireCharacter();
  const membership = await requireMembership(character.id);
  const { start, end } = parseRange(formData);
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.availability.create({
    data: {
      seasonId: membership.seasonId,
      characterId: character.id,
      start,
      end,
      note,
    },
  });

  revalidatePath("/team");
  redirect("/team?saved=1");
}

export async function deleteAvailability(formData: FormData) {
  const { character } = await requireCharacter();
  const id = String(formData.get("availabilityId"));

  const availability = await prisma.availability.findUnique({ where: { id } });

  // Mazat jde jen vlastní čas - id z formuláře se nedá věřit.
  if (!availability || availability.characterId !== character.id) {
    fail("Tenhle záznam ti nepatří.");
  }

  await prisma.availability.delete({ where: { id } });

  revalidatePath("/team");
  redirect("/team?saved=1");
}

/**
 * Navrhne termín zápasu za tým. Navrhnout ho může kdokoli z týmu, schvaluje
 * ho pak moderátor nebo admin.
 */
export async function proposeMatch(formData: FormData) {
  const { user, character } = await requireCharacter();
  const membership = await requireMembership(character.id);
  const { start, end } = parseRange(formData);
  const note = String(formData.get("note") ?? "").trim() || null;

  const duplicate = await prisma.match.findFirst({
    where: {
      teamId: membership.teamId,
      windowStart: start,
      windowEnd: end,
      status: { in: ["PROPOSED", "CONFIRMED"] },
    },
  });

  if (duplicate) {
    fail("Tenhle termín už je navržený.");
  }

  const match = await prisma.match.create({
    data: {
      teamId: membership.teamId,
      proposedById: character.id,
      windowStart: start,
      windowEnd: end,
      note,
      status: "PROPOSED",
    },
  });

  await writeAuditLog(prisma, {
    actorId: user.id,
    actionType: "MATCH_PROPOSED",
    entityType: "Match",
    entityId: match.id,
    newValue: {
      team: membership.teamId,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      proposedBy: character.characterName,
    },
  });

  revalidatePath("/team");
  revalidatePath("/admin/matches");
  redirect("/team?saved=1");
}

/** Zruší vlastní návrh termínu. Schválený termín už ruší jen moderátor. */
export async function deleteMatch(formData: FormData) {
  const { user, character } = await requireCharacter();
  const membership = await requireMembership(character.id);
  const id = String(formData.get("matchId"));

  const match = await prisma.match.findUnique({
    where: { id },
    include: { results: { select: { id: true } } },
  });

  if (!match || match.teamId !== membership.teamId) {
    fail("Tenhle termín nepatří tvému týmu.");
  }

  if (match.status !== "PROPOSED") {
    fail("Schválený termín může zrušit jen moderátor.");
  }

  if (match.results.length > 0) {
    fail("K termínu už jsou navázané výsledky, smazat ho nejde.");
  }

  await prisma.match.delete({ where: { id } });

  await writeAuditLog(prisma, {
    actorId: user.id,
    actionType: "MATCH_DELETED",
    entityType: "Match",
    entityId: id,
    oldValue: {
      windowStart: match.windowStart.toISOString(),
      windowEnd: match.windowEnd.toISOString(),
    },
  });

  revalidatePath("/team");
  revalidatePath("/admin/matches");
  redirect("/team?saved=1");
}
