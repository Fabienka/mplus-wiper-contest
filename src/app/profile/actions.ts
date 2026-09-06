"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, writeAuditLog } from "@/lib/admin";
import { validateNewPassword } from "@/lib/password-rules";

export interface ChangePasswordState {
  status: "idle" | "ok" | "error";
  message: string;
}

/**
 * Změna vlastního hesla.
 *
 * Staré heslo se ověřuje, i když je uživatel přihlášený - jinak by stačil
 * cizí odemčený počítač k tomu, aby účet někdo převzal.
 */
export async function changePassword(
  _previous: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const current = await getCurrentUser();

  if (!current) {
    return { status: "error", message: "Nejsi přihlášený." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");

  const problem = validateNewPassword(password, confirmation);
  if (problem) {
    return { status: "error", message: problem };
  }

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { id: true, username: true, passwordHash: true },
  });

  if (!user) {
    return { status: "error", message: "Účet už neexistuje." };
  }

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { status: "error", message: "Stávající heslo nesouhlasí." };
  }

  if (currentPassword === password) {
    return { status: "error", message: "Nové heslo se musí lišit od stávajícího." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Kdo si heslo změnil sám, nepotřebuje vydaný odkaz na reset - a nechat
    // ho platit by znamenalo, že se účet dá pořád převzít starým odkazem.
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    await writeAuditLog(tx, {
      actorId: user.id,
      actionType: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      newValue: { username: user.username },
    });
  });

  // Session drží JWT, ne heslo, takže přihlášení zůstává platné - odhlašovat
  // se po změně vlastního hesla nemusí.
  return { status: "ok", message: "Heslo je změněné." };
}
