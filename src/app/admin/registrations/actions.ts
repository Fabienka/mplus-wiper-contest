"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, writeAuditLog } from "@/lib/admin";

function revalidateRegistration(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/registrations/${id}`);
}

export async function approveRegistration(formData: FormData) {
  const admin = await requirePermission("reviewRegistrations");
  const id = String(formData.get("registrationId"));

  const registration = await prisma.seasonRegistration.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.seasonRegistration.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "REGISTRATION_APPROVED",
      entityType: "SeasonRegistration",
      entityId: id,
      oldValue: { status: registration.status },
      newValue: { status: "APPROVED" },
    });
  });

  // TODO: odeslat Discord webhook event o schválení, až bude webhook hotový
  revalidateRegistration(id);
}

export async function rejectRegistration(formData: FormData) {
  const admin = await requirePermission("reviewRegistrations");
  const id = String(formData.get("registrationId"));
  const reason = String(formData.get("rejectionReason") ?? "").trim();

  if (!reason) {
    throw new Error("Zamítnutí musí mít uvedený důvod.");
  }

  const registration = await prisma.seasonRegistration.findUniqueOrThrow({
    where: { id },
    select: { status: true, rejectionReason: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.seasonRegistration.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "REGISTRATION_REJECTED",
      entityType: "SeasonRegistration",
      entityId: id,
      oldValue: {
        status: registration.status,
        rejectionReason: registration.rejectionReason,
      },
      newValue: { status: "REJECTED", rejectionReason: reason },
    });
  });

  revalidateRegistration(id);
}

/** Vrátí už vyřízenou registraci zpět mezi čekající - na opravu překliku. */
export async function reopenRegistration(formData: FormData) {
  const admin = await requirePermission("reviewRegistrations");
  const id = String(formData.get("registrationId"));

  const registration = await prisma.seasonRegistration.findUniqueOrThrow({
    where: { id },
    select: { status: true, rejectionReason: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.seasonRegistration.update({
      where: { id },
      data: {
        status: "PENDING",
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "REGISTRATION_REOPENED",
      entityType: "SeasonRegistration",
      entityId: id,
      oldValue: {
        status: registration.status,
        rejectionReason: registration.rejectionReason,
      },
      newValue: { status: "PENDING" },
    });
  });

  revalidateRegistration(id);
}

/**
 * Potvrdí zaplacené zápisné. Zápisné se posílá ve hře, takže ho aplikace neumí
 * ověřit sama - potvrzuje ho moderátor nebo admin podle toho, co reálně dorazilo.
 *
 * Je to samostatný krok vedle schválení registrace: hráč může být schválený
 * a nezaplacený i naopak.
 */
export async function confirmEntryFee(formData: FormData) {
  const staff = await requirePermission("confirmEntryFee");
  const id = String(formData.get("registrationId"));
  const note = String(formData.get("entryFeeNote") ?? "").trim() || null;

  const registration = await prisma.seasonRegistration.findUniqueOrThrow({
    where: { id },
    select: { entryFeePaidAt: true, entryFeeNote: true },
  });

  if (registration.entryFeePaidAt) {
    throw new Error("Zápisné už je potvrzené.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.seasonRegistration.update({
      where: { id },
      data: {
        entryFeePaidAt: new Date(),
        entryFeeConfirmedById: staff.id,
        entryFeeNote: note,
      },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "ENTRY_FEE_CONFIRMED",
      entityType: "SeasonRegistration",
      entityId: id,
      oldValue: { entryFeePaidAt: null },
      newValue: { entryFeePaidAt: new Date().toISOString(), entryFeeNote: note },
    });
  });

  revalidateRegistration(id);
}

/** Zruší potvrzení zápisného - na opravu překliku nebo vrácené platby. */
export async function revokeEntryFee(formData: FormData) {
  const staff = await requirePermission("confirmEntryFee");
  const id = String(formData.get("registrationId"));

  const registration = await prisma.seasonRegistration.findUniqueOrThrow({
    where: { id },
    select: { entryFeePaidAt: true, entryFeeNote: true },
  });

  if (!registration.entryFeePaidAt) {
    throw new Error("Zápisné potvrzené není, není co rušit.");
  }

  // Do closure transakce se zúžení typu nepropíše, proto vlastní proměnná.
  const paidAt = registration.entryFeePaidAt;

  await prisma.$transaction(async (tx) => {
    await tx.seasonRegistration.update({
      where: { id },
      data: {
        entryFeePaidAt: null,
        entryFeeConfirmedById: null,
        entryFeeNote: null,
      },
    });

    await writeAuditLog(tx, {
      actorId: staff.id,
      actionType: "ENTRY_FEE_REVOKED",
      entityType: "SeasonRegistration",
      entityId: id,
      oldValue: {
        entryFeePaidAt: paidAt.toISOString(),
        entryFeeNote: registration.entryFeeNote,
      },
      newValue: { entryFeePaidAt: null },
    });
  });

  revalidateRegistration(id);
}
