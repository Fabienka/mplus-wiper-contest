/**
 * Kontrola tabulky speců a čtení RIO po specech z Raider.io.
 *
 *   npm run check:wow-specs
 *
 * Raider.io vrací RIO po specech jako spec_0 až spec_3 v pořadí, v jakém je
 * má classa ve hře. Data ve 3. části jsou opsaná z opravdových odpovědí API
 * (září 2026) - kdyby někdo v tabulce specy přeřadil podle abecedy, RIO by se
 * přiřadilo jinému specu a tahle kontrola to chytí.
 */

import { WOW_CLASSES, findSpec, specsForClass, switchableSpecs } from "../src/lib/wow-specs";
import { fetchSpecScores } from "../src/lib/raiderio";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

/** Pořadí speců ve hře (= indexy spec_N na Raider.io). */
const GAME_ORDER: Record<string, string[]> = {
  "Death Knight": ["Blood", "Frost", "Unholy"],
  "Demon Hunter": ["Havoc", "Vengeance", "Devourer"],
  Druid: ["Balance", "Feral", "Guardian", "Restoration"],
  Evoker: ["Devastation", "Preservation", "Augmentation"],
  Hunter: ["Beast Mastery", "Marksmanship", "Survival"],
  Mage: ["Arcane", "Fire", "Frost"],
  Monk: ["Brewmaster", "Mistweaver", "Windwalker"],
  Paladin: ["Holy", "Protection", "Retribution"],
  Priest: ["Discipline", "Holy", "Shadow"],
  Rogue: ["Assassination", "Outlaw", "Subtlety"],
  Shaman: ["Elemental", "Enhancement", "Restoration"],
  Warlock: ["Affliction", "Demonology", "Destruction"],
  Warrior: ["Arms", "Fury", "Protection"],
};

console.log("1. Tabulka speců");
{
  const devourer = findSpec("Demon Hunter", "Devourer");
  check(devourer !== null, "Demon Hunter má spec Devourer");
  check(
    devourer?.role === "DPS" && devourer.range === "RANGED",
    "Devourer je ranged DPS",
    `${devourer?.role} / ${devourer?.range}`
  );

  check(
    WOW_CLASSES.length === Object.keys(GAME_ORDER).length,
    "každá classa má v kontrole pořadí",
    WOW_CLASSES.filter((c) => !GAME_ORDER[c]).join(", ")
  );

  for (const [className, order] of Object.entries(GAME_ORDER)) {
    const actual = specsForClass(className).map((spec) => spec.specName);
    check(
      actual.join("|") === order.join("|"),
      `${className} má specy v pořadí jako ve hře`,
      `${actual.join(", ")} místo ${order.join(", ")}`
    );
    check(actual.length <= 4, `${className} má nejvýš 4 specy (Raider.io zná spec_0 až spec_3)`);
  }
}

console.log("2. Specy na switch");
{
  const druid = switchableSpecs("Druid", "Feral").map((spec) => spec.specName);
  check(druid.join("|") === "Balance|Guardian|Restoration", "hlavní spec se nenabízí", druid.join(", "));

  const unknownMain = switchableSpecs("Demon Hunter", null).map((spec) => spec.specName);
  check(unknownMain.length === 3, "bez hlavního specu se nabídnou všechny specy classy", unknownMain.join(", "));

  check(switchableSpecs(null, "Frost").length === 0, "bez classy se nenabízí nic");
  check(
    switchableSpecs("mage", " frost ").every((spec) => spec.specName !== "Frost"),
    "na velikosti písmen a mezerách nezáleží"
  );
}

console.log("3. RIO po specech z Raider.io");

async function scoresFor(className: string, scores: Record<string, number>) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        class: className,
        mythic_plus_scores_by_season: [{ season: "season-mn-1", scores }],
      })
    )) as typeof fetch;

  try {
    return await fetchSpecScores("https://raider.io/characters/eu/tarren-mill/Priklad");
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function main() {
  // Monk s RIO ve všech třech specech - tank, healer i DPS skóre sedí
  // na spec_0, spec_1 a spec_2.
  const monk = await scoresFor("Monk", {
    all: 1693.8,
    dps: 656.2,
    healer: 1018.5,
    tank: 1345.3,
    spec_0: 1345.3,
    spec_1: 1018.5,
    spec_2: 656.2,
    spec_3: 0,
  });
  check(monk.Brewmaster === 1345.3, "Monk Brewmaster = spec_0", String(monk.Brewmaster));
  check(monk.Mistweaver === 1018.5, "Monk Mistweaver = spec_1", String(monk.Mistweaver));
  check(monk.Windwalker === 656.2, "Monk Windwalker = spec_2", String(monk.Windwalker));

  // Demon Hunter s Havocem a Devourerem.
  const dh = await scoresFor("Demon Hunter", {
    all: 3813.8,
    dps: 3813.8,
    healer: 0,
    tank: 0,
    spec_0: 3247.8,
    spec_1: 0,
    spec_2: 3044.9,
    spec_3: 0,
  });
  check(dh.Havoc === 3247.8, "DH Havoc = spec_0", String(dh.Havoc));
  check(dh.Vengeance === 0, "DH Vengeance = spec_1", String(dh.Vengeance));
  check(dh.Devourer === 3044.9, "DH Devourer = spec_2", String(dh.Devourer));

  const empty = await scoresFor("Druid", {});
  check(
    Object.values(empty).length === 4 && Object.values(empty).every((score) => score === 0),
    "chybějící skóre je 0",
    JSON.stringify(empty)
  );

  if (failures > 0) {
    console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
    process.exit(1);
  }

  console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
}

main();
