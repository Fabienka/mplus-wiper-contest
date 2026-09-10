import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { buildLeaderboard } from "@/lib/leaderboard";
import { getMyTeamId } from "@/lib/team";
import {
  SEASON_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDateTime,
  formatTimeLimit,
  plural,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Žebříček",
};

/** Kolik řádků je zhruba vidět bez rolování - podle toho se rozhoduje,
 *  jestli se nad tabulku vypíše, kde je tvůj tým. */
const RADKU_BEZ_ROLOVANI = 5;

export default async function LeaderboardPage() {
  const [season, myTeamId] = await Promise.all([
    getCurrentSeason(),
    getMyTeamId(),
  ]);

  if (!season) {
    return (
      <main className="site-main" id="obsah">
        <h1>Žebříček</h1>

        <div className="card">
          <h2>Zatím není co řadit</h2>
          <p className="card-lead">
            Není vypsaná žádná sezóna. Žebříček se naplní, až týmy odběhnou
            první klíče.
          </p>
          <Link className="btn" href="/info/pravidla">
            Jak se počítají body
          </Link>
        </div>
      </main>
    );
  }

  const teams = await prisma.team.findMany({
    where: { seasonId: season.id },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: {
          character: { select: { characterName: true, class: true, wowSpec: true } },
        },
      },
      matches: { include: { results: true } },
    },
  });

  const rows = buildLeaderboard(
    teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      results: team.matches.flatMap((match) =>
        match.results.map((result) => ({
          matchId: match.id,
          dungeonName: result.dungeonName,
          keyLevel: result.keyLevel,
          clearTimeSeconds: result.clearTimeSeconds,
          points: result.points,
          isValid: result.isValid,
          // Doběhnutí neevidujeme zvlášť, takže se bere zapsání výsledku -
          // pro rozstřel shody bodů to stačí.
          completedAt: result.createdAt,
        }))
      ),
    }))
  );

  // Týmy, které zatím nic neodběhly, do žebříčku nepatří.
  const odehrali = rows.filter((row) => row.totalRuns > 0);
  const cekaji = rows.filter((row) => row.totalRuns === 0);

  // Pozice v tabulce, ne pořadí v soutěži - podle ní se pozná, jestli je
  // vlastní tým vidět bez rolování.
  const mujIndex = odehrali.findIndex((row) => row.teamId === myTeamId);
  const mujRadek = mujIndex >= 0 ? odehrali[mujIndex] : null;
  const mujPoradi = mujIndex + 1;

  const sestavaTymu = new Map(
    teams.map((team) => [
      team.id,
      team.members.map((m) => ({
        characterName: m.character.characterName,
        className: m.character.class,
        wowSpec: m.character.wowSpec,
        roleInTeam: m.roleInTeam,
      })),
    ])
  );

  return (
    <main className="site-main site-main-wide" id="obsah">
      <h1>Žebříček</h1>
      <p className="admin-subtitle">
        {season.name} - {SEASON_STATUS_LABELS[season.status]}
      </p>

      <div className="card">
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
          Počítá se <strong style={{ color: "var(--text)" }}>jediný nejlepší běh</strong>{" "}
          sezóny - ne součet. Tým má v termínu zhruba dvě hodiny na to, aby
          zaběhl co nejlepší klíč. Skóre se skládá z výšky klíče a z procenta
          časového limitu, které tým nevyčerpal.
        </p>
      </div>

      {mujRadek && mujPoradi > RADKU_BEZ_ROLOVANI && (
        <p className="rank-mine-summary">
          Tvůj tým <strong>{mujRadek.teamName}</strong> je{" "}
          {mujRadek.rank === null ? (
            "zatím bez pořadí"
          ) : (
            <>
              <strong>{mujRadek.rank}.</strong> se{" "}
              <strong>{mujRadek.best?.points?.toFixed(1)}</strong> body
            </>
          )}
          .
        </p>
      )}

      {odehrali.length === 0 ? (
        <div className="card">
          <p className="empty-state" style={{ margin: 0 }}>
            Zatím nikdo nic neodběhl. Jakmile tým nahraje první výsledek,
            objeví se tady.
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th scope="col" style={{ width: "8%" }}>#</th>
                <th scope="col" style={{ width: "26%" }}>Tým</th>
                <th scope="col" style={{ width: "26%" }}>Nejlepší běh</th>
                <th scope="col" style={{ width: "12%" }}>Čas</th>
                <th scope="col" style={{ width: "12%" }}>Body</th>
                <th scope="col">Běhů</th>
              </tr>
            </thead>
            <tbody>
              {odehrali.map((row) => {
                const sestava = sestavaTymu.get(row.teamId) ?? [];
                const jeMuj = row.teamId === myTeamId;
                // Stupně vítězů jen pro tři nejlepší, a jen když opravdu
                // mají pořadí - tým bez platného běhu má rank null.
                const medaile =
                  row.rank !== null && row.rank <= 3 ? `rank-${row.rank}` : "";

                return (
                  <tr
                    key={row.teamId}
                    className={[medaile, jeMuj ? "rank-mine" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      {row.rank === null ? (
                        <span className="muted">-</span>
                      ) : medaile ? (
                        <span className="rank-medal">{row.rank}.</span>
                      ) : (
                        <strong>{row.rank}.</strong>
                      )}
                    </td>
                    <td>
                      {row.teamName}
                      {jeMuj && <span className="rank-mine-tag">tvůj tým</span>}
                      {sestava.length > 0 && (
                        <div className="meta">
                          {sestava
                            .map(
                              (m) =>
                                `${m.characterName} (${SPEC_ROLE_LABELS[m.roleInTeam]})`
                            )
                            .join(", ")}
                        </div>
                      )}
                    </td>
                    <td>
                      {row.best ? (
                        <>
                          {row.best.dungeonName}{" "}
                          <strong>+{row.best.keyLevel}</strong>
                          <div className="meta">
                            {formatDateTime(row.best.completedAt)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">
                          zatím žádný platný běh
                        </span>
                      )}
                    </td>
                    <td>
                      {row.best ? formatTimeLimit(row.best.clearTimeSeconds) : "-"}
                    </td>
                    <td>
                      {row.best ? (
                        <strong>{row.best.points!.toFixed(1)}</strong>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="muted">
                      {row.validRuns} / {row.totalRuns}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="card-note">
            Sloupec „Běhů" ukazuje platné ze všech nahraných. Tým bez platného
            běhu zůstává v žebříčku bez pořadí.
          </p>
        </div>
      )}

      {cekaji.length > 0 && (
        <div className="card">
          <h2>
            Zatím neodběhly ({cekaji.length}{" "}
            {plural(cekaji.length, "tým", "týmy", "týmů")})
          </h2>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
            {cekaji.map((row) => row.teamName).join(", ")}
          </p>
        </div>
      )}
    </main>
  );
}
