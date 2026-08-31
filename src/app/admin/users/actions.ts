"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";

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
  redirect("/admin/users?saved=1");
}
