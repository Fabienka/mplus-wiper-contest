/**
 * Kontrola, že produkce běží přes HTTPS.
 *
 * Přihlášení, registrace i změna hesla posílají heslo v těle požadavku tak,
 * jak ho člověk napsal - ve vývojářských nástrojích prohlížeče je vidět jako
 * čitelný text. To je v pořádku a je to standardní postup: na cestě ho šifruje
 * TLS a do databáze jde jen bcrypt otisk. Hashovat nebo šifrovat heslo už
 * v prohlížeči nic nepřidá - otisk by se prostě stal novým heslem, které jde
 * odposlechnout a přehrát stejně, a útočník schopný číst provoz by podstrčil
 * i upravený JavaScript.
 *
 * Celé to tedy stojí na tom, že provoz jde přes HTTPS. Aplikace to sama
 * nepozná (TLS ukončuje proxy před ní), ale pozná to z NEXTAUTH_URL - podle
 * ní NextAuth rozhoduje i o tom, jestli session cookie dostane příznak
 * Secure. Adresa s http:// na produkci znamená hesla i session v čitelné
 * podobě po síti, proto na ni server při startu spadne.
 */

/** Adresy, na kterých heslo neopustí počítač - `npm start` na zkoušku. */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Co je špatně s adresou z NEXTAUTH_URL, nebo null, když je v pořádku.
 * Čistá funkce kvůli kontrolnímu skriptu (`npm run check:auth-url`).
 */
export function authUrlProblem(raw: string | undefined): string | null {
  const value = raw?.trim();

  if (!value) {
    return (
      "NEXTAUTH_URL není nastavená. Bez ní NextAuth neví, že běží na HTTPS, " +
      "a nevydají se ani odkazy na reset hesla."
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `NEXTAUTH_URL "${value}" není platná adresa.`;
  }

  if (url.protocol === "https:") return null;

  if (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname)) return null;

  return (
    `NEXTAUTH_URL "${value}" nezačíná https://. Hesla i session cookie by šly ` +
    `po síti čitelně. Nastav veřejnou adresu s https:// a před aplikaci proxy ` +
    `s HTTPS (viz README, sekce Nasazení na server).`
  );
}

/**
 * Na produkci vyhodí výjimku, když NEXTAUTH_URL neukazuje na HTTPS. Ve vývoji
 * nedělá nic - tam se jezdí na http://localhost a je to tak správně.
 */
export function assertSecureAuthUrl(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problem = authUrlProblem(process.env.NEXTAUTH_URL);
  if (problem) throw new Error(problem);
}
