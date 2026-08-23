import { getServerSession } from "next-auth";
import type { Prisma, PrismaClient } from "@prisma/client";
import { authOptions } from "@/lib/auth";

/**
 * Middleware sice /admin chrání, ale server actions jdou vyvolat i mimo
 * stránku - proto se role ověřuje znovu při každé akci.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Tuto akci může provést jen admin.");
  }

  return session.user;
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
