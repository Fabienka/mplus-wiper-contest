/**
 * Odpovědi z registračního formuláře (SeasonRegistration.formAnswers).
 *
 * Ukládají se jako volný JSON pod klíči, které posílá registrační formulář.
 * Pro admina se klíče překládají na popisky - syrové "altCharacter" se na
 * detailu přihlášky snadno přehlédlo.
 */

export const FORM_ANSWER_LABELS: Record<string, string> = {
  altCharacter: "Alt postava tank/heal",
  agreedToRules: "Souhlas s pravidly",
  generated: "Vygenerováno skriptem",
};

/** Popisek odpovědi. Neznámý klíč (starší podoba formuláře) zůstane, jak je. */
export function formAnswerLabel(key: string): string {
  return FORM_ANSWER_LABELS[key] ?? key;
}

/**
 * Alt postava, se kterou by hráč mohl jít za tanka nebo healera. Null, když
 * ji hráč nevyplnil.
 */
export function altCharacterFromAnswers(formAnswers: unknown): string | null {
  if (!formAnswers || typeof formAnswers !== "object" || Array.isArray(formAnswers)) {
    return null;
  }

  const value = (formAnswers as Record<string, unknown>).altCharacter;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
