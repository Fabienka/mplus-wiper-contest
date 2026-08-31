/**
 * Kontrola žebříčku.
 *
 *   npm run check:leaderboard
 */

import {
  buildLeaderboard,
  type TeamEntry,
  type TeamResultEntry,
} from "../src/lib/leaderboard";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

let poradiBehu = 0;

/** Běh s danými body; čas doběhnutí roste v pořadí vytváření. */
function beh(points: number | null, isValid = true, den = ++poradiBehu): TeamResultEntry {
  return {
    matchId: `m${den}`,
    dungeonName: "The Blinding Vale",
    keyLevel: 12,
    clearTimeSeconds: 1240,
    points,
    isValid,
    completedAt: new Date(2026, 8, den),
  };
}

function tym(teamName: string, results: TeamResultEntry[]): TeamEntry {
  return { teamId: teamName.toLowerCase(), teamName, results };
}

console.log("1. Řadí se podle jediného nejlepšího běhu");
{
  const rows = buildLeaderboard([
    tym("Alfa", [beh(120), beh(340), beh(80)]),
    tym("Beta", [beh(300)]),
    tym("Gama", [beh(500), beh(10)]),
  ]);

  check(rows.map((r) => r.teamName).join(",") === "Gama,Alfa,Beta", "pořadí podle nejlepšího",
    rows.map((r) => `${r.teamName}:${r.best?.points}`).join(","));
  check(rows[0].best?.points === 500, "Gama má 500", String(rows[0].best?.points));
  check(rows[1].best?.points === 340, "Alfa 340 (ne součet)", String(rows[1].best?.points));
  check(rows.map((r) => r.rank).join(",") === "1,2,3", "pořadí 1,2,3",
    rows.map((r) => r.rank).join(","));
}

console.log("2. Součet se nepoužívá");
{
  // Alfa má v součtu 600, ale nejlepší jen 200. Beta má jediný běh za 250.
  const rows = buildLeaderboard([
    tym("Alfa", [beh(200), beh(200), beh(200)]),
    tym("Beta", [beh(250)]),
  ]);
  check(rows[0].teamName === "Beta", "vyhrává jediný lepší běh, ne tři slabší",
    rows.map((r) => r.teamName).join(","));
}

console.log("3. Neplatné běhy se ignorují");
{
  const rows = buildLeaderboard([
    tym("Alfa", [beh(100), beh(900, false)]),
    tym("Beta", [beh(200)]),
  ]);
  check(rows[0].teamName === "Beta", "neplatný běh za 900 se nepočítá",
    rows.map((r) => `${r.teamName}:${r.best?.points}`).join(","));
  check(rows[1].best?.points === 100, "Alfě zůstal její platný běh");
  check(rows[1].totalRuns === 2 && rows[1].validRuns === 1, "počty běhů sedí",
    `${rows[1].totalRuns}/${rows[1].validRuns}`);
}

console.log("4. Tým bez platného běhu je v žebříčku, ale bez pořadí");
{
  const rows = buildLeaderboard([
    tym("Alfa", [beh(100)]),
    tym("Beta", [beh(null, false), beh(500, false)]),
  ]);
  check(rows.length === 2, "oba týmy jsou v žebříčku");
  check(rows[1].teamName === "Beta", "tým bez platného běhu je poslední");
  check(rows[1].rank === null, "a nemá pořadí", String(rows[1].rank));
  check(rows[1].best === null, "ani nejlepší běh");
  check(rows[1].totalRuns === 2, "ale je vidět, že něco odběhl");
}

console.log("5. Shoda bodů = sdílené umístění");
{
  const rows = buildLeaderboard([
    tym("Alfa", [beh(300)]),
    tym("Beta", [beh(500)]),
    tym("Gama", [beh(500)]),
    tym("Delta", [beh(100)]),
  ]);
  check(rows.map((r) => r.rank).join(",") === "1,1,3,4", "pořadí 1,1,3,4",
    rows.map((r) => `${r.teamName}:${r.rank}`).join(","));
  check(
    rows[0].best!.completedAt < rows[1].best!.completedAt,
    "při shodě je první ten, kdo výkonu dosáhl dřív"
  );
}

console.log("6. Body s desetinnou částí");
{
  // Skóre vychází z procent, takže shody jsou vzácné - žebříček je musí
  // rozlišit i na desetiny.
  const rows = buildLeaderboard([
    tym("Alfa", [beh(131.11)]),
    tym("Beta", [beh(131.12)]),
  ]);
  check(rows[0].teamName === "Beta", "rozliší rozdíl 0,01 bodu",
    rows.map((r) => `${r.teamName}:${r.best?.points}`).join(","));
  check(rows.map((r) => r.rank).join(",") === "1,2", "a nedá jim sdílené umístění");
}

console.log("7. Hraniční případy");
{
  check(buildLeaderboard([]).length === 0, "prázdný vstup");

  const bezBehu = buildLeaderboard([tym("Alfa", [])]);
  check(bezBehu.length === 1 && bezBehu[0].rank === null,
    "tým bez jediného běhu nemá pořadí");

  // Platný běh bez bodů (nemělo by nastat, ale nesmí to spadnout).
  const bezBodu = buildLeaderboard([tym("Alfa", [beh(null, true)])]);
  check(bezBodu[0].best === null, "platný běh bez bodů se nepočítá");

  // Záporné body dávají smysl jen při jiném nastavení, ale řadit se musí.
  const zaporne = buildLeaderboard([tym("Alfa", [beh(-50)]), tym("Beta", [beh(-10)])]);
  check(zaporne[0].teamName === "Beta", "záporné body se řadí správně");
}

console.log("8. Stabilní pořadí");
{
  // Dva týmy bez běhu se musí seřadit abecedně, ne náhodně.
  const rows = buildLeaderboard([tym("Zulu", []), tym("Alfa", [])]);
  check(rows.map((r) => r.teamName).join(",") === "Alfa,Zulu", "abecedně",
    rows.map((r) => r.teamName).join(","));
}

console.log(
  `\n${failures === 0 ? "OK" : "CHYBY"}: ${checks - failures}/${checks} kontrol prošlo.`
);
process.exit(failures === 0 ? 0 : 1);
