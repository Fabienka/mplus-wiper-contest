/**
 * Čtení formuláře ručního zadání běhu - stejné pro tým (/team) i pro
 * admina a moderátora (detail týmu v administraci), ať se kontroly nerozejdou.
 *
 * Vrací výsledek místo přesměrování: kam poslat chybu, rozhoduje volající.
 */

import { combineDateTime } from "./datetime-input";
import { MAX_SCREENSHOT_BYTES, detectImageType, parseClearTime } from "./manual-result";
import { OVER_TIME_LIMIT_REASON } from "./time-budget";

/** Rozumný rozsah výšky klíče - cokoliv mimo je skoro jistě překlep. */
export const MIN_KEY_LEVEL = 2;
export const MAX_KEY_LEVEL = 40;

/** "12" i "+12" (běžný zápis v M+) -> 12. Mimo rozsah nebo nesmysl -> null. */
export function parseKeyLevelInput(raw: string): number | null {
  const value = raw.trim().replace(/^\+/, "");
  const level = Number(value);

  if (!value || !Number.isInteger(level) || level < MIN_KEY_LEVEL || level > MAX_KEY_LEVEL) {
    return null;
  }

  return level;
}

/**
 * Okamžik z formuláře. Návrh termínu z tabulky překryvů posílá hotové
 * "YYYY-MM-DDTHH:mm" ve skrytém poli `<key>`, výběr termínu (DateTimeField)
 * dvě pole `<key>Date` a `<key>Time`. Nesmysl vrátí neplatné datum.
 */
export function readDateTimeField(formData: FormData, key: string): Date {
  const hidden = formData.get(key);
  if (hidden) return new Date(String(hidden));

  return (
    combineDateTime(
      String(formData.get(`${key}Date`) ?? ""),
      String(formData.get(`${key}Time`) ?? "")
    ) ?? new Date(NaN)
  );
}

export interface ManualResultForm {
  matchId: string;
  dungeonName: string;
  keyLevel: number;
  clearTimeSeconds: number;
  completedAt: Date;
  screenshot: { bytes: Uint8Array; mimeType: string };
  /** Tým pokus vzdal - do bodů se nepočítá, čas se odečte z herního času. */
  abandoned: boolean;
}

export type ParsedManualResult =
  | { ok: true; value: ManualResultForm }
  | { ok: false; message: string };

export async function parseManualResultForm(formData: FormData): Promise<ParsedManualResult> {
  const error = (message: string): ParsedManualResult => ({ ok: false, message });

  const keyLevel = parseKeyLevelInput(String(formData.get("keyLevel") ?? ""));
  if (keyLevel === null) {
    return error(`Výška klíče musí být celé číslo od ${MIN_KEY_LEVEL} do ${MAX_KEY_LEVEL}.`);
  }

  const clearTimeSeconds = parseClearTime(String(formData.get("clearTime") ?? ""));
  if (clearTimeSeconds === null) return error("Čas běhu zadej jako mm:ss, třeba 32:15.");

  const completedAt = readDateTimeField(formData, "completed");
  if (Number.isNaN(completedAt.getTime())) return error("Zadej, kdy běh skončil - den i čas.");

  const file = formData.get("screenshot");
  if (!(file instanceof File) || file.size === 0) {
    return error("Přilož screenshot z konce běhu.");
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    // Sem se dostane jen soubor, který se nezmenšil v prohlížeči
    // (ScreenshotInput) - typicky starý prohlížeč nebo vypnutý JavaScript.
    return error(
      `Screenshot je moc velký (maximum je ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB) a prohlížeč ho nezmenšil. Zkus aktuální prohlížeč, nebo ho ulož jako JPEG.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType) return error("Screenshot musí být obrázek PNG, JPEG nebo WebP.");

  return {
    ok: true,
    value: {
      matchId: String(formData.get("matchId")),
      dungeonName: String(formData.get("dungeon") ?? ""),
      keyLevel,
      clearTimeSeconds,
      completedAt,
      screenshot: { bytes, mimeType },
      abandoned: formData.get("abandoned") === "on",
    },
  };
}

/**
 * Co říct po zápisu ručního běhu. `saved` je klíč hlášky o úspěchu
 * (?saved=...), `error` rovnou text chyby.
 *
 * `verified`: běh zapsal admin nebo moderátor, takže je rovnou ověřený -
 * na nikoho dalšího nečeká.
 */
export function manualResultOutcome(
  outcome: { evaluation: { reasons: string[] }; overTimeLimit: boolean },
  abandoned: boolean,
  verified: boolean
): { saved: string } | { error: string } {
  if (abandoned) {
    return outcome.overTimeLimit
      ? {
          error:
            "Vzdaný pokus je zapsaný. Tým jím vyčerpal herní čas zápasu - další běhy se už nepočítají.",
        }
      : { saved: "abandoned" };
  }

  const reasons = outcome.overTimeLimit
    ? [...outcome.evaluation.reasons, OVER_TIME_LIMIT_REASON]
    : outcome.evaluation.reasons;

  if (reasons.length === 0) return { saved: verified ? "manual-verified" : "manual" };

  return {
    error: verified
      ? `Běh se uložil, ale nepočítá se: ${reasons.join(" ")}`
      : `Běh se uložil, ale podle zadaných údajů se nepočítá: ${reasons.join(" ")} Moderátor ho při ověření může uznat.`,
  };
}
