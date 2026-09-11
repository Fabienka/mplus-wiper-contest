/**
 * Ruční zadání běhu se screenshotem.
 *
 * Když běh na Raider.io chybí (soukromý profil, výpadek, běh se nenačetl),
 * tým ho zadá ručně a přiloží screenshot z konce dungeonu. Takový výsledek se
 * nepočítá, dokud ho neověří moderátor - údaje zadal tým sám.
 *
 * Modul je čistý, testuje ho scripts/check-manual-result.ts.
 */

import type { RunCandidate } from "./match-result";

/**
 * Pojistka na serveru. Formulář obrázek před odesláním sám zmenší
 * (ScreenshotInput) a vyjde obvykle 1-2 MB - tenhle limit se uplatní, jen
 * když zmenšení v prohlížeči neproběhne (starý prohlížeč, vypnutý JavaScript).
 */
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

/**
 * Kolik bodů smí mít screenshot po zmenšení v prohlížeči - odpovídá
 * 2560 × 1440. Text na obrazovce konce dungeonu je z toho čitelný i u
 * screenshotu ze 4K. Hlídá se plocha, ne šířka, ať ultrawide monitor
 * nedopadne hůř než běžný.
 */
export const SCREENSHOT_MAX_PIXELS = 2560 * 1440;

/** Kvalita WebP (případně JPEG) při zmenšení v prohlížeči. */
export const SCREENSHOT_QUALITY = 0.85;

/** Rozměry zmenšené tak, aby obrázek měl nejvýš `maxPixels` bodů. Poměr stran drží. */
export function fitWithinPixels(
  width: number,
  height: number,
  maxPixels: number
): { width: number; height: number } {
  if (width * height <= maxPixels) return { width, height };

  const scale = Math.sqrt(maxPixels / (width * height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];

/**
 * Typ obrázku podle prvních bajtů souboru.
 *
 * Přípona i typ, který pošle prohlížeč, jdou podvrhnout - a soubor se pak
 * servíruje zpátky moderátorům. Proto rozhoduje obsah.
 */
export function detectImageType(bytes: Uint8Array): ScreenshotType | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  // WebP: "RIFF" + 4 bajty délky + "WEBP".
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  return null;
}

/**
 * Čas doběhnutí z obrazovky konce dungeonu: "32:15" -> 1935 s.
 *
 * Bere i hodiny ("1:02:15") a desetiny ("32:15.4", ty se useknou - hra
 * i Raider.io počítají limit na celé sekundy). Nesmysl vrátí null.
 */
export function parseClearTime(text: string): number | null {
  const value = text.trim().replace(",", ".");
  const match = value.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})(?:\.\d+)?$/);
  if (!match) return null;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (seconds > 59) return null;
  // S hodinami musí minuty sedět do 59; bez nich jde psát i "75:00".
  if (match[1] !== undefined && minutes > 59) return null;

  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/**
 * Ručně zadaný běh ve tvaru, jaký čeká evaluateRun - prochází tak stejnými
 * kontrolami (okno zápasu, dungeon v rotaci, časový limit, bodování) jako
 * běh z Raider.io.
 *
 * Verdikt hry chybí, o stihnutí rozhodne čas proti limitu dungeonu. Sestava
 * zůstává prázdná: ze zadání ji nejde ověřit, kontroluje ji moderátor ze
 * screenshotu.
 */
export function manualRunCandidate(input: {
  dungeonName: string;
  abbreviation: string;
  timeLimitSeconds: number | null;
  keyLevel: number;
  clearTimeSeconds: number;
  completedAt: Date;
}): RunCandidate {
  return {
    dungeonName: input.dungeonName,
    abbreviation: input.abbreviation,
    keyLevel: input.keyLevel,
    clearTimeSeconds: input.clearTimeSeconds,
    // Bez limitu vrátí scoreRun srozumitelné "chybí časový limit klíče".
    parTimeSeconds: input.timeLimitSeconds ?? 0,
    keystoneUpgrades: null,
    completedAt: input.completedAt,
    roster: [],
  };
}

/** Důvod, proč se vzdaný běh nepočítá - moderátor ho vidí u výsledku. */
export const ABANDONED_REASON = "Nedokončený běh - tým pokus vzdal.";

/**
 * Ručně zadaný běh, o kterém moderátor ještě nerozhodl.
 *
 * Vzdaný běh na ověření nečeká - nepočítá se nikdy a je jen pro informaci.
 */
export function isAwaitingVerification(result: {
  source: string;
  verifiedById: string | null;
  abandoned?: boolean;
}): boolean {
  return (
    result.source === "SCREENSHOT" && result.verifiedById === null && !result.abandoned
  );
}
