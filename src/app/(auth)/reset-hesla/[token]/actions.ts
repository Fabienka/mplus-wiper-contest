"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/admin";
import { clearLoginFailures } from "@/lib/login-attempts";
import {
  RESET_TOKEN_STATE_MESSAGES,
  resetTokenState,
  validateNewPassword,
} from "@/lib/password-rules";
import { hashResetToken } from "@/lib/password-reset";

export interface ResetFormState {
  status: "idle" | "error";
  message: string;
}

function error(message: string): ResetFormState {
  return { status: "error", message };
}

/**
 * Nastaví nové heslo podle jednorázového odkazu.
 *
 * Platnost tokenu se kontroluje znovu, i když ji stránka ověřila při
 * vykreslení - mezi zobrazením formuláře a odesláním může odkaz vypršet nebo
 * ho může někdo zneplatnit.
 */
export async function submitPasswordReset(
  _previous: ResetFormState,
  formData: FormData
): Promise<ResetFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");

  const problem = validateNewPassword(password, confirmation);
  if (problem) {
    return error(problem);
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    include: { user: { select: { id: true, username: true } } },
  });

  if (!record) {
    return error(
      "Odkaz není platný. Zkontroluj, jestli se zkopíroval celý, nebo si řekni o nový."
    );
  }

  const state = resetTokenState(record);
  if (state !== "VALID") {
    return error(RESET_TOKEN_STATE_MESSAGES[state]);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      // Podmínka na usedAt je tu podruhé schválně: dvě současná odeslání by
      // jinak obě prošla kontrolou výš a heslo by nastavilo to pomalejší.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumed.count === 0) {
        throw new Error("TOKEN_ALREADY_USED");
      }

      await tx.user.update({
        where: { id: record.user.id },
        data: { passwordHash },
      });

      // Ostatní nespotřebované odkazy na ten účet padají - po změně hesla
      // nemají co dělat.
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.user.id, usedAt: null },
      });

      await writeAuditLog(tx, {
        actorId: record.user.id,
        actionType: "PASSWORD_RESET_USED",
        entityType: "User",
        entityId: record.user.id,
        newValue: { username: record.user.username },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "TOKEN_ALREADY_USED") {
      return error(RESET_TOKEN_STATE_MESSAGES.USED);
    }

    console.error("[reset hesla] nastavení hesla selhalo:", err);
    return error("Heslo se nepodařilo uložit. Zkus to prosím znovu.");
  }

  // Kdo si heslo zapomněl, měl pravděpodobně i pár neúspěšných pokusů a mohl
  // se zamknout. Se správným heslem by pak stejně neprošel.
  await clearLoginFailures(record.user.username);

  redirect("/login?zmeneno=1");
}
