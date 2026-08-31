/**
 * Obecné počítání pokusů v klouzavém okně.
 *
 * Modul je čistý (bez databáze), aby šel testovat samostatně
 * (viz scripts/check-rate-limit.ts). Konkrétní limity a práci s databází mají
 * login-attempts.ts a registration-attempts.ts.
 *
 * Klouzavé okno znamená, že se nikde nedrží stav "zablokováno do" - blokace se
 * sama rozpustí tím, jak staré pokusy z okna vypadnou.
 */

export interface ThrottleVerdict {
  blocked: boolean;
  /** Za kolik sekund má smysl to zkusit znovu. Nula, když se neblokuje. */
  retryAfterSeconds: number;
}

const ALLOWED: ThrottleVerdict = { blocked: false, retryAfterSeconds: 0 };

/**
 * Posoudí seznam časů pokusů proti limitu.
 *
 * Rozhoduje limit-tý nejnovější pokus: blokace trvá, dokud jich v okně
 * nezbude míň než limit. Víc pokusů tedy znamená delší blokaci.
 *
 * Zamknout se natrvalo opakovaným zkoušením přesto nejde - volající během
 * blokace žádný další pokus nezapisuje, takže se počítadlo nemá čím posouvat.
 */
export function evaluateAttempts(
  timestamps: Date[],
  limit: number,
  now: Date = new Date(),
  windowMs: number = 15 * 60 * 1000
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

/** "za 2 minuty" - hláška do formuláře. */
export function retryAfterLabel(seconds: number): string {
  if (seconds < 60) return `za ${seconds} s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "za minutu";
  if (minutes < 5) return `za ${minutes} minuty`;
  return `za ${minutes} minut`;
}

/**
 * IP z hlaviček proxy. Za nedůvěryhodnou proxy jde hodnota podvrhnout, takže
 * limity na IP jsou vždycky jen doplněk k něčemu, co se podvrhnout nedá.
 */
export function clientIpFromHeaders(
  lookup: (name: string) => string | null | undefined
): string | null {
  const read = (name: string): string | null => {
    const value = lookup(name);
    if (!value) return null;
    return value.split(",")[0]?.trim() || null;
  };

  return read("x-forwarded-for") ?? read("x-real-ip") ?? null;
}
