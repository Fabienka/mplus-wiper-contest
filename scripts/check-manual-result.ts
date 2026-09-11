/**
 * Kontrola ručního zadání běhu se screenshotem.
 *
 *   npm run check:manual-result
 */

import {
  SCREENSHOT_MAX_PIXELS,
  detectImageType,
  fitWithinPixels,
  isAwaitingVerification,
  manualRunCandidate,
  parseClearTime,
} from "../src/lib/manual-result";
import { evaluateRun, type MatchContext } from "../src/lib/match-result";
import { parseKeyLevelInput, parseManualResultForm } from "../src/lib/manual-result-form";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

console.log("1. Typ obrázku podle obsahu");
{
  check(
    detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)) === "image/png",
    "PNG"
  );
  check(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)) === "image/jpeg", "JPEG");
  check(
    detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), 0)) === "image/webp",
    "WebP"
  );
  check(detectImageType(bytes(...ascii("GIF89a"))) === null, "GIF se nebere");
  check(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"))) === null, "RIFF, ale ne WebP");
  check(detectImageType(bytes(...ascii("<svg xmlns"))) === null, "SVG (text) se nebere");
  check(detectImageType(bytes(0x89, 0x50)) === null, "useknutý soubor");
  check(detectImageType(bytes()) === null, "prázdný soubor");
}

console.log("2. Čas doběhnutí");
{
  const is = (text: string, expected: number | null) => {
    const actual = parseClearTime(text);
    check(actual === expected, `"${text}" je ${expected}`, String(actual));
  };

  is("32:15", 32 * 60 + 15);
  is("5:07", 5 * 60 + 7);
  is(" 32:15 ", 32 * 60 + 15);
  is("32:15.4", 32 * 60 + 15);
  is("32:15,9", 32 * 60 + 15);
  is("75:00", 75 * 60);
  is("1:02:15", 3600 + 2 * 60 + 15);
  is("32:60", null);
  is("1:75:00", null);
  is("32", null);
  is("0:00", null);
  is("", null);
  is("abc", null);
}

console.log("3. Ruční běh prochází stejným hodnocením");
{
  const context: MatchContext = {
    windowStart: new Date(2026, 8, 13, 18, 0),
    windowEnd: new Date(2026, 8, 13, 22, 0),
    teamCharacters: [],
    seasonDungeons: [
      { dungeonName: "Ara-Kara, City of Echoes", abbreviation: "ARAK", bonusMultiplier: 1 },
    ],
    config: { minScoredKeyLevel: 10, pointsPerKeyLevel: 100, timeBudgetMinutes: 120 },
  };

  const run = (overrides: Partial<Parameters<typeof manualRunCandidate>[0]> = {}) =>
    manualRunCandidate({
      dungeonName: "Ara-Kara, City of Echoes",
      abbreviation: "ARAK",
      timeLimitSeconds: 30 * 60,
      keyLevel: 12,
      clearTimeSeconds: 27 * 60,
      completedAt: new Date(2026, 8, 13, 19, 30),
      ...overrides,
    });

  const ok = evaluateRun(run(), context);
  check(ok.valid, "stihnutý běh v okně je v pořádku", ok.reasons.join(" "));
  check(
    ok.score.scored && Math.abs(ok.score.points - 210) < 1e-9,
    "body: 2 úrovně nad hranicí + 10 % ušetřeného času",
    ok.score.scored ? String(ok.score.points) : ok.score.reason
  );

  const late = evaluateRun(run({ clearTimeSeconds: 31 * 60 }), context);
  check(!late.valid && !late.score.scored, "přetažený limit se nepočítá");
  check(late.countsTowardTimeLimit, "nestihnutý klíč ale herní čas čerpá");

  // Okno 18:00-22:00, běh trvá 27 min. Rozhoduje začátek, ne konec.
  const afterWindowEnd = evaluateRun(run({ completedAt: new Date(2026, 8, 13, 23, 0) }), context);
  check(afterWindowEnd.valid, "začal 22:33 - po konci okna, ale ve dni termínu, platí");
  check(afterWindowEnd.countsTowardTimeLimit, "a čerpá herní čas");

  const pastMidnight = evaluateRun(run({ completedAt: new Date(2026, 8, 14, 0, 17) }), context);
  check(pastMidnight.valid, "začal 23:50 a doběhl po půlnoci - platí");

  const nextDay = evaluateRun(run({ completedAt: new Date(2026, 8, 14, 0, 37) }), context);
  check(!nextDay.valid, "začal 0:10 dalšího dne - neplatí");
  check(
    nextDay.reasons.some((r) => r.includes("po 23:59 dne termínu")),
    "důvod říká, že začal po 23:59",
    nextDay.reasons.join(" ")
  );
  check(!nextDay.countsTowardTimeLimit, "a herní čas nečerpá");

  const early = evaluateRun(run({ completedAt: new Date(2026, 8, 13, 18, 20) }), context);
  check(!early.valid, "začal 17:53 - před oknem, neplatí");
  check(
    early.reasons.some((r) => r.includes("před začátkem okna")),
    "důvod říká, že začal před oknem",
    early.reasons.join(" ")
  );
  check(!early.countsTowardTimeLimit, "a herní čas nečerpá");

  const noLimit = evaluateRun(run({ timeLimitSeconds: null }), context);
  check(
    !noLimit.valid && noLimit.reasons.some((r) => r.includes("časový limit")),
    "dungeon bez limitu hlásí chybějící limit",
    noLimit.reasons.join(" ")
  );
}

console.log("4. Čekání na ověření");
{
  check(isAwaitingVerification({ source: "SCREENSHOT", verifiedById: null }), "ruční bez ověření čeká");
  check(!isAwaitingVerification({ source: "SCREENSHOT", verifiedById: "u1" }), "ověřený už nečeká");
  check(!isAwaitingVerification({ source: "RAIDERIO", verifiedById: null }), "běh z Raider.io nečeká");
  check(
    !isAwaitingVerification({ source: "SCREENSHOT", verifiedById: null, abandoned: true }),
    "vzdaný pokus na ověření nečeká"
  );
}

console.log("5. Zmenšení screenshotu v prohlížeči");
{
  const fit = (w: number, h: number) => fitWithinPixels(w, h, SCREENSHOT_MAX_PIXELS);

  const fullHd = fit(1920, 1080);
  check(fullHd.width === 1920 && fullHd.height === 1080, "Full HD se nezmenšuje", JSON.stringify(fullHd));

  const qhd = fit(2560, 1440);
  check(qhd.width === 2560 && qhd.height === 1440, "1440p přesně na hranici zůstává", JSON.stringify(qhd));

  const uhd = fit(3840, 2160);
  check(uhd.width === 2560 && uhd.height === 1440, "4K se zmenší na 2560 × 1440", JSON.stringify(uhd));

  const ultrawide = fit(5120, 1440);
  check(
    ultrawide.width * ultrawide.height <= SCREENSHOT_MAX_PIXELS,
    "super ultrawide se vejde do limitu bodů",
    JSON.stringify(ultrawide)
  );
  check(
    Math.abs(ultrawide.width / ultrawide.height - 5120 / 1440) < 0.01,
    "a drží poměr stran",
    JSON.stringify(ultrawide)
  );

  const tall = fit(1440, 5120);
  check(tall.width < 1440 && tall.height < 5120, "na výšku se zmenší taky", JSON.stringify(tall));
}

/** Čtení formuláře je asynchronní (obsah souboru), proto zvlášť. */
async function formChecks() {
  console.log("6. Formulář ručního běhu");

  check(parseKeyLevelInput("12") === 12, "výška 12");
  check(parseKeyLevelInput("+15") === 15, "výška +15");
  check(parseKeyLevelInput("1") === null, "výška 1 je mimo rozsah");
  check(parseKeyLevelInput("12.5") === null, "desetinná výška neprojde");
  check(parseKeyLevelInput("") === null, "prázdná výška neprojde");

  const png = new File([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)], "shot.png", {
    type: "image/png",
  });

  const form = (fields: Record<string, string | File>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  };

  const full = {
    matchId: "m1",
    dungeon: "Ara-Kara, City of Echoes",
    keyLevel: "12",
    clearTime: "27:41",
    completedDate: "13. 9. 2026",
    completedTime: "19:30",
    screenshot: png,
  };

  const ok = await parseManualResultForm(form(full));
  check(
    ok.ok &&
      ok.value.keyLevel === 12 &&
      ok.value.clearTimeSeconds === 27 * 60 + 41 &&
      ok.value.completedAt.getTime() === new Date(2026, 8, 13, 19, 30).getTime() &&
      !ok.value.abandoned,
    "úplný formulář projde",
    ok.ok ? undefined : ok.message
  );

  const abandoned = await parseManualResultForm(form({ ...full, abandoned: "on" }));
  check(abandoned.ok && abandoned.value.abandoned, "zaškrtnutý vzdaný pokus se přečte");

  const noShot = await parseManualResultForm(form({ ...full, screenshot: new File([], "x.png") }));
  check(!noShot.ok && noShot.message.includes("screenshot"), "bez screenshotu neprojde");

  const gif = await parseManualResultForm(
    form({ ...full, screenshot: new File([bytes(...ascii("GIF89a"))], "x.gif") })
  );
  check(!gif.ok && gif.message.includes("PNG"), "GIF neprojde");

  const noTime = await parseManualResultForm(form({ ...full, clearTime: "" }));
  check(!noTime.ok, "bez času neprojde");

  const noDay = await parseManualResultForm(form({ ...full, completedDate: "" }));
  check(!noDay.ok, "bez dne konce neprojde");
}

formChecks().then(() => {
  if (failures > 0) {
    console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
    process.exit(1);
  }

  console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
});
