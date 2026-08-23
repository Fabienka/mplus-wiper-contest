import { prisma } from "@/lib/prisma";

/**
 * Aktuální sezóna pro administraci - nejnovější založená, bez ohledu na stav.
 * (Veřejné /api/seasons/active naproti tomu hledá jen otevřenou registraci.)
 */
export function getCurrentSeason() {
  return prisma.season.findFirst({ orderBy: { createdAt: "desc" } });
}
