"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requirePermission, writeAuditLog } from "@/lib/admin";
import { can } from "@/lib/permissions";
import { saveSwitchSpecs, type SwitchSpecsState } from "@/lib/switch-specs";
import { specsForClass } from "@/lib/wow-specs";
import { SPEC_ROLE_LABELS } from "@/lib/labels";
import { getCurrentSeason } from "@/lib/season";

const ROLES: UserRole[] = ["ADMIN", "MODERATOR", "USER"];

function fail(message: string): never {
  redirect("/admin/users?error=" + encodeURIComponent(message));
}

/**
 * Změní roli uživatele.
 *
 * Admin si nesmí sebrat vlastní admin práva a nesmí zmizet poslední admin -
 * jinak by se do administrace nikdo nedostal a role by šla opravit jen
 * zásahem do databáze.
 */
export async function updateUserRole(formData: FormData) {
  const admin = await requirePermission("manageUsers");
  const userId = String(formData.get("userId"));
  const rawRole = String(formData.get("role") ?? "");

  if (!ROLES.includes(rawRole as UserRole)) {
    fail(`Neznámá role "${rawRole}".`);
  }

  const role = rawRole as UserRole;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });

  if (user.role === role) {
    redirect("/admin/users");
  }

  if (user.id === admin.id && role !== "ADMIN") {
    fail("Vlastní admin práva si sebrat nemůžeš.");
  }

  if (user.role === "ADMIN" && role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      fail("V aplikaci musí zůstat aspoň jeden admin.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: userId,
      oldValue: { username: user.username, role: user.role },
      newValue: { username: user.username, role },
    });
  });

  revalidatePath("/admin/users");
  // Jméno se posílá do hlášky - v seznamu čtyřiceti řádků se stejným
  // tlačítkem "Uložit" bylo pouhé "Role uložená." k ničemu.
  redirect("/admin/users?saved=" + encodeURIComponent(user.username));
}

/**
 * Switch specu za hráče - když se domluvil jinde (třeba na Discordu), nebo ho
 * hráč vyplnil špatně. Stejná pravidla jako v profilu, jen do audit logu se
 * zapíše admin. userId se váže na formulář přes .bind na stránce.
 */
export async function saveSwitchSpecsForUser(
  userId: string,
  _previous: SwitchSpecsState,
  formData: FormData
): Promise<SwitchSpecsState> {
  const admin = await getCurrentUser();

  // Chyba jako stav formuláře, ne výjimka - formulář je přes useFormState
  // a výjimka by místo hlášky shodila celou stránku.
  if (!admin || !can(admin.role, "manageSwitchSpecs")) {
    return { status: "error", message: "Na úpravu switche nemáš oprávnění." };
  }

  const character = await prisma.character.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!character) {
    return { status: "error", message: "Uživatel nemá založenou postavu." };
  }

  const state = await saveSwitchSpecs({
    characterId: character.id,
    actorId: admin.id,
    formData,
    self: false,
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/shuffle");
  revalidatePath("/admin/teams");
  return state;
}

export interface MainSpecState {
  status: "idle" | "ok" | "warning" | "error";
  message: string;
}

/**
 * Oprava hlavního specu postavy - typicky když hráč v registraci nechal spec
 * na Raider.io a to ho naposledy vidělo s jiným specem, než na jaký se hlásil.
 * Role se nastaví podle specu, aby se nemohly znovu rozejít - shuffle bere
 * roli, spec jen na ranged/melee, brez a lust.
 *
 * Členství v týmech se nemění: rozdělení je už hotové a o roli v týmu
 * rozhoduje stránka Týmy. Když roli v týmu změna rozbije, admin dostane
 * upozornění.
 */
export async function saveMainSpecForUser(
  userId: string,
  _previous: MainSpecState,
  formData: FormData
): Promise<MainSpecState> {
  const admin = await getCurrentUser();

  if (!admin || !can(admin.role, "manageSwitchSpecs")) {
    return { status: "error", message: "Na úpravu specu nemáš oprávnění." };
  }

  const season = await getCurrentSeason();
  const character = await prisma.character.findUnique({
    where: { userId },
    include: {
      switchSpecs: true,
      // Starší sezóny jsou odehrané, na ty se už nesahá.
      teamMemberships: {
        where: {
          seasonId: season?.id ?? "",
          status: { not: "REMOVED" },
          wowSpec: null,
        },
        include: { team: { select: { name: true } } },
      },
    },
  });

  if (!character) {
    return { status: "error", message: "Uživatel nemá založenou postavu." };
  }

  const specName = String(formData.get("mainSpec") ?? "");
  const spec = specsForClass(character.class).find((s) => s.specName === specName);

  if (!spec) {
    return {
      status: "error",
      message: "Vybraný spec k postavě nepatří. Načti stránku znovu a zkus to ještě jednou.",
    };
  }

  if (spec.specName === character.wowSpec && spec.role === character.specRole) {
    return { status: "ok", message: "Beze změny - postava už ten spec má." };
  }

  // Hlavní spec se ve switchi nenabízí - když ho hráč měl vybraný ke switchi,
  // ze switche zmizí, jinak by ho shuffle nabízel jako přepnutí sám na sebe.
  const droppedSwitch = character.switchSpecs.find(
    (s) => s.specName === spec.specName
  );

  await prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: character.id },
      data: { wowSpec: spec.specName, specRole: spec.role },
    });

    if (droppedSwitch) {
      await tx.characterSwitchSpec.delete({ where: { id: droppedSwitch.id } });
    }

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "MAIN_SPEC_UPDATED",
      entityType: "Character",
      entityId: character.id,
      oldValue: { wowSpec: character.wowSpec, specRole: character.specRole },
      newValue: {
        wowSpec: spec.specName,
        specRole: spec.role,
        droppedSwitchSpec: droppedSwitch?.specName ?? null,
      },
    });
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/shuffle");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/registrations");

  const saved = `Uloženo: ${spec.specName}, role ${SPEC_ROLE_LABELS[spec.role]}.`;

  // Hráč hrající v týmu hlavní spec (wowSpec null) má teď v týmu jinou roli,
  // než jakou hlavní spec hraje.
  const brokenTeams = character.teamMemberships.filter(
    (m) => m.roleInTeam !== spec.role
  );

  if (brokenTeams.length > 0) {
    const where = brokenTeams
      .map((m) =>
        m.status === "SUBSTITUTE"
          ? `mezi náhradníky jako ${SPEC_ROLE_LABELS[m.roleInTeam]}`
          : `v týmu ${m.team?.name ?? "bez názvu"} jako ${SPEC_ROLE_LABELS[m.roleInTeam]}`
      )
      .join(", ");

    return {
      status: "warning",
      message: `${saved} Hráč je ale zařazený ${where} - roli mu uprav na stránce Týmy.`,
    };
  }

  return {
    status: "ok",
    message: droppedSwitch
      ? `${saved} ${spec.specName} zmizel ze switch speců, je to teď hlavní spec.`
      : saved,
  };
}
