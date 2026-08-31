/**
 * Evidence pokusů o registraci a napojení na registration-throttle.
 *
 * Stejně jako u přihlášení je počítadlo v databázi, ne v paměti procesu - na
 * hostingu může běžet víc instancí.
 */

import { prisma } from "@/lib/prisma";
import {
  MAX_REGISTRATIONS_PER_IP,
  REGISTRATION_WINDOW_MS,
} from "@/lib/registration-throttle";
import { evaluateAttempts, type ThrottleVerdict } from "@/lib/rate-limit";

/** Jak dlouho se záznamy drží, než je úklid zahodí. */
const RETENTION_MS = REGISTRATION_WINDOW_MS * 8;

/**
 * Bez IP se nedá nic omezit - takový požadavek projde. Nastat by to nemělo,
 * ale radši pustit registraci než ji všem rozbít kvůli chybějící hlavičce.
 */
export async function checkRegistrationAllowed(
  ip: string | null
): Promise<ThrottleVerdict> {
  if (!ip) return { blocked: false, retryAfterSeconds: 0 };

  const attempts = await prisma.registrationAttempt.findMany({
    where: {
      ipAddress: ip,
      createdAt: { gt: new Date(Date.now() - REGISTRATION_WINDOW_MS) },
    },
    select: { createdAt: true },
  });

  return evaluateAttempts(
    attempts.map((a) => a.createdAt),
    MAX_REGISTRATIONS_PER_IP,
    new Date(),
    REGISTRATION_WINDOW_MS
  );
}

/**
 * Zapisují se všechny pokusy, i ty neúspěšné - jinak by šlo limit obejít
 * záměrně chybnými požadavky, které stejně volají Raider.io.
 */
export async function recordRegistrationAttempt(ip: string | null): Promise<void> {
  if (!ip) return;

  await prisma.registrationAttempt.create({ data: { ipAddress: ip } });

  await prisma.registrationAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
}
