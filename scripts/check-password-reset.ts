/**
 * Kontrola pravidel pro reset a změnu hesla.
 *
 *   npm run check:password-reset
 */

import {
  MIN_PASSWORD_LENGTH,
  RESET_TOKEN_TTL_MINUTES,
  RESET_TOKEN_TTL_MS,
  canIssueResetFor,
  resetTokenState,
  validateNewPassword,
} from "../src/lib/password-rules";
import {
  buildResetUrl,
  createResetToken,
  hashResetToken,
  tokenHashMatches,
} from "../src/lib/password-reset";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const NOW = new Date(2026, 8, 6, 20, 0, 0);

console.log("1. Vydání tokenu");
{
  const issued = createResetToken(NOW);

  check(issued.token.length >= 40, "token je dost dlouhý", `délka ${issued.token.length}`);

  check(
    /^[A-Za-z0-9_-]+$/.test(issued.token),
    "token je bezpečný do URL",
    issued.token
  );

  check(
    issued.tokenHash === hashResetToken(issued.token),
    "uložený otisk odpovídá tokenu"
  );

  check(
    issued.tokenHash !== issued.token,
    "do databáze nejde samotný token"
  );

  check(
    issued.expiresAt.getTime() - NOW.getTime() === RESET_TOKEN_TTL_MS,
    `platnost je ${RESET_TOKEN_TTL_MINUTES} minut`
  );

  // Sto tokenů po sobě musí být sto různých hodnot - kdyby se generátor
  // opakoval, dal by se odkaz odvodit z dřívějšího.
  const many = new Set(
    Array.from({ length: 100 }, () => createResetToken(NOW).token)
  );
  check(many.size === 100, "tokeny se neopakují", `unikátních ${many.size} ze 100`);
}

console.log("2. Porovnání otisků");
{
  const issued = createResetToken(NOW);

  check(
    tokenHashMatches(issued.tokenHash, hashResetToken(issued.token)),
    "shodné otisky projdou"
  );

  check(
    !tokenHashMatches(issued.tokenHash, hashResetToken(`${issued.token}x`)),
    "jiný token neprojde"
  );

  check(!tokenHashMatches("abc", "abcdef"), "různě dlouhé otisky neprojdou");
}

console.log("3. Stav odkazu");
{
  const valid = { expiresAt: new Date(NOW.getTime() + 60_000), usedAt: null };
  check(resetTokenState(valid, NOW) === "VALID", "platný odkaz je VALID");

  const expired = { expiresAt: new Date(NOW.getTime() - 1), usedAt: null };
  check(resetTokenState(expired, NOW) === "EXPIRED", "propadlý odkaz je EXPIRED");

  const exactly = { expiresAt: new Date(NOW.getTime()), usedAt: null };
  check(
    resetTokenState(exactly, NOW) === "EXPIRED",
    "odkaz vyprší přesně v čase platnosti, ne až po něm"
  );

  const used = {
    expiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: new Date(NOW.getTime() - 1000),
  };
  check(resetTokenState(used, NOW) === "USED", "spotřebovaný odkaz je USED");

  // Spotřebovaný odkaz po vypršení hlásí USED, ne EXPIRED - jinak by hráč
  // marně žádal o nový, když si heslo právě nastavil.
  const usedAndExpired = {
    expiresAt: new Date(NOW.getTime() - 60_000),
    usedAt: new Date(NOW.getTime() - 90_000),
  };
  check(
    resetTokenState(usedAndExpired, NOW) === "USED",
    "použití má přednost před vypršením"
  );
}

console.log("4. Kdo komu smí vydat reset");
{
  check(canIssueResetFor("ADMIN", "USER"), "admin resetuje uživatele");
  check(canIssueResetFor("ADMIN", "MODERATOR"), "admin resetuje moderátora");
  check(canIssueResetFor("ADMIN", "ADMIN"), "admin resetuje jiného admina");

  check(canIssueResetFor("MODERATOR", "USER"), "moderátor resetuje uživatele");

  // Tohle je jádro věci: moderátor nesmí sáhnout na účet s vyššími právy,
  // jinak by si přes reset admin účtu obešel to, že nesmí měnit role.
  check(
    !canIssueResetFor("MODERATOR", "ADMIN"),
    "moderátor NEsmí resetovat admina"
  );
  check(
    !canIssueResetFor("MODERATOR", "MODERATOR"),
    "moderátor NEsmí resetovat moderátora"
  );

  check(!canIssueResetFor("USER", "USER"), "běžný uživatel nesmí nic");
  check(!canIssueResetFor(null, "USER"), "nepřihlášený nesmí nic");
  check(!canIssueResetFor(undefined, "USER"), "chybějící role nesmí nic");
  check(!canIssueResetFor("admin", "USER"), "role se porovnává přesně");
}

console.log("5. Nové heslo");
{
  const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  const ok = "a".repeat(MIN_PASSWORD_LENGTH);

  check(validateNewPassword(ok, ok) === null, "heslo na hranici délky projde");
  check(validateNewPassword(short, short) !== null, "kratší heslo neprojde");
  check(validateNewPassword("", "") !== null, "prázdné heslo neprojde");
  check(
    validateNewPassword("dostatecne-dlouhe", "dostatecne-dlouhE") !== null,
    "neshodný opis neprojde"
  );

  // Délka se kontroluje dřív než shoda - jinak by u dvou stejných krátkých
  // hesel dostal člověk hlášku o neshodě, která nesedí.
  check(
    validateNewPassword(short, short)?.includes(String(MIN_PASSWORD_LENGTH)) === true,
    "u krátkého hesla se hlásí délka"
  );

  check(
    validateNewPassword(" ".repeat(MIN_PASSWORD_LENGTH), " ".repeat(MIN_PASSWORD_LENGTH)) ===
      null,
    "heslo se neořezává - mezery jsou platné znaky"
  );
}

console.log("6. Sestavení odkazu");
{
  check(
    buildResetUrl("https://example.com", "abc") === "https://example.com/reset-hesla/abc",
    "odkaz míří na stránku resetu"
  );

  check(
    buildResetUrl("https://example.com/", "abc") ===
      "https://example.com/reset-hesla/abc",
    "koncové lomítko v základu nedělá dvojité lomítko"
  );

  check(
    buildResetUrl("https://example.com///", "abc") ===
      "https://example.com/reset-hesla/abc",
    "víc koncových lomítek taky ne"
  );

  let threw = false;
  try {
    buildResetUrl(undefined, "abc");
  } catch {
    threw = true;
  }
  check(threw, "bez NEXTAUTH_URL se odkaz nevydá");

  let threwEmpty = false;
  try {
    buildResetUrl("", "abc");
  } catch {
    threwEmpty = true;
  }
  check(threwEmpty, "prázdná NEXTAUTH_URL se bere jako chybějící");
}

console.log(`\n${checks} kontrol, ${failures} chyb`);
process.exit(failures === 0 ? 0 : 1);
