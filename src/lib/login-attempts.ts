/**
 * Evidence neúspěšných přihlášení a napojení na login-throttle.
 *
 * Počítadlo je v databázi, ne v paměti procesu - na hostingu může běžet víc
 * instancí a paměťové počítadlo by se dalo obejít tím, že pokusy padnou
 * pokaždé na jinou.
 */

import { prisma } from "@/lib/prisma";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILURES_PER_IP,
  MAX_FAILURES_PER_USERNAME,
  evaluateAttempts,
  strictest,
  type ThrottleVerdict,
} from "@/lib/login-throttle";

/** Jak dlouho se záznamy drží, než je úklid zahodí. */
const RETENTION_MS = LOGIN_WINDOW_MS * 8;

/**
 * Jméno se normalizuje, aby se limit nedal obejít velikostí písmen. Samotné
 * přihlášení je na velikosti závislé (username je unikátní tak, jak se zadal),
 * takže "Admin" se nepřihlásí jako "admin" - ale do počítadla patří k sobě.
 */
function normalize(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * IP z hlaviček proxy. Za nedůvěryhodnou proxy jde hodnota podvrhnout, takže
 * limit na IP je jen doplněk - účet chrání limit na uživatelské jméno, který
 * na hlavičkách nezávisí.
 */
export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): string | null {
  if (!headers) return null;

  const read = (name: string): string | null => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (!value) return null;
    const first = Array.isArray(value) ? value[0] : value;
    return first.split(",")[0]?.trim() || null;
  };

  return read("x-forwarded-for") ?? read("x-real-ip") ?? null;
}

/** Smí se teď pro tuhle dvojici zkusit přihlášení? */
export async function checkLoginAllowed(
  username: string,
  ip: string | null
): Promise<ThrottleVerdict> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);

  const [byUsername, byIp] = await Promise.all([
    prisma.loginAttempt.findMany({
      where: { username: normalize(username), createdAt: { gt: since } },
      select: { createdAt: true },
    }),
    ip
      ? prisma.loginAttempt.findMany({
          where: { ipAddress: ip, createdAt: { gt: since } },
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return strictest(
    evaluateAttempts(
      byUsername.map((a) => a.createdAt),
      MAX_FAILURES_PER_USERNAME
    ),
    evaluateAttempts(
      byIp.map((a) => a.createdAt),
      MAX_FAILURES_PER_IP
    )
  );
}

export async function recordFailedLogin(
  username: string,
  ip: string | null
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { username: normalize(username), ipAddress: ip },
  });

  // Úklid při zápisu - tabulka jinak roste donekonečna a vlastní naplánovaná
  // úloha by byla na tuhle drobnost zbytečná.
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
}

/** Po úspěšném přihlášení nemá smysl držet předchozí neúspěchy. */
export async function clearLoginFailures(username: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { username: normalize(username) },
  });
}
