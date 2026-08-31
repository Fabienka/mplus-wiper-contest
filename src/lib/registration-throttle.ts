/**
 * Limity pro registraci. Obecné počítání pokusů je v rate-limit.ts.
 */

export const REGISTRATION_WINDOW_MINUTES = 60;
export const REGISTRATION_WINDOW_MS = REGISTRATION_WINDOW_MINUTES * 60 * 1000;

/**
 * Registrace je jednorázová věc, takže z jedné adresy jich za hodinu nemá proč
 * chodit víc. Okno je delší než u přihlášení - tam jde o překlep v hesle,
 * který se opraví za minutu, tady o zakládání účtů.
 *
 * Limit se počítá ze všech pokusů, ne jen z těch neúspěšných: chrání i volání
 * Raider.io, které registrace dělá, aby přes tenhle endpoint nešlo zatěžovat
 * cizí API.
 */
export const MAX_REGISTRATIONS_PER_IP = 5;
