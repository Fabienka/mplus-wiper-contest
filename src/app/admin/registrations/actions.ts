"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, writeAuditLog } from "@/lib/admin";

function revalidateRegistration(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/registrations/${id}`);
}

export async function approveRegistration(formData: FormData) {
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
