/**
 * Limity pro přihlašování. Obecné počítání pokusů je v rate-limit.ts.
 */

import { retryAfterLabel } from "@/lib/rate-limit";

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
