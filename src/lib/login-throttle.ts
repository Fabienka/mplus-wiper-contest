/**
 * Rozhodování o omezení pokusů o přihlášení.
 *
 * Modul je čistý (bez databáze), aby šel testovat samostatně
 * (viz scripts/check-login-throttle.ts). Práci s databází dělá
 * login-attempts.ts.
 *
 * Použité je klouzavé okno: počítají se neúspěšné pokusy za posledních
 * LOGIN_WINDOW_MINUTES minut. Není potřeba držet žádný stav "zamčeno do",
 * blokace se sama rozpustí tím, jak staré pokusy z okna vypadnou.
 */

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_WINDOW_MS = LOGIN_WINDOW_MINUTES * 60 * 1000;

/**
 * Kolik neúspěchů na jedno uživatelské jméno stačí k zablokování. Nízké číslo
 * chrání účet i proti pomalému zkoušení hesel.
 */
export const MAX_FAILURES_PER_USERNAME = 5;

/**
 * Strop na IP adresu je vyšší - z jedné adresy (sdílená síť, NAT) se může
 * legitimně přihlašovat víc lidí. Chytá to zkoušení jednoho hesla přes hodně
 * různých jmen, kde by se limit na jméno nikdy nenaplnil.
 */
export const MAX_FAILURES_PER_IP = 20;

export interface ThrottleVerdict {
  blocked: boolean;
  /** Za kolik sekund má smysl to zkusit znovu. Nula, když se neblokuje. */
  retryAfterSeconds: number;
}

const ALLOWED: ThrottleVerdict = { blocked: false, retryAfterSeconds: 0 };

/**
 * Posoudí seznam časů neúspěšných pokusů proti limitu.
 *
 * Rozhoduje limit-tý nejnovější pokus: blokace trvá, dokud jich v okně
 * nezbude míň než limit. Víc neúspěchů tedy znamená delší blokaci.
 *
 * Zamknout si účet natrvalo opakovaným zkoušením přesto nejde - volající
 * (authorize v auth.ts) během blokace žádný další pokus nezapisuje, takže se
 * počítadlo nemá čím posouvat a blokace vždycky doběhne.
 */
export function evaluateAttempts(
  timestamps: Date[],
  limit: number,
  now: Date = new Date(),
  windowMs: number = LOGIN_WINDOW_MS
): ThrottleVerdict {
  const cutoff = now.getTime() - windowMs;

  const inWindow = timestamps
    .map((t) => t.getTime())
    .filter((t) => t > cutoff)
    .sort((a, b) => a - b);

  if (inWindow.length < limit) return ALLOWED;

  // Pokus, kterým se limit naplnil. Až vypadne z okna, klesne počet pod limit
  // a blokace skončí.
  const decisive = inWindow[inWindow.length - limit];
  const retryAfterMs = decisive + windowMs - now.getTime();

  return {
    blocked: true,
    // Zaokrouhluje se nahoru, ať odpověď nikdy neslibuje dřívější čas, než
    // kdy blokace opravdu skončí.
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

/** Z verdiktů vybere ten přísnější, tedy s delším zbývajícím časem. */
export function strictest(...verdicts: ThrottleVerdict[]): ThrottleVerdict {
  return verdicts.reduce(
    (worst, current) =>
      current.blocked && current.retryAfterSeconds > worst.retryAfterSeconds
        ? current
        : worst,
    ALLOWED
  );
}

/** "za 2 minuty" - hláška pro přihlašovací formulář. */
export function retryAfterLabel(seconds: number): string {
  if (seconds < 60) return `za ${seconds} s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "za minutu";
  if (minutes < 5) return `za ${minutes} minuty`;
  return `za ${minutes} minut`;
}

/**
 * Jediná chyba, jejíž text se smí dostat až k uživateli. Všechno ostatní, co
 * v authorize spadne, se zahazuje do obecné hlášky - jinak by se ven dostaly
 * i vnitřnosti databáze (NextAuth posílá text výjimky do URL chybové stránky).
 */
export class LoginThrottledError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `Příliš mnoho neúspěšných pokusů. Zkus to znovu ${retryAfterLabel(
        retryAfterSeconds
      )}.`
    );
    this.name = "LoginThrottledError";
  }
}
