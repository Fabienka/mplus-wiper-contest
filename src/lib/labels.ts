import type {
  MatchStatus,
  RegistrationStatus,
  SeasonStatus,
  SpecRole,
  UserRole,
} from "@prisma/client";

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

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MODERATOR: "Moderátor",
  USER: "Uživatel",
};

/** Co která role smí - ukazuje se u výběru role, ať je to zřejmé. */
export const USER_ROLE_HINTS: Record<UserRole, string> = {
  ADMIN: "Kompletní práva.",
  MODERATOR: "Jako uživatel + potvrzuje zápisné a schvaluje termíny.",
  USER: "Běžný účastník, do administrace nemá přístup.",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  PROPOSED: "Navržený",
  CONFIRMED: "Schválený",
  COMPLETED: "Odehraný",
  EVALUATED: "Vyhodnocený",
};

export const MATCH_STATUS_BADGES: Record<MatchStatus, string> = {
  PROPOSED: "badge badge-pending",
  CONFIRMED: "badge badge-approved",
  COMPLETED: "badge badge-approved",
  EVALUATED: "badge badge-approved",
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

/**
 * Hodnota pro <input type="datetime-local">, tedy "YYYY-MM-DDTHH:mm"
 * v místním čase. toISOString() by vrátil UTC a formulář by ukazoval posun.
 */
export function toDateTimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

/** Rozsah "1. 9. 2026 18:00 - 21:00", u přesahu přes půlnoc s celým datem. */
export function formatRange(start: Date, end: Date): string {
  const date = start.toLocaleDateString("cs-CZ", { dateStyle: "medium" });
  const from = start.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    const to = end.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${from} - ${to}`;
  }

  return `${date} ${from} - ${end.toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" })}`;
}

/** Délka úseku jako "2 h 30 min". */
export function formatDuration(start: Date, end: Date): string {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
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
