import type { RegistrationStatus, SeasonStatus, SpecRole } from "@prisma/client";

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  PENDING: "Čeká na schválení",
  APPROVED: "Schváleno",
  REJECTED: "Zamítnuto",
};

export const REGISTRATION_STATUS_BADGES: Record<RegistrationStatus, string> = {
  PENDING: "badge badge-pending",
  APPROVED: "badge badge-approved",
  REJECTED: "badge badge-rejected",
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  DRAFT: "Rozpracovaná",
  REGISTRATION_OPEN: "Registrace otevřená",
  REGISTRATION_CLOSED: "Registrace uzavřená",
  ACTIVE: "Probíhá",
  CLOSED: "Ukončená",
};

export const SPEC_ROLE_LABELS: Record<SpecRole, string> = {
  TANK: "Tank",
  HEALER: "Healer",
  DPS: "DPS",
};

/**
 * České skloňování podle počtu: 1 zápas / 2-4 zápasy / 5+ zápasů.
 * Vrací jen tvar slova, číslo si volající předřadí sám.
 */
export function plural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

export function formatDateTime(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });
}

/** Časový limit klíče se v DB drží v sekundách, uživateli se ukazuje jako mm:ss. */
export function formatTimeLimit(seconds: number | null) {
  if (seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Opak formatTimeLimit - přijímá "33:00" i "33". Prázdný vstup znamená TBD. */
export function parseTimeLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)(?::([0-5]\d))?$/);
  if (!match) {
    throw new Error(`Čas "${value}" nemá formát mm:ss.`);
  }

  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}
