"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, writeAuditLog } from "@/lib/admin";
import { validateNewPassword } from "@/lib/password-rules";
import { fetchSpecScores, RaiderioLookupError } from "@/lib/raiderio";
import { switchableSpecs } from "@/lib/wow-specs";

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

export interface SwitchSpecsState {
  status: "idle" | "ok" | "warning" | "error";
  message: string;
}

/**
 * Uloží, jestli a na které specy je hráč ochotný switchnout.
 *
 * RIO skóre vybraných speců se při každém uložení načte z Raider.io znovu -
 * uložení tak slouží i jako obnovení. Když Raider.io neodpoví, výběr se
 * uloží stejně a u speců zůstane dřív načtené skóre.
 */
export async function saveSwitchSpecs(
  _previous: SwitchSpecsState,
  formData: FormData
): Promise<SwitchSpecsState> {
  const current = await getCurrentUser();

  if (!current) {
    return { status: "error", message: "Nejsi přihlášený." };
  }

  const character = await prisma.character.findUnique({
    where: { userId: current.id },
    include: { switchSpecs: true },
  });

  if (!character) {
    return { status: "error", message: "K účtu není přiřazená žádná postava." };
  }

  const canSwitchSpec = formData.get("canSwitchSpec") === "on";
  const requested = new Set(
    canSwitchSpec ? formData.getAll("switchSpecs").map(String) : []
  );
  const specs = switchableSpecs(character.class, character.wowSpec).filter(
    (spec) => requested.has(spec.specName)
  );

  if (specs.length !== requested.size) {
    return {
      status: "error",
      message: "Vybraný spec k postavě nepatří. Načti stránku znovu a zkus to ještě jednou.",
    };
  }

  let scores: Record<string, number> | null = null;
  let lookupError: string | null = null;

  if (specs.length > 0) {
    try {
      scores = await fetchSpecScores(character.raiderioUrl);
    } catch (err) {
      if (!(err instanceof RaiderioLookupError)) throw err;
      lookupError = err.message;
    }
  }

  const previous = new Map(
    character.switchSpecs.map((spec) => [spec.specName, spec])
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: character.id },
      data: { canSwitchSpec },
    });

    await tx.characterSwitchSpec.deleteMany({
      where: { characterId: character.id },
    });

    await tx.characterSwitchSpec.createMany({
      data: specs.map((spec) => ({
        characterId: character.id,
        specName: spec.specName,
        specRole: spec.role,
        rioScore: scores
          ? scores[spec.specName] ?? null
          : previous.get(spec.specName)?.rioScore ?? null,
        rioSyncedAt: scores ? now : previous.get(spec.specName)?.rioSyncedAt ?? null,
      })),
    });

    await writeAuditLog(tx, {
      actorId: current.id,
      actionType: "SWITCH_SPECS_UPDATED",
      entityType: "Character",
      entityId: character.id,
      oldValue: {
        canSwitchSpec: character.canSwitchSpec,
        specs: character.switchSpecs.map((spec) => spec.specName),
      },
      newValue: { canSwitchSpec, specs: specs.map((spec) => spec.specName) },
    });
  });

  revalidatePath("/profile");

  if (lookupError) {
    return {
      status: "warning",
      message: `Uloženo, ale RIO se z Raider.io nepodařilo načíst: ${lookupError}`,
    };
  }

  return {
    status: "ok",
    message: !canSwitchSpec
      ? "Uloženo - se switchem specu nepočítáme."
      : specs.length === 0
        ? "Uloženo. Zatím nemáš vybraný žádný spec."
        : "Uloženo, RIO je načtené z Raider.io.",
  };
}
