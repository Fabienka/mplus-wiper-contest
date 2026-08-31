/**
 * Kontrola souhrnů o složení pole.
 *
 *   npm run check:stats
 */

import { computePoolStats, type StatsPlayer } from "../src/lib/stats";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const p = (
  className: string | null,
  wowSpec: string | null,
  specRole: StatsPlayer["specRole"],
  rioScore: number | null = 2000
): StatsPlayer => ({ className, wowSpec, specRole, rioScore });

console.log("1. Rozdělení podle rolí a nejčastější specy");
{
  const players = [
    p("Druid", "Guardian", "TANK"),
    p("Druid", "Guardian", "TANK"),
    p("Warrior", "Protection", "TANK"),
    p("Paladin", "Holy", "HEALER"),
    p("Mage", "Frost", "DPS"),
    p("Mage", "Frost", "DPS"),
    p("Mage", "Frost", "DPS"),
    p("Rogue", "Subtlety", "DPS"),
  ];
  const s = computePoolStats(players);

  check(s.total === 8, "celkem 8 hráčů", String(s.total));
  check(s.byRole.TANK === 3, "3 tanci", String(s.byRole.TANK));
  check(s.byRole.HEALER === 1, "1 healer", String(s.byRole.HEALER));
  check(s.byRole.DPS === 4, "4 DPS", String(s.byRole.DPS));

  check(s.topSpecs.TANK[0]?.specName === "Guardian", "nejčastější tank je Guardian");
  check(s.topSpecs.TANK[0]?.count === 2, "a je dvakrát");
  check(s.topSpecs.DPS[0]?.specName === "Frost", "nejčastější DPS je Frost Mage");
  check(s.topSpecs.DPS[0]?.count === 3, "a je třikrát");
  check(s.topSpecs.HEALER.length === 1, "healer je jen jeden druh");

  check(s.classCounts[0]?.className === "Mage", "nejčastější class je Mage");
  check(s.classCounts[0]?.count === 3, "třikrát", String(s.classCounts[0]?.count));
}

console.log("2. Melee/ranged a schopnosti");
{
  const players = [
    p("Druid", "Guardian", "TANK"), // melee, brez
    p("Mage", "Frost", "DPS"), // ranged, lust
    p("Shaman", "Elemental", "DPS"), // ranged, lust
    p("Rogue", "Subtlety", "DPS"), // melee, nic
    p("Warlock", "Affliction", "DPS"), // ranged, brez
  ];
  const s = computePoolStats(players);

  check(s.range.melee === 2, "2 melee", String(s.range.melee));
  check(s.range.ranged === 3, "3 ranged", String(s.range.ranged));
  check(s.range.unknown === 0, "nikdo neznámý");
  check(s.coverage.battleRez === 2, "2× battle rez", String(s.coverage.battleRez));
  check(s.coverage.bloodlust === 2, "2× bloodlust", String(s.coverage.bloodlust));
}

console.log("3. Neznámé specy nesmí rozbít součty");
{
  const players = [
    p("Mage", "Frost", "DPS"),
    p("Mage", null, "DPS"),
    p("Neexistující", "Class", "DPS"),
    p(null, null, "TANK"),
  ];
  const s = computePoolStats(players);

  check(s.total === 4, "počítají se všichni", String(s.total));
  check(s.range.unknown === 3, "3 neznámé", String(s.range.unknown));
  check(s.range.melee + s.range.ranged + s.range.unknown === 4, "součet sedí");
  check(
    s.topSpecs.DPS.length === 1,
    "mezi specy se dostane jen rozpoznaný",
    String(s.topSpecs.DPS.length)
  );
  // Class se počítá i bez rozpoznaného specu - v přihlášce ji máme z Raider.io.
  check(
    s.classCounts.find((c) => c.className === "Mage")?.count === 2,
    "Mage se počítá dvakrát i s nevyplněným specem"
  );
}

console.log("4. Role se bere ze specu, ne z přihlášky");
{
  // Hráč přihlášený jako DPS, ale se specem Guardian (tank).
  const s = computePoolStats([p("Druid", "Guardian", "DPS")]);
  check(s.byRole.DPS === 1, "v rozdělení rolí se drží přihláška");
  check(
    s.topSpecs.TANK[0]?.specName === "Guardian",
    "ale mezi specy spadne pod tanka",
    JSON.stringify(s.topSpecs)
  );
  check(s.topSpecs.DPS.length === 0, "a mezi DPS specy není");
}

console.log("5. RIO");
{
  const s = computePoolStats([
    p("Mage", "Frost", "DPS", 1000),
    p("Mage", "Fire", "DPS", 2000),
    p("Mage", "Arcane", "DPS", 3000),
  ]);
  check(s.rio?.highest === 3000, "nejvyšší 3000", String(s.rio?.highest));
  check(s.rio?.lowest === 1000, "nejnižší 1000", String(s.rio?.lowest));
  check(s.rio?.average === 2000, "průměr 2000", String(s.rio?.average));

  const bezRio = computePoolStats([p("Mage", "Frost", "DPS", null)]);
  check(bezRio.rio === null, "bez vyplněného RIO se nic nepočítá");

  // Chybějící RIO nesmí stáhnout průměr na nulu.
  const castecne = computePoolStats([
    p("Mage", "Frost", "DPS", 2000),
    p("Mage", "Fire", "DPS", null),
  ]);
  check(castecne.rio?.average === 2000, "průměr počítá jen z vyplněných",
    String(castecne.rio?.average));
}

console.log("6. Prázdný vstup");
{
  const s = computePoolStats([]);
  check(s.total === 0, "nula hráčů");
  check(s.rio === null, "žádné RIO");
  check(s.classCounts.length === 0, "žádné classy");
  check(s.topSpecs.TANK.length === 0, "žádné specy");
  check(s.byRole.TANK === 0 && s.byRole.HEALER === 0 && s.byRole.DPS === 0, "role na nule");
}

console.log("7. Stabilní pořadí při shodě");
{
  const s = computePoolStats([
    p("Warrior", "Arms", "DPS"),
    p("Mage", "Frost", "DPS"),
    p("Rogue", "Outlaw", "DPS"),
  ]);
  // Všechny po jedné - musí se seřadit abecedně, ne náhodně.
  check(
    s.classCounts.map((c) => c.className).join(",") === "Mage,Rogue,Warrior",
    "při shodě počtu rozhoduje abeceda",
    s.classCounts.map((c) => c.className).join(",")
  );
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
