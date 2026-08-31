/**
 * Kontrola omezení počtu pokusů (přihlášení i registrace).
 *
 *   npm run check:rate-limit
 */

import {
  evaluateAttempts,
  retryAfterLabel,
  strictest,
} from "../src/lib/rate-limit";
import {
  LOGIN_WINDOW_MS,
  MAX_FAILURES_PER_IP,
  MAX_FAILURES_PER_USERNAME,
} from "../src/lib/login-throttle";
import {
  MAX_REGISTRATIONS_PER_IP,
  REGISTRATION_WINDOW_MS,
} from "../src/lib/registration-throttle";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const NOW = new Date(2026, 8, 14, 20, 0, 0);
const MINUTE = 60 * 1000;

/**
 * N pokusů, nejnovější `agoMinutes` minut zpátky, po deseti sekundách od sebe.
 * Rozestup je schválně malý, aby se i větší počty vešly do okna - jinak by se
 * netestoval limit, ale vypadávání z okna.
 */
function attempts(count: number, agoMinutes: number): Date[] {
  return Array.from(
    { length: count },
    (_, i) => new Date(NOW.getTime() - agoMinutes * MINUTE - i * 10_000)
  );
}

console.log("1. Limit na uživatelské jméno");
{
  check(
    !evaluateAttempts([], MAX_FAILURES_PER_USERNAME, NOW).blocked,
    "bez pokusů se nic neblokuje"
  );

  check(
    !evaluateAttempts(attempts(4, 1), MAX_FAILURES_PER_USERNAME, NOW).blocked,
    "čtyři pokusy ještě projdou"
  );

  const atLimit = evaluateAttempts(attempts(5, 1), MAX_FAILURES_PER_USERNAME, NOW);
  check(atLimit.blocked, "pátý pokus blokuje");
  check(atLimit.retryAfterSeconds > 0, "a vrací čas do odblokování");
}

console.log("2. Okno se posouvá");
{
  // Pokusy starší než okno se nepočítají.
  const old = attempts(10, LOGIN_WINDOW_MS / MINUTE + 1);
  check(
    !evaluateAttempts(old, MAX_FAILURES_PER_USERNAME, NOW).blocked,
    "staré pokusy mimo okno se ignorují"
  );

  // Hranice: pokus přesně na okraji okna už venku je.
  const edge = [new Date(NOW.getTime() - LOGIN_WINDOW_MS)];
  check(
    evaluateAttempts(edge, 1, NOW).blocked === false,
    "pokus přesně na hraně okna se nepočítá"
  );

  const inside = [new Date(NOW.getTime() - LOGIN_WINDOW_MS + 1000)];
  check(evaluateAttempts(inside, 1, NOW).blocked, "o sekundu uvnitř už ano");
}

console.log("3. Rozhoduje limit-tý nejnovější pokus");
{
  // Pět pokusů zhruba deset minut zpátky. Rozhodující je ten nejstarší z nich,
  // takže do konce okna zbývá asi pět minut.
  const five = attempts(5, 10);
  const verdict = evaluateAttempts(five, MAX_FAILURES_PER_USERNAME, NOW);
  check(verdict.blocked, "pět pokusů blokuje");
  check(
    verdict.retryAfterSeconds > 4 * 60 && verdict.retryAfterSeconds <= 5 * 60,
    "zbývá zhruba pět minut",
    `${verdict.retryAfterSeconds} s`
  );

  // Šestý, čerstvější pokus posune rozhodující pokus na novější -> blokace se
  // prodlouží. Přes přihlašovací formulář k tomu nedojde, protože authorize
  // během blokace nic nezapisuje, ale samotná funkce se chová takhle.
  const withNewer = [...five, new Date(NOW.getTime() - 1000)];
  const after = evaluateAttempts(withNewer, MAX_FAILURES_PER_USERNAME, NOW);
  check(
    after.retryAfterSeconds > verdict.retryAfterSeconds,
    "další pokus v okně blokaci prodlouží",
    `${verdict.retryAfterSeconds} s -> ${after.retryAfterSeconds} s`
  );

  // Jakmile pokusů v okně klesne pod limit, je zase průchozí.
  check(
    !evaluateAttempts(five.slice(0, 4), MAX_FAILURES_PER_USERNAME, NOW).blocked,
    "čtyři zbylé pokusy už neblokují"
  );
}

console.log("4. Limit na IP je volnější");
{
  const ten = attempts(10, 1);
  check(
    evaluateAttempts(ten, MAX_FAILURES_PER_USERNAME, NOW).blocked,
    "deset pokusů překročí limit na jméno"
  );
  check(
    !evaluateAttempts(ten, MAX_FAILURES_PER_IP, NOW).blocked,
    "ale ne limit na IP"
  );
  check(
    evaluateAttempts(attempts(MAX_FAILURES_PER_IP, 1), MAX_FAILURES_PER_IP, NOW).blocked,
    "dvacet pokusů blokuje i IP"
  );
}

console.log("5. Přísnější verdikt vyhrává");
{
  const allowed = { blocked: false, retryAfterSeconds: 0 };
  const short = { blocked: true, retryAfterSeconds: 30 };
  const long = { blocked: true, retryAfterSeconds: 300 };

  check(!strictest(allowed, allowed).blocked, "dva průchozí = průchozí");
  check(strictest(allowed, short).blocked, "jeden blokující stačí");
  check(
    strictest(short, long).retryAfterSeconds === 300,
    "vybere se delší zbývající čas"
  );
  check(
    strictest(long, short).retryAfterSeconds === 300,
    "nezáleží na pořadí"
  );
}

console.log("6. Hláška o zbývajícím čase");
{
  check(retryAfterLabel(30) === "za 30 s", "sekundy", retryAfterLabel(30));
  check(retryAfterLabel(60) === "za minutu", "jedna minuta", retryAfterLabel(60));
  check(retryAfterLabel(120) === "za 2 minuty", "dvě minuty", retryAfterLabel(120));
  check(retryAfterLabel(600) === "za 10 minut", "deset minut", retryAfterLabel(600));

  // Zaokrouhluje se nahoru, ať hláška neslíbí dřívější čas, než blokace končí.
  check(retryAfterLabel(61) === "za 2 minuty", "61 s se zaokrouhlí nahoru");
}

console.log("7. Limit registrací na IP");
{
  const within = (count: number) =>
    Array.from({ length: count }, (_, i) => new Date(NOW.getTime() - i * 10_000));

  check(
    REGISTRATION_WINDOW_MS > LOGIN_WINDOW_MS,
    "okno registraci je delsi nez u prihlaseni",
    `${REGISTRATION_WINDOW_MS} vs ${LOGIN_WINDOW_MS}`
  );

  check(
    !evaluateAttempts(
      within(MAX_REGISTRATIONS_PER_IP - 1),
      MAX_REGISTRATIONS_PER_IP,
      NOW,
      REGISTRATION_WINDOW_MS
    ).blocked,
    "tesne pod limitem projde"
  );

  const atLimit = evaluateAttempts(
    within(MAX_REGISTRATIONS_PER_IP),
    MAX_REGISTRATIONS_PER_IP,
    NOW,
    REGISTRATION_WINDOW_MS
  );
  check(atLimit.blocked, "na limitu blokuje");
  check(atLimit.retryAfterSeconds > 0, "a vraci cas do odblokovani");

  // Pokusy starsi nez okno registraci se nepocitaji.
  const old = [new Date(NOW.getTime() - REGISTRATION_WINDOW_MS - 1000)];
  check(
    !evaluateAttempts(old, 1, NOW, REGISTRATION_WINDOW_MS).blocked,
    "stary pokus mimo okno se ignoruje"
  );
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
