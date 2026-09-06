"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";
import {
  RESET_TOKEN_TTL_MINUTES,
  canIssueResetFor,
} from "@/lib/password-rules";
import {
  buildResetUrl,
  createResetToken,
} from "@/lib/password-reset";

export interface IssueResetState {
  status: "idle" | "ok" | "error";
  message: string;
  /** Vyplněné jen po úspěchu. Do databáze se ukládá pouze otisk. */
  link?: string;
  expiresAt?: string;
}

function error(message: string): IssueResetState {
  return { status: "error", message };
}

/**
 * Vydá jednorázový odkaz na nastavení hesla.
 *
 * Odkaz se vrací do formuláře, ne přes přesměrování s parametrem - token by
 * se jinak uložil do historie prohlížeče a do logu serveru. Ukáže se jedinkrát;
 * kdo ho zapomene zkopírovat, vydá prostě další.
 */
export async function issuePasswordReset(
  _previous: IssueResetState,
  formData: FormData
): Promise<IssueResetState> {
  const actor = await requirePermission("issuePasswordReset");
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, discordNick: true },
  });

  if (!target) {
    return error("Uživatel neexistuje.");
  }

  if (!canIssueResetFor(actor.role, target.role)) {
    return error(
      `Na účet s rolí ${target.role} nesmíš reset vydat. Požádej o to admina.`
    );
  }

  const issued = createResetToken();

  try {
    // Adresa se sestavuje dřív než zápis - když chybí NEXTAUTH_URL, ať v
    // databázi nezůstane token, který se stejně nemá jak doručit.
    const link = buildResetUrl(process.env.NEXTAUTH_URL, issued.token);

    await prisma.$transaction(async (tx) => {
      // Dřívější nespotřebované odkazy padají - jinak by po vydání nového
      // zůstaly platné i ty starší, které mezitím mohly někde uváznout.
      await tx.passwordResetToken.deleteMany({
        where: { userId: target.id, usedAt: null },
      });

      // Úklid při zápisu, stejně jako u počítadel pokusů. Spotřebované a
      // propadlé odkazy už nemají co říct a tabulka by jinak jen rostla.
      await tx.passwordResetToken.deleteMany({
        where: {
          OR: [
            { usedAt: { not: null } },
            { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: target.id,
          tokenHash: issued.tokenHash,
          expiresAt: issued.expiresAt,
          issuedById: actor.id,
        },
      });

      await writeAuditLog(tx, {
        actorId: actor.id,
        actionType: "PASSWORD_RESET_ISSUED",
        entityType: "User",
        entityId: target.id,
        newValue: {
          username: target.username,
          expiresAt: issued.expiresAt.toISOString(),
        },
      });
    });

    revalidatePath("/admin/hesla");

    return {
      status: "ok",
      message: `Odkaz pro ${target.username} platí ${RESET_TOKEN_TTL_MINUTES} minut.`,
      link,
      expiresAt: issued.expiresAt.toISOString(),
    };
  } catch (err) {
    console.error("[reset hesla] vydání selhalo:", err);
    return error(
      err instanceof Error && err.message.includes("NEXTAUTH_URL")
        ? err.message
        : "Odkaz se nepodařilo vydat. Podrobnosti jsou v logu serveru."
    );
  }
}

/** Zneplatní nespotřebovaný odkaz - třeba když se pošle špatnému člověku. */
export async function revokePasswordReset(formData: FormData) {
  const actor = await requirePermission("issuePasswordReset");
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });

  if (!target || !canIssueResetFor(actor.role, target.role)) {
    return;
  }

  const removed = await prisma.passwordResetToken.deleteMany({
    where: { userId: target.id, usedAt: null },
  });

  if (removed.count > 0) {
    await writeAuditLog(prisma, {
      actorId: actor.id,
      actionType: "PASSWORD_RESET_REVOKED",
      entityType: "User",
      entityId: target.id,
      oldValue: { username: target.username, tokens: removed.count },
    });
  }

  revalidatePath("/admin/hesla");
}
