/**
 * Kontrola hledání společných termínů.
 *
 *   npm run check:availability
 */

import { findOverlaps, mergeSlots, type MemberSlots } from "../src/lib/availability";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

/** "2026-09-01 18:00" -> Date, ať jsou testy čitelné. */
function t(value: string) {
  return new Date(`2026-09-0${value}:00`);
}

function member(id: string, ...ranges: [string, string][]): MemberSlots {
  return {
    characterId: id,
    characterName: `Postava ${id}`,
    slots: ranges.map(([start, end]) => ({ start: t(start), end: t(end) })),
  };
}

function fmt(d: Date) {
  return d.toISOString().slice(5, 16);
}

console.log("1. Slučování vlastních úseků");
{
  const merged = mergeSlots([
    { start: t("1T18"), end: t("1T20") },
    { start: t("1T19"), end: t("1T22") },
    { start: t("1T22"), end: t("1T23") },
  ]);
  check(merged.length === 1, "překrývající se i navazující úseky se spojí", `${merged.length}`);
  check(
    merged[0].start.getTime() === t("1T18").getTime() &&
      merged[0].end.getTime() === t("1T23").getTime(),
    "spojený úsek 18-23",
    merged.map((m) => `${fmt(m.start)}-${fmt(m.end)}`).join(",")
  );

  const nonsense = mergeSlots([{ start: t("1T20"), end: t("1T18") }]);
  check(nonsense.length === 0, "úsek s koncem před začátkem se zahodí");
}

console.log("2. Průnik celého týmu");
{
  const members = [
    member("a", ["1T18", "1T22"]),
    member("b", ["1T19", "1T23"]),
    member("c", ["1T20", "1T21"]),
    member("d", ["1T17", "1T23"]),
    member("e", ["1T20", "1T22"]),
  ];

  const all = findOverlaps(members, 5);
  check(all.length === 1, "všech 5 je volných v jednom úseku", `${all.length}`);
  check(
    all[0].start.getTime() === t("1T20").getTime() &&
      all[0].end.getTime() === t("1T21").getTime(),
    "průnik je 20-21",
    all[0] ? `${fmt(all[0].start)}-${fmt(all[0].end)}` : "-"
  );
  check(all[0].characterIds.length === 5, "průnik obsahuje všech 5 lidí");
}

console.log("3. Částečný průnik (aspoň 4 lidi)");
{
  const members = [
    member("a", ["1T18", "1T22"]),
    member("b", ["1T19", "1T23"]),
    member("c", ["1T20", "1T21"]),
    member("d", ["1T17", "1T23"]),
    member("e", ["1T20", "1T22"]),
  ];

  const four = findOverlaps(members, 4);
  check(four.length >= 1, "najde se úsek pro 4+ lidí", `${four.length}`);
  check(
    four.every((slot) => slot.characterIds.length >= 4),
    "všechny vrácené úseky mají aspoň 4 lidi"
  );
  check(
    four.some((slot) => slot.characterIds.length === 5),
    "mezi nimi je i ten s pěti"
  );
}

console.log("4. Bez překryvu");
{
  const members = [member("a", ["1T18", "1T19"]), member("b", ["1T20", "1T21"])];
  check(findOverlaps(members, 2).length === 0, "nesouvisející časy nedají průnik");
  check(findOverlaps([], 5).length === 0, "prázdný vstup nespadne");
  check(findOverlaps([member("a")], 1).length === 0, "člen bez zadaných časů");
}

console.log("5. Dotýkající se úseky nejsou průnik");
{
  // a končí v 20:00, b v 20:00 začíná - spolu volní nejsou.
  const members = [member("a", ["1T18", "1T20"]), member("b", ["1T20", "1T22"])];
  check(findOverlaps(members, 2).length === 0, "konec == začátek nedá průnik");
}

console.log("6. Duplicitní zadání jednoho člověka nenafoukne počet");
{
  // Jeden člověk si zadá dvakrát ten samý čas - pořád je to jeden člověk.
  const members = [member("a", ["1T18", "1T22"], ["1T18", "1T22"])];
  check(findOverlaps(members, 2).length === 0, "dvě zadání jednoho člověka nejsou dva lidi");
  check(findOverlaps(members, 1).length === 1, "ale jako jeden člověk se počítá");
}

console.log("7. Minimální délka termínu");
{
  const members = [member("a", ["1T18", "1T22"]), member("b", ["1T20", "1T21"])];
  check(findOverlaps(members, 2, { minDurationMinutes: 30 }).length === 1, "hodinový průnik projde");
  check(
    findOverlaps(members, 2, { minDurationMinutes: 120 }).length === 0,
    "hodinový průnik neprojde požadavkem na 2 hodiny"
  );
}

console.log("8. Spojování sousedních úseků se stejnými lidmi");
{
  // a má dva navazující bloky, b jeden dlouhý - výsledek má být jeden úsek.
  const members = [
    member("a", ["1T18", "1T20"], ["1T20", "1T22"]),
    member("b", ["1T18", "1T22"]),
  ];
  const overlaps = findOverlaps(members, 2);
  check(overlaps.length === 1, "nerozpadne se na dva řádky", `${overlaps.length}`);
  check(
    overlaps[0].end.getTime() - overlaps[0].start.getTime() === 4 * 3600_000,
    "spojený úsek trvá 4 hodiny"
  );
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
