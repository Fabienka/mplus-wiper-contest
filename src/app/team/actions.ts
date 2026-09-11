"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/admin";
import {
  RecordResultError,
  recordManualResult,
  recordRunResult,
} from "@/lib/record-result";
import { OVER_TIME_LIMIT_REASON } from "@/lib/time-budget";
import { timeRangeError } from "@/lib/datetime-input";
import {
  MAX_KEY_LEVEL,
  MIN_KEY_LEVEL,
  manualResultOutcome,
  parseKeyLevelInput,
  parseManualResultForm,
  readDateTimeField,
} from "@/lib/manual-result-form";

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
  const start = readDateTimeField(formData, "start");
  const end = readDateTimeField(formData, "end");

  const error = timeRangeError(start, end);
  if (error) fail(error);

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

function parseKeyLevel(formData: FormData, field: string, label: string): number {
  const level = parseKeyLevelInput(String(formData.get(field) ?? ""));

  if (level === null) {
    fail(`Výška ${label} musí být celé číslo od ${MIN_KEY_LEVEL} do ${MAX_KEY_LEVEL}.`);
  }

  return level;
}

/**
 * Zapíše týmový reroll klíče. Tým má na celou soutěž jeden - zapsat ho může
 * kdokoli z týmu, jen jednou. Zrušit zapsaný reroll smí už jen admin
 * (resetTeamReroll v admin/teams/actions.ts).
 */
export async function recordReroll(formData: FormData) {
  const { user, character } = await requireCharacter();
  const membership = await requireMembership(character.id);

  const activeDungeons = await prisma.seasonDungeon.findMany({
    where: { seasonId: membership.seasonId, isActive: true },
    select: { dungeonName: true },
  });
  const activeNames = new Set(activeDungeons.map((d) => d.dungeonName));

  const fromDungeonName = String(formData.get("fromDungeon") ?? "");
  const toDungeonName = String(formData.get("toDungeon") ?? "");

  // Nabídka ve formuláři je jen pomůcka - hodnotě z formuláře se nedá věřit.
  if (!activeNames.has(fromDungeonName) || !activeNames.has(toDungeonName)) {
    fail("Vyber oba dungeony z nabídky aktivních dungeonů sezóny.");
  }

  const fromKeyLevel = parseKeyLevel(formData, "fromLevel", "původního klíče");
  const toKeyLevel = parseKeyLevel(formData, "toLevel", "nového klíče");

  if (fromDungeonName === toDungeonName && fromKeyLevel === toKeyLevel) {
    fail("Původní a nový klíč jsou stejné.");
  }

  let reroll;
  try {
    reroll = await prisma.teamReroll.create({
      data: {
        teamId: membership.teamId,
        fromDungeonName,
        fromKeyLevel,
        toDungeonName,
        toKeyLevel,
        recordedById: character.id,
      },
    });
  } catch (err) {
    // Unikátní teamId: reroll už je zapsaný - třeba ho mezitím odeslal
    // spoluhráč, kterému stránka ještě ukazovala formulář.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      fail("Tým už reroll využil. Opravit zapsaný reroll může jen admin.");
    }
    throw err;
  }

  await writeAuditLog(prisma, {
    actorId: user.id,
    actionType: "TEAM_REROLL_RECORDED",
    entityType: "TeamReroll",
    entityId: reroll.id,
    newValue: {
      team: membership.teamId,
      from: `${fromDungeonName} +${fromKeyLevel}`,
      to: `${toDungeonName} +${toKeyLevel}`,
      recordedBy: character.characterName,
    },
  });

  revalidatePath("/team");
  revalidatePath("/admin/teams");
  redirect("/team?saved=1");
}

/**
 * Nahraje výsledek běhu z odkazu na Raider.io.
 *
 * Vlastní logika je v src/lib/record-result.ts, aby se dala spustit i mimo
 * server action. Tady zbývá jen ověření, kdo akci vyvolal, a překlad chyby
 * na hlášku pro uživatele.
 */
export async function addRunResult(formData: FormData) {
  const { user, character } = await requireCharacter();
  const membership = await requireMembership(character.id);

  let outcome;
  try {
    outcome = await recordRunResult(prisma, {
      matchId: String(formData.get("matchId")),
      runInput: String(formData.get("runUrl") ?? ""),
      actorId: user.id,
      requireTeamId: membership.teamId,
    });
  } catch (err) {
    if (err instanceof RecordResultError) fail(err.message);
    throw err;
  }

  revalidatePath("/team");
  revalidatePath("/admin/matches");

  const reasons = outcome.overTimeLimit
    ? [...outcome.evaluation.reasons, OVER_TIME_LIMIT_REASON]
    : outcome.evaluation.reasons;

  redirect(
    reasons.length === 0
      ? "/team?saved=1"
      : "/team?error=" +
          encodeURIComponent(`Běh se uložil, ale nepočítá se: ${reasons.join(" ")}`)
  );
}

/**
 * Ručně zadaný běh se screenshotem - pro běhy, které na Raider.io nejsou.
 * Nepočítá se, dokud ho neověří moderátor.
 *
 * Formulář čte parseManualResultForm - stejný používá moderátor na detailu
 * týmu v administraci, ať se kontroly nerozejdou. Jádro je v recordManualResult.
 */
export async function addManualResult(formData: FormData) {
  const { user, character } = await requireCharacter();
  const membership = await requireMembership(character.id);

  const parsed = await parseManualResultForm(formData);
  if (!parsed.ok) fail(parsed.message);

  let outcome;
  try {
    outcome = await recordManualResult(prisma, {
      ...parsed.value,
      actorId: user.id,
      requireTeamId: membership.teamId,
    });
  } catch (err) {
    if (err instanceof RecordResultError) fail(err.message);
    throw err;
  }

  revalidatePath("/team");
  revalidatePath("/admin/matches");

  const next = manualResultOutcome(outcome, parsed.value.abandoned, false);
  redirect(
    "error" in next
      ? "/team?error=" + encodeURIComponent(next.error)
      : `/team?saved=${next.saved}`
  );
}
