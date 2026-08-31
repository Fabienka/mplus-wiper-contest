/**
 * Kontrola bodování běhů.
 *
 *   npm run check:scoring
 */

import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfigError,
  bestRun,
  parseScoringConfig,
  scoreRun,
  scoreRuns,
  type RunInput,
} from "../src/lib/scoring";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const cfg = DEFAULT_SCORING_CONFIG;

/** Běh na dané procento limitu; par 1980 s = 33 min (Mead). */
function run(keyLevel: number, podilLimitu: number, par = 1980): RunInput {
  const clear = Math.round(par * podilLimitu);
  return {
    keyLevel,
    clearTimeSeconds: clear,
    parTimeSeconds: par,
    keystoneUpgrades: clear <= par ? 1 : 0,
  };
}

const points = (r: RunInput) => {
  const s = scoreRun(r, cfg);
  return s.scored ? s.points : null;
};

console.log("1. Základní výpočet");
{
  // +12 doběhnutý na 80 % limitu = +2 chest -> 200 bodů za klíč + 20 % času.
  const s = scoreRun(run(12, 0.8), cfg);
  check(s.scored, "stihnutý +12 se boduje");
  if (s.scored) {
    check(s.keyLevelPoints === 200, "body za klíč = 200", String(s.keyLevelPoints));
    check(Math.abs(s.timeBonus - 20) < 1e-9, "časový bonus = 20 %", String(s.timeBonus));
    check(Math.abs(s.points - 220) < 1e-9, "celkem 220", String(s.points));
  }

  // Nejnižší bodovaný klíč doběhnutý přesně na limit = nula.
  const naLimit = scoreRun(run(10, 1.0), cfg);
  check(naLimit.scored && Math.abs(naLimit.points) < 1e-9, "+10 přesně na limit = 0 bodů");
  check(
    (points(run(18, 0.6)) ?? 0) > 800,
    "+18 na +3 chest je přes 800",
    String(points(run(18, 0.6)))
  );
}

console.log("2. Co se neboduje");
{
  const pres = scoreRun(run(12, 1.2), cfg);
  check(!pres.scored, "klíč přes čas se neboduje");
  check(
    !pres.scored && pres.reason.includes("limitu"),
    "a řekne proč",
    !pres.scored ? pres.reason : ""
  );

  const nizky = scoreRun(run(8, 0.6), cfg);
  check(!nizky.scored, "stihnutý +8 se neboduje (pod hranicí)");
  check(
    !nizky.scored && nizky.reason.includes("+10"),
    "a zmíní hranici",
    !nizky.scored ? nizky.reason : ""
  );

  check(!scoreRun(run(9, 0.5), cfg).scored, "ani +9 zaběhnutý rychle");
  check(scoreRun(run(10, 0.99), cfg).scored, "ale +10 těsně v limitu ano");

  // Neplatná vstupní data nesmí propadnout na body.
  check(
    !scoreRun({ keyLevel: 12, clearTimeSeconds: 1000, parTimeSeconds: 0 }, cfg).scored,
    "chybějící limit se neboduje"
  );
  check(
    !scoreRun({ keyLevel: 12, clearTimeSeconds: 0, parTimeSeconds: 1980 }, cfg).scored,
    "nulový čas doběhnutí se neboduje"
  );
  check(
    !scoreRun({ keyLevel: 0, clearTimeSeconds: 1000, parTimeSeconds: 1980 }, cfg).scored,
    "nesmyslná výška klíče se neboduje"
  );
}

console.log("3. Verdikt hry má přednost před porovnáním časů");
{
  // Hra řekne "nestihnuto", i když by z časů vyšlo, že to stihli - věříme hře.
  const hraRika = scoreRun(
    { keyLevel: 12, clearTimeSeconds: 1900, parTimeSeconds: 1980, keystoneUpgrades: 0 },
    cfg
  );
  check(!hraRika.scored, "keystoneUpgrades = 0 znamená nebodováno");

  // Bez údaje z hry (screenshot) se rozhodne podle časů.
  const zeScreenshotu = scoreRun(
    { keyLevel: 12, clearTimeSeconds: 1900, parTimeSeconds: 1980 },
    cfg
  );
  check(zeScreenshotu.scored, "bez údaje z hry rozhodne čas");
  const presCas = scoreRun(
    { keyLevel: 12, clearTimeSeconds: 2100, parTimeSeconds: 1980 },
    cfg
  );
  check(!presCas.scored, "a přes limit se neboduje");
}

console.log("4. Vyšší klíč nikdy neprohraje s nižším");
{
  let chyba = false;
  // Nejlepší možný nižší klíč proti nejhoršímu možnému vyššímu.
  for (let a = 10; a <= 18; a++) {
    for (let b = a + 1; b <= 18; b++) {
      const nejlepsiNizsi = points(run(a, 0.001));
      const nejhorsiVyssi = points(run(b, 1.0));
      if (nejlepsiNizsi === null || nejhorsiVyssi === null) continue;
      if (nejlepsiNizsi >= nejhorsiVyssi) {
        console.error(`  ✗ +${a} (${nejlepsiNizsi}) >= +${b} (${nejhorsiVyssi})`);
        chyba = true;
      }
    }
  }
  check(!chyba, "napříč +10 až +18 v celém rozsahu časů");

  // Totéž napříč různě dlouhými dungeony ze sezóny.
  const limity = [1680, 1740, 1800, 1860, 1920, 1950, 1980, 2040];
  let chybaDungeony = false;
  for (const par1 of limity) {
    for (const par2 of limity) {
      const nizsi = points(run(12, 0.001, par1));
      const vyssi = points(run(13, 1.0, par2));
      if (nizsi !== null && vyssi !== null && nizsi >= vyssi) chybaDungeony = true;
    }
  }
  check(!chybaDungeony, "platí i mezi dungeony s různým limitem");
}

console.log("5. Stejný klíč: rozhoduje čas, délka dungeonu nevadí");
{
  // Stejné procento limitu = stejné skóre, i když jde o jinak dlouhý dungeon.
  const kratky = points(run(12, 0.7, 1680));
  const dlouhy = points(run(12, 0.7, 2040));
  check(
    kratky !== null && dlouhy !== null && Math.abs(kratky - dlouhy) < 1e-9,
    "70 % limitu dá stejné body v krátkém i dlouhém dungeonu",
    `${kratky} vs ${dlouhy}`
  );

  check(
    (points(run(12, 0.6)) ?? 0) > (points(run(12, 0.8)) ?? 0),
    "rychlejší běh na stejném klíči dá víc"
  );
}

console.log("6. Výběr nejlepšího běhu (scénář ze zadání)");
{
  // Tým běží +8 (stihne, ale nebodovaný), vytáhne klíč na +11 (stihne),
  // pak zkusí +14 a nestihne ho. Počítá se pořád +11.
  const behy = [run(8, 0.6), run(11, 0.75), run(14, 1.15)];
  const ohodnocene = scoreRuns(behy, cfg);
  const nej = bestRun(ohodnocene);

  check(nej !== null, "něco se boduje");
  check(nej?.run.keyLevel === 11, "nejlepší je +11", String(nej?.run.keyLevel));
  check(
    ohodnocene.filter((e) => e.score.scored).length === 1,
    "boduje se jediný běh z trojice"
  );

  // Když pak +14 doběhnou, přebije to.
  const pozdeji = scoreRuns([...behy, run(14, 0.9)], cfg);
  check(bestRun(pozdeji)?.run.keyLevel === 14, "úspěšný +14 se stane nejlepším");

  // Neúspěšný pokus nesmí tým připravit o dřív dosažené skóre.
  const poNeuspechu = scoreRuns([run(11, 0.75), run(16, 1.5)], cfg);
  check(bestRun(poNeuspechu)?.run.keyLevel === 11, "neúspěch nepřepíše dřívější výsledek");

  check(bestRun(scoreRuns([run(8, 0.5), run(9, 0.5)], cfg)) === null,
    "samé nebodované běhy = žádný výsledek");
  check(bestRun([]) === null, "prázdný seznam nespadne");

  // Při shodě bodů vyhrává dřívější běh.
  const shoda = scoreRuns([run(12, 0.8), run(12, 0.8)], cfg);
  check(bestRun(shoda) === shoda[0], "při shodě vyhrává dřívější");
}

console.log("7. Nastavení bodování");
{
  check(parseScoringConfig({}).minScoredKeyLevel === 10, "prázdné nastavení = výchozí");
  check(parseScoringConfig(null).pointsPerKeyLevel === 100, "null = výchozí");
  check(
    parseScoringConfig({ minScoredKeyLevel: 2 }).minScoredKeyLevel === 2,
    "hranice jde přenastavit"
  );

  const zkus = (raw: unknown) => {
    try {
      parseScoringConfig(raw);
      return null;
    } catch (err) {
      return err instanceof ScoringConfigError ? err.message : "jiná chyba";
    }
  };

  check(zkus({ pointsPerKeyLevel: 50 }) !== null,
    "50 bodů za úroveň se odmítne (čas by přebil klíč)");
  check(zkus({ minScoredKeyLevel: 1 }) !== null, "hranice pod 2 se odmítne");
  check(zkus({ minScoredKeyLevel: 10.5 }) !== null, "desetinná hranice se odmítne");
  check(zkus({ pointsPerKeyLevel: 100 }) === null, "přesně 100 projde");

  // S hranicí 2 se boduje i +2 a nesmí vyjít záporně.
  const nizka = parseScoringConfig({ minScoredKeyLevel: 2 });
  const s = scoreRun(run(2, 0.6), nizka);
  check(s.scored && s.points >= 0, "s hranicí 2 dá +2 nezáporné skóre",
    s.scored ? String(s.points) : "nebodováno");
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
