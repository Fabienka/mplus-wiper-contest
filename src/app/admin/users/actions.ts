"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requirePermission, writeAuditLog } from "@/lib/admin";
import { can } from "@/lib/permissions";
import { saveSwitchSpecs, type SwitchSpecsState } from "@/lib/switch-specs";

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
