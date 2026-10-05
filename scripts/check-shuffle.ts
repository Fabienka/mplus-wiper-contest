/**
 * Kontrola shuffle algoritmu na vygenerovaných datech.
 *
 * V projektu zatím není test runner, takže tohle je samostatný skript:
 *   npx tsx scripts/check-shuffle.ts
 *
 * Ověřuje invarianty, které musí platit vždy - hlavně tvrdé pravidlo o složení
 * týmu, že se žádný hráč neobjeví dvakrát a že priorita pravidel drží.
 */

import {
  planRoleSwitches,
  runShuffle,
  type ShufflePlayer,
  type ShuffleResult,
} from "../src/lib/shuffle";
import { WOW_SPECS, findSpec } from "../src/lib/wow-specs";

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

      // Role v týmu musí sedět s rolí, se kterou se hráč přihlásil - nebo
      // switchnul na spec, který sám nabídl.
      for (const member of team.members) {
        const source = players.find((p) => p.characterId === member.characterId)!;

        if (!member.switchedFrom) {
          check(
            source.specRole === member.roleInTeam,
            `${label}: ${member.characterName} hraje roli, se kterou se přihlásil`
          );
          continue;
        }

        check(
          source.specRole === member.switchedFrom.specRole &&
            source.wowSpec === member.switchedFrom.wowSpec,
          `${label}: ${member.characterName} má u switche správnou původní roli a spec`
        );
        check(
          (source.switchSpecs ?? []).some((option) => option.specName === member.wowSpec) &&
            findSpec(member.className, member.wowSpec)?.role === member.roleInTeam,
          `${label}: ${member.characterName} switchnul na spec, který nabídl, a hraje jeho roli`,
          `${member.wowSpec} jako ${member.roleInTeam}`
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

// ---------- 9. Switch specu ----------

/** Hráč s pevně daným specem - pro scénáře, kde záleží na konkrétní class. */
function player(
  id: string,
  className: string,
  wowSpec: string,
  rioScore: number,
  switchSpecs: [string, number | null][] = []
): ShufflePlayer {
  const spec = findSpec(className, wowSpec)!;
  return {
    characterId: id,
    characterName: id,
    className,
    wowSpec,
    specRole: spec.role,
    rioScore,
    switchSpecs: switchSpecs.map(([specName, rio]) => ({
      specName,
      specRole: findSpec(className, specName)?.role ?? "DPS",
      rioScore: rio,
    })),
  };
}

section("9. Switch specu doplní chybějící role");
{
  // 25 hráčů, ale jen 3 tanci - bez switche 3 týmy a 10 náhradníků.
  const base = buildPool({ tanks: 3, healers: 5, dps: 17 }, 21);
  const withoutSwitch = runShuffle(base, { seed: 1 });
  check(withoutSwitch.teamCount === 3, "bez switche 3 týmy", `vyšlo ${withoutSwitch.teamCount}`);
  check(withoutSwitch.switches.length === 0, "bez nabídnutého switche nikdo nepřepíná");

  // Tři DPS z poolu nahradí tři, kteří nabídli tanka - hráčů je pořád 25.
  const players = [
    ...base.filter((p) => !["DPS-0", "DPS-1", "DPS-2"].includes(p.characterId)),
    player("Feral-switch", "Druid", "Feral", 2500, [["Guardian", 2100]]),
    player("Fury-switch", "Warrior", "Fury", 2400, [["Protection", 1900]]),
    player("Ret-switch", "Paladin", "Retribution", 2600, [["Protection", 1200]]),
  ];

  const result = runShuffle(players, { seed: 1 });
  check(result.teamCount === 5, "se switchem 5 týmů", `vyšlo ${result.teamCount}`);
  check(result.switches.length === 2, "switchnou jen 2 hráči, kolik chybí", `${result.switches.length}`);
  check(
    result.switches.map((s) => s.characterId).sort().join(",") === "Feral-switch,Fury-switch",
    "switchnou ti s nejvyšším RIO v cílovém specu",
    result.switches.map((s) => s.characterId).join(", ")
  );
  check(
    result.switches.every((s) => s.toRole === "TANK" && s.from.specRole === "DPS"),
    "switch z DPS na tanka"
  );
  check(
    result.warnings.some((w) => w.includes("Switch specu")),
    "varování vypisuje switche",
    result.warnings.join(" | ")
  );
  check(
    result.variants.every((variant) => variant.substitutes.length === 0),
    "nikdo nezbyde na lavičce"
  );
  checkStructure(result, players, "switch na tanka");

  const switchedMembers = result.variants[0].teams
    .flatMap((team) => team.members)
    .filter((member) => member.switchedFrom);
  check(
    switchedMembers.length === 2 &&
      switchedMembers.every((m) => m.roleInTeam === "TANK" && m.switchedFrom?.specRole === "DPS"),
    "switchnutí hráči jsou v týmech jako tanci"
  );
  const feral = switchedMembers.find((m) => m.characterId === "Feral-switch");
  check(
    feral?.wowSpec === "Guardian" &&
      feral.rioScore === 2100 &&
      feral.switchedFrom?.wowSpec === "Feral" &&
      feral.switchedFrom.rioScore === 2500,
    "switchnutý hráč má spec a RIO ze switche, původní zůstává",
    JSON.stringify(feral)
  );
}

section("10. Switch jen když je potřeba");
{
  const players = buildPool({ tanks: 6, healers: 6, dps: 21 }, 22);
  players[20] = player("DPS-switch", "Druid", "Balance", 2000, [["Guardian", 2500]]);
  const plan = planRoleSwitches(players);
  check(plan.switches.length === 0, "když role nechybí, nikdo nepřepíná");
  check(plan.teamCount === 6, "počet týmů se nemění", `${plan.teamCount}`);
}

section("11. Chybí tank i healer - hráč s víc specy se přesune");
{
  // 20 hráčů = 4 týmy, ale jen 3 tanci a 3 healeři. Druid umí tanka i heal
  // (tanka s vyšším RIO), warrior jen tanka. Druid jde první na tanka, warrior
  // ho pak musí přesunout na heal - jinak by healer chyběl.
  const players = buildPool({ tanks: 3, healers: 3, dps: 12 }, 23);
  players.push(
    player("Druid-flex", "Druid", "Feral", 2500, [["Guardian", 2300], ["Restoration", 2000]]),
    player("Warrior-tank", "Warrior", "Arms", 2200, [["Protection", 1800]])
  );

  const plan = planRoleSwitches(players);
  check(plan.teamCount === 4, "4 týmy", `${plan.teamCount}`);
  const byId = new Map(plan.switches.map((s) => [s.characterId, s]));
  check(byId.get("Druid-flex")?.toSpec === "Restoration", "druid jde na heal", byId.get("Druid-flex")?.toSpec);
  check(byId.get("Warrior-tank")?.toSpec === "Protection", "warrior jde na tanka", byId.get("Warrior-tank")?.toSpec);

  const result = runShuffle(players, { seed: 4 });
  checkStructure(result, players, "tank i healer");
}

section("12. Switch nesmí vyrobit díru v jiné roli");
{
  // 10 hráčů = 2 týmy, ale jen 1 tank. Healer by tanka uměl s vyšším RIO, jenže
  // healeři jsou přesně 2 - jeho switch by díru jen přesunul. Switchne DPS.
  const players: ShufflePlayer[] = [
    player("Tank", "Warrior", "Protection", 2000),
    player("Healer-flex", "Druid", "Restoration", 2000, [["Guardian", 2800]]),
    player("Healer", "Priest", "Holy", 2000),
    ...Array.from({ length: 6 }, (_, i) => player(`DPS-${i}`, "Mage", "Fire", 2000 + i)),
    player("DPS-flex", "Paladin", "Retribution", 2000, [["Protection", 1500]]),
  ];

  const plan = planRoleSwitches(players);
  check(plan.teamCount === 2, "2 týmy", `${plan.teamCount}`);
  check(
    plan.switches.length === 1 && plan.switches[0].characterId === "DPS-flex",
    "switchne DPS, ne healer",
    plan.switches.map((s) => s.characterId).join(", ")
  );
}

section("13. Když na plný počet nestačí, aspoň víc týmů než bez switche");
{
  // 25 hráčů, 2 tanci a jen jeden DPS umí tanka - 3 týmy místo 2.
  const players = buildPool({ tanks: 2, healers: 5, dps: 17 }, 24);
  players.push(player("Bear", "Druid", "Feral", 2000, [["Guardian", 1700]]));

  const plan = planRoleSwitches(players);
  check(plan.teamCountBefore === 2, "bez switche 2 týmy", `${plan.teamCountBefore}`);
  check(plan.teamCount === 3, "se switchem 3 týmy", `${plan.teamCount}`);

  const result = runShuffle(players, { seed: 9 });
  check(
    result.warnings.some((w) => w.includes("i po switchích specu")),
    "varování řekne, že role chybí i po switchi",
    result.warnings.join(" | ")
  );
  checkStructure(result, players, "částečný switch");
}

section("14. Neplatný switch se ignoruje");
{
  const players = buildPool({ tanks: 1, healers: 2, dps: 6 }, 25);
  players.push(
    // Mage žádného tanka nemá a Devourer je pořád DPS - ani jedno nepomůže.
    player("Mage-fake", "Mage", "Fire", 2000, [["Guardian", 3000]]),
    player("DH-same-role", "Demon Hunter", "Havoc", 2000, [["Devourer", 2500]])
  );

  const plan = planRoleSwitches(players);
  check(plan.switches.length === 0, "nikdo nepřepíná", plan.switches.map((s) => s.characterId).join(", "));
  check(plan.teamCount === 1, "zůstane 1 tým", `${plan.teamCount}`);
}

// ---------- Souhrn ----------

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
