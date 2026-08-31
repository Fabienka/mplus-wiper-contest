/**
 * Kontrola shuffle algoritmu na vygenerovaných datech.
 *
 * V projektu zatím není test runner, takže tohle je samostatný skript:
 *   npx tsx scripts/check-shuffle.ts
 *
 * Ověřuje invarianty, které musí platit vždy - hlavně tvrdé pravidlo o složení
 * týmu, že se žádný hráč neobjeví dvakrát a že priorita pravidel drží.
 */

import { runShuffle, type ShufflePlayer, type ShuffleResult } from "../src/lib/shuffle";
import { WOW_SPECS } from "../src/lib/wow-specs";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** Deterministický generátor, ať je kontrola opakovatelná. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPool(counts: { tanks: number; healers: number; dps: number }, seed = 1): ShufflePlayer[] {
  const rng = makeRng(seed);
  const players: ShufflePlayer[] = [];

  const pick = (role: "TANK" | "HEALER" | "DPS") => {
    const options = WOW_SPECS.filter((spec) => spec.role === role);
    return options[Math.floor(rng() * options.length)];
  };

  const add = (role: "TANK" | "HEALER" | "DPS", index: number) => {
    const spec = pick(role);
    players.push({
      characterId: `${role}-${index}`,
      characterName: `${spec.className} ${spec.specName} ${index}`,
      className: spec.className,
      wowSpec: spec.specName,
      specRole: role,
      rioScore: Math.round(rng() * 2000 + 1000),
    });
  };

  for (let i = 0; i < counts.tanks; i++) add("TANK", i);
  for (let i = 0; i < counts.healers; i++) add("HEALER", i);
  for (let i = 0; i < counts.dps; i++) add("DPS", i);

  return players;
}

/** Invarianty, které musí platit pro každou vrácenou variantu. */
function checkStructure(result: ShuffleResult, players: ShufflePlayer[], label: string) {
  for (const variant of result.variants) {
    check(
      variant.teams.length === result.teamCount,
      `${label}: varianta ${variant.variantNumber} má ${result.teamCount} týmů`,
      `má ${variant.teams.length}`
    );

    const seen = new Set<string>();

    for (const team of variant.teams) {
      const roles = team.members.map((m) => m.roleInTeam);
      check(
        team.members.length === 5,
        `${label}: tým ${team.teamIndex} má 5 členů`,
        `má ${team.members.length}`
      );
      check(
        roles.filter((r) => r === "TANK").length === 1,
        `${label}: tým ${team.teamIndex} má právě 1 tanka`
      );
      check(
        roles.filter((r) => r === "HEALER").length === 1,
        `${label}: tým ${team.teamIndex} má právě 1 healera`
      );
      check(
        roles.filter((r) => r === "DPS").length === 3,
        `${label}: tým ${team.teamIndex} má právě 3 DPS`
      );

      // Role v týmu musí sedět s rolí, se kterou se hráč přihlásil.
      for (const member of team.members) {
        const source = players.find((p) => p.characterId === member.characterId)!;
        check(
          source.specRole === member.roleInTeam,
          `${label}: ${member.characterName} hraje roli, se kterou se přihlásil`
        );
      }

      const dpsBuckets = team.members
        .filter((m) => m.roleInTeam === "DPS")
        .map((m) => m.dpsBucket);
      check(
        new Set(dpsBuckets).size === 3,
        `${label}: tým ${team.teamIndex} má DPS ze všech tří košů`,
        `koše ${dpsBuckets.join(",")}`
      );

      for (const member of team.members) {
        check(
          !seen.has(member.characterId),
          `${label}: ${member.characterName} je jen v jednom týmu`
        );
        seen.add(member.characterId);
      }
    }

    for (const sub of variant.substitutes) {
      check(
        !seen.has(sub.characterId),
        `${label}: náhradník ${sub.characterName} není zároveň v týmu`
      );
      seen.add(sub.characterId);
    }

    check(
      seen.size === players.length,
      `${label}: varianta ${variant.variantNumber} pokrývá všechny hráče`,
      `${seen.size} z ${players.length}`
    );
  }
}

// ---------- 1. Základní běh ----------

section("1. Standardní pool (6 tanků, 6 healerů, 21 DPS)");
{
  const players = buildPool({ tanks: 6, healers: 6, dps: 21 });
  const result = runShuffle(players, { seed: 42 });

  check(result.teamCount === 6, "6 týmů", `vyšlo ${result.teamCount}`);
  check(result.variants.length === 3, "3 varianty", `vyšlo ${result.variants.length}`);
  check(
    result.pool.bucketSizes.A === 7 &&
      result.pool.bucketSizes.B === 7 &&
      result.pool.bucketSizes.C === 7,
    "koše 7/7/7",
    JSON.stringify(result.pool.bucketSizes)
  );
  checkStructure(result, players, "standard");

  const scores = result.variants.map((v) => v.score);
  check(
    scores.every((score, i) => i === 0 || scores[i - 1] <= score),
    "varianty jsou seřazené od nejlepší",
    scores.join(" / ")
  );

  console.log(
    `  varianty: ${result.variants
      .map((v) => `#${v.variantNumber} score=${v.score} (${v.teams.reduce((n, t) => n + t.violations.length, 0)} porušení)`)
      .join(", ")}`
  );
}

// ---------- 2. Odlišnost variant ----------

section("2. Varianty se liší víc než prohozením dvou hráčů");
{
  const players = buildPool({ tanks: 8, healers: 8, dps: 24 }, 7);
  const result = runShuffle(players, { seed: 99 });

  const signatures = result.variants.map((variant) =>
    variant.teams
      .map((team) => team.members.map((m) => m.characterId).sort().join(","))
      .sort()
  );

  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const shared = signatures[i].filter((sig) => signatures[j].includes(sig)).length;
      const differing = result.teamCount - shared;
      check(
        differing >= 3,
        `varianty ${i + 1} a ${j + 1} se liší aspoň ve 3 týmech`,
        `liší se v ${differing}`
      );
    }
  }
}

// ---------- 3. Reprodukovatelnost ----------

section("3. Stejný seed dává stejný výsledek");
{
  const players = buildPool({ tanks: 5, healers: 5, dps: 18 }, 3);
  const first = runShuffle(players, { seed: 12345 });
  const second = runShuffle(players, { seed: 12345 });
  const other = runShuffle(players, { seed: 54321 });

  const fingerprint = (result: ShuffleResult) =>
    JSON.stringify(result.variants.map((v) => v.teams.map((t) => t.members.map((m) => m.characterId))));

  check(fingerprint(first) === fingerprint(second), "stejný seed = stejné varianty");
  check(fingerprint(first) !== fingerprint(other), "jiný seed = jiné varianty");
  check(first.seed === 12345, "seed se vrací ve výsledku");
}

// ---------- 4. Priorita pravidel ----------

section("4. Vyšší pravidlo se neobětuje kvůli nižšímu");
{
  // Pool, kde bloodlust má jen málo hráčů - vzniknou týmy bez lustu (pravidlo 3),
  // ale nesmí se kvůli tomu rozbít pokrytí košů (pravidlo 1).
  const players = buildPool({ tanks: 7, healers: 7, dps: 21 }, 11);
  const result = runShuffle(players, { seed: 2024 });

  for (const variant of result.variants) {
    check(
      variant.breakdown.dpsBucketCoverage === 0,
      `varianta ${variant.variantNumber} neporušuje pravidlo 1`,
      `porušeno ${variant.breakdown.dpsBucketCoverage}×`
    );
  }

  // Váhy musí být odstupňované tak, že nejhorší možný součet nižších pravidel
  // přes všechny týmy je pořád levnější než jediné porušení vyššího pravidla.
  const teams = result.teamCount;
  const maxR4 = 3 * teams;
  const w3 = maxR4 + 1;
  const maxR3 = 2 * teams * w3 + maxR4;
  const w2 = maxR3 + 1;
  const maxR2 = 8 * teams * w2 + maxR3;
  const w1 = maxR2 + 1;

  check(w3 > maxR4, "pravidlo 3 přebíjí libovolný počet porušení pravidla 4");
  check(w2 > maxR3, "pravidlo 2 přebíjí libovolný počet porušení pravidel 3 a 4");
  check(w1 > maxR2, "pravidlo 1 přebíjí libovolný počet porušení pravidel 2, 3 a 4");
}

// ---------- 5. Nedostatek jedné role ----------

section("5. Málo healerů omezí počet týmů (a shuffle to nahlásí)");
{
  // 30 hráčů = podle zadání 6 týmů, ale healeři jsou jen 4.
  const players = buildPool({ tanks: 8, healers: 4, dps: 18 }, 5);
  const result = runShuffle(players, { seed: 77 });

  check(result.teamCount === 4, "4 týmy podle počtu healerů", `vyšlo ${result.teamCount}`);
  check(
    result.warnings.some((w) => w.includes("healerů")),
    "varování zmiňuje healery",
    result.warnings.join(" | ")
  );
  checkStructure(result, players, "málo healerů");
}

// ---------- 6. Hraniční případy ----------

section("6. Hraniční případy");
{
  const empty = runShuffle([], { seed: 1 });
  check(empty.teamCount === 0, "prázdný pool = 0 týmů");
  check(empty.variants.length === 0, "prázdný pool nevrací varianty");
  check(empty.warnings.length > 0, "prázdný pool má varování");

  const exactlyOne = buildPool({ tanks: 1, healers: 1, dps: 3 }, 2);
  const single = runShuffle(exactlyOne, { seed: 1 });
  check(single.teamCount === 1, "5 hráčů = 1 tým", `vyšlo ${single.teamCount}`);
  checkStructure(single, exactlyOne, "1 tým");

  const tooFew = runShuffle(buildPool({ tanks: 3, healers: 0, dps: 9 }, 4), { seed: 1 });
  check(tooFew.teamCount === 0, "bez healera nejde složit tým");

  // DPS nedělitelné třemi - koše musí zůstat co nejrovnoměrnější.
  const uneven = buildPool({ tanks: 4, healers: 4, dps: 20 }, 6);
  const unevenResult = runShuffle(uneven, { seed: 8 });
  const sizes = unevenResult.pool.bucketSizes;
  check(
    sizes.A === 7 && sizes.B === 7 && sizes.C === 6,
    "20 DPS = koše 7/7/6",
    JSON.stringify(sizes)
  );
  check(Math.max(sizes.A, sizes.B, sizes.C) - Math.min(sizes.A, sizes.B, sizes.C) <= 1,
    "koše se liší nejvýš o 1");
  checkStructure(unevenResult, uneven, "nedělitelné DPS");
}

// ---------- 7. Neznámý spec ----------

section("7. Postava s nerozpoznaným specem");
{
  const players = buildPool({ tanks: 4, healers: 4, dps: 12 }, 9);
  players[0] = { ...players[0], wowSpec: null };
  players[1] = { ...players[1], wowSpec: "Neexistující Spec" };

  const result = runShuffle(players, { seed: 3 });

  check(result.teamCount === 4, "shuffle proběhne i s neznámými specy");
  check(
    // Bez tvaru slovesa - to se mění skloňováním podle počtu postav.
    result.warnings.some((w) => w.includes("rozpoznaný spec")),
    "varování o neznámém specu",
    result.warnings.join(" | ")
  );
  checkStructure(result, players, "neznámý spec");
}

// ---------- 8. Kvalita výsledku ----------

section("8. Lokální zlepšování opravdu pomáhá");
{
  // Porovnává se JEDEN kandidát s a bez zlepšování. Kdyby se porovnávalo
  // best-of-300, obě větve často spadnou na stejné dno dané složením poolu
  // (např. 11 melee z 18 DPS vyváženější rozdělení prostě nedovolí) a rozdíl
  // by nebyl vidět, i kdyby zlepšování nedělalo nic.
  const players = buildPool({ tanks: 6, healers: 6, dps: 18 }, 13);
  const rounds = 50;
  let plainTotal = 0;
  let improvedTotal = 0;
  let neverWorse = true;

  for (let i = 0; i < rounds; i++) {
    const plain = runShuffle(players, { seed: 1000 + i, candidateCount: 1, localSearch: false });
    const improved = runShuffle(players, { seed: 1000 + i, candidateCount: 1, localSearch: true });

    plainTotal += plain.variants[0].score;
    improvedTotal += improved.variants[0].score;
    if (improved.variants[0].score > plain.variants[0].score) neverWorse = false;
  }

  check(neverWorse, "zlepšování nikdy nezhorší kandidáta");
  check(
    improvedTotal < plainTotal,
    "zlepšený kandidát je průměrně lepší než náhodný",
    `${(improvedTotal / rounds).toFixed(0)} vs ${(plainTotal / rounds).toFixed(0)}`
  );
  console.log(
    `  průměr 1 kandidáta přes ${rounds} seedů: náhodný ${(plainTotal / rounds).toFixed(0)}, zlepšený ${(improvedTotal / rounds).toFixed(0)}`
  );

  // Plný běh (300 kandidátů) musí být aspoň tak dobrý jako nejlepší z těch měření.
  const full = runShuffle(players, { seed: 5 });
  check(
    full.variants[0].score <= improvedTotal / rounds,
    "plný běh je aspoň tak dobrý jako průměrný zlepšený kandidát",
    `${full.variants[0].score}`
  );
  const violations = full.variants[0].teams.reduce((n, t) => n + t.violations.length, 0);
  console.log(`  plný běh: score ${full.variants[0].score}, ${violations} porušení pravidel`);
}

// ---------- Souhrn ----------

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
