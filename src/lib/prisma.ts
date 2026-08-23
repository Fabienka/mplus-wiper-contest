import { PrismaClient } from "@prisma/client";

// Zabraňuje vzniku nových instancí PrismaClient při hot-reloadu v dev módu
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
