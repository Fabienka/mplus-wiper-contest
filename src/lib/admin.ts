import { getServerSession } from "next-auth";
import type { Prisma, PrismaClient } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

/**
 * Middleware sice /admin chrání, ale server actions jdou vyvolat i mimo
 * stránku - proto se oprávnění ověřuje znovu při každé akci.
 */
export async function requirePermission(permission: Permission) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !can(session.user.role, permission)) {
    throw new Error("Na tuhle akci nemáš oprávnění.");
  }

  return session.user;
}

/** Přihlášený uživatel, nebo null - pro stránky, které si řídí zobrazení samy. */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

export function writeAuditLog(
  db: DbClient,
  entry: {
    actorId: string;
    actionType: string;
    entityType: string;
    entityId: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
  }
) {
  return db.auditLog.create({ data: entry });
}
