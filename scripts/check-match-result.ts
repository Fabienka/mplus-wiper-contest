/**
 * Kontrola ověřování běhu proti zápasu.
 *
 *   npm run check:match-result
 */

import { DEFAULT_SCORING_CONFIG } from "../src/lib/scoring";
import {
  evaluateRun,
  latestRunStart,
  type MatchContext,
  type RunCandidate,
} from "../src/lib/match-result";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

// Sestava odpovídá reálnému běhu 3868732 (The Blinding Vale +10).
const SESTAVA = [
  ["c1", "Raaymage", "Drak'thul"],
  ["c2", "Twokrigg", "Drak'thul"],
  ["c3", "Witezoo", "Drak'thul"],
  ["c4", "Thórus", "Drak'thul"],
  ["c5", "Cukrbliky", "Drak'thul"],
] as const;

const context: MatchContext = {
  windowStart: new Date("2026-08-25T16:00:00.000Z"),
  windowEnd: new Date("2026-08-25T18:00:00.000Z"),
  teamCharacters: SESTAVA.map(([id, characterName, realm]) => ({
    id,
    characterName,
    realm,
  })),
  seasonDungeons: [
    { dungeonName: "The Blinding Vale", abbreviation: "BV", bonusMultiplier: 1 },
    { dungeonName: "Ara-Kara, City of Echoes", abbreviation: "ARAK", bonusMultiplier: 1 },
  ],
  config: DEFAULT_SCORING_CONFIG,
};

/** Reálný běh: +10, 20:40 z limitu 30:00, 2 chesty. */
function realnyBeh(prepis: Partial<RunCandidate> = {}): RunCandidate {
  return {
    dungeonName: "The Blinding Vale",
    abbreviation: "BV",
    keyLevel: 10,
    clearTimeSeconds: 1240,
    parTimeSeconds: 1800,
    keystoneUpgrades: 2,
    completedAt: new Date("2026-08-25T17:14:24.000Z"),
    roster: SESTAVA.map(([, characterName, realm]) => ({ characterName, realm })),
    ...prepis,
  };
}

console.log("1. Reálný běh z Raider.io projde");
{
  const r = evaluateRun(realnyBeh(), context);
  check(r.valid, "běh je platný", r.reasons.join(" | "));
  check(r.dungeon?.abbreviation === "BV", "napároval se dungeon");
  check(r.matchedCharacterIds.length === 5, "všech 5 postav je z týmu",
    String(r.matchedCharacterIds.length));
  check(r.outsiders.length === 0, "nikdo cizí");
  check(r.score.scored, "a boduje se");
  if (r.score.scored) {
    // +10 = 0 bodů za klíč, zbývá 31,1 % limitu.
    check(r.score.keyLevelPoints === 0, "+10 dá 0 bodů za klíč",
      String(r.score.keyLevelPoints));
    check(
      Math.abs(r.score.timeBonus - 31.11) < 0.1,
      "časový bonus ~31,1",
      String(r.score.timeBonus)
    );
  }
}

console.log("2. Dungeon mimo rotaci");
{
  const r = evaluateRun(
    realnyBeh({ dungeonName: "Neznámý dungeon", abbreviation: "XYZ" }),
    context
  );
  check(!r.valid, "neplatný");
  check(r.dungeon === null, "dungeon se nenapároval");
  check(r.reasons.some((x) => x.includes("rotaci")), "řekne proč", r.reasons.join(" | "));
  check(!r.countsTowardTimeLimit, "dungeon mimo rotaci herní čas nečerpá");
}

console.log("3. Párování dungeonu");
{
  // Zkratka má přednost, ale funguje i shoda názvu.
  const podleNazvu = evaluateRun(realnyBeh({ abbreviation: "" }), context);
  check(podleNazvu.dungeon?.abbreviation === "BV", "napáruje i podle názvu");

  const jinaVelikost = evaluateRun(realnyBeh({ abbreviation: "bv" }), context);
  check(jinaVelikost.dungeon?.abbreviation === "BV", "nezáleží na velikosti písmen");
}

console.log("4. Okno zápasu - rozhoduje začátek běhu");
{
  const CLEAR_MS = 1240 * 1000;
  const koncem = (start: Date) => new Date(start.getTime() + CLEAR_MS);

  const pred = evaluateRun(
    realnyBeh({ completedAt: new Date("2026-08-25T15:30:00.000Z") }),
    context
  );
  check(!pred.valid, "běh začatý před oknem je neplatný");
  check(
    pred.reasons.some((x) => x.includes("před začátkem")),
    "a řekne o kolik",
    pred.reasons.join(" | ")
  );
  check(!pred.countsTowardTimeLimit, "a herní čas nečerpá");

  // Začátek přesně v okamžiku otevření okna ještě platí.
  const naZacatku = evaluateRun(realnyBeh({ completedAt: koncem(context.windowStart) }), context);
  check(naZacatku.valid, "start přesně na začátku okna projde", naZacatku.reasons.join(" | "));

  // Konec okna je jen orientační: běh doběhlý po něm, ale začatý ve dni
  // termínu, platí.
  const poKonciOkna = evaluateRun(
    realnyBeh({ completedAt: new Date("2026-08-25T18:20:00.000Z") }),
    context
  );
  check(poKonciOkna.valid, "doběh po konci okna projde", poKonciOkna.reasons.join(" | "));
  check(poKonciOkna.countsTowardTimeLimit, "a čerpá herní čas");

  // Poslední start ve 23:59 dne termínu - doběhne po půlnoci a platí.
  const posledni = new Date(latestRunStart(context.windowStart).getTime() - 30_000);
  const poPulnoci = evaluateRun(realnyBeh({ completedAt: koncem(posledni) }), context);
  check(poPulnoci.valid, "start 23:59 a doběh po půlnoci projde", poPulnoci.reasons.join(" | "));

  // Start po půlnoci už ne.
  const druhyDen = new Date(latestRunStart(context.windowStart).getTime() + 10 * 60_000);
  const pozde = evaluateRun(realnyBeh({ completedAt: koncem(druhyDen) }), context);
  check(!pozde.valid, "start po půlnoci je neplatný");
  check(
    pozde.reasons.some((x) => x.includes("po 23:59 dne termínu")),
    "a řekne proč",
    pozde.reasons.join(" | ")
  );
  check(!pozde.countsTowardTimeLimit, "a herní čas nečerpá");
}

console.log("5. Cizí hráč v sestavě");
{
  const roster: { characterName: string; realm: string }[] = SESTAVA.map(
    ([, characterName, realm]) => ({ characterName, realm })
  );
  roster[2] = { characterName: "Cizinec", realm: "Drak'thul" };

  const r = evaluateRun(realnyBeh({ roster }), context);
  check(!r.valid, "neplatný");
  check(r.outsiders.length === 1 && r.outsiders[0] === "Cizinec", "označí kdo",
    r.outsiders.join(","));
  check(r.matchedCharacterIds.length === 4, "zbylé čtyři se napárovaly");
  check(
    r.reasons.some((x) => x.includes("Cizinec")),
    "a je to v důvodech",
    r.reasons.join(" | ")
  );
  check(!r.countsTowardTimeLimit, "běh s cizím hráčem herní čas nečerpá");
}

console.log("6. Porovnání jmen a realmů");
{
  // Raider.io vrací jména s diakritikou a realm s apostrofem - musí sedět
  // i při jiné velikosti písmen nebo pomlčce místo apostrofu.
  const roster = [
    { characterName: "RAAYMAGE", realm: "Drakthul" },
    { characterName: "twokrigg", realm: "Drak-thul" },
    { characterName: "Witezoo", realm: "drak'thul" },
    { characterName: "Thórus", realm: "Drak'thul" },
    { characterName: " Cukrbliky ", realm: "Drak'thul" },
  ];
  const r = evaluateRun(realnyBeh({ roster }), context);
  check(r.matchedCharacterIds.length === 5, "napáruje se všech 5",
    `${r.matchedCharacterIds.length}, mimo: ${r.outsiders.join(",")}`);
  check(r.valid, "a běh je platný");
}

console.log("7. Nestihnutý a příliš nízký klíč");
{
  const nestihnuty = evaluateRun(
    realnyBeh({ keystoneUpgrades: 0, clearTimeSeconds: 1900 }),
    context
  );
  check(!nestihnuty.valid, "nestihnutý klíč je neplatný");
  check(!nestihnuty.score.scored, "a neboduje se");
  check(nestihnuty.countsTowardTimeLimit, "herní čas ale čerpá");

  const nizky = evaluateRun(realnyBeh({ keyLevel: 8 }), context);
  check(!nizky.valid, "+8 je neplatný");
  check(nizky.countsTowardTimeLimit, "nízký klíč herní čas čerpá taky");
  check(
    nizky.reasons.some((x) => x.includes("+10")),
    "zmíní hranici bodování",
    nizky.reasons.join(" | ")
  );
}

console.log("8. Násobitel dungeonu se promítne");
{
  const zvyhodnene: MatchContext = {
    ...context,
    seasonDungeons: [
      { dungeonName: "The Blinding Vale", abbreviation: "BV", bonusMultiplier: 1.5 },
    ],
  };
  const bez = evaluateRun(realnyBeh(), context);
  const s = evaluateRun(realnyBeh(), zvyhodnene);

  check(
    bez.score.scored && s.score.scored && s.score.points > bez.score.points,
    "zvýhodněný dungeon dá víc bodů",
    bez.score.scored && s.score.scored ? `${bez.score.points} -> ${s.score.points}` : ""
  );
}

console.log("9. Víc důvodů najednou");
{
  const r = evaluateRun(
    realnyBeh({
      abbreviation: "XYZ",
      dungeonName: "Neznámý",
      keyLevel: 8,
      // Až další den - start po 23:59 dne termínu je třetí důvod.
      completedAt: new Date("2026-08-26T08:00:00.000Z"),
    }),
    context
  );
  check(!r.valid, "neplatný");
  check(r.reasons.length >= 3, "vypíše všechny důvody, ne jen první",
    String(r.reasons.length));
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
