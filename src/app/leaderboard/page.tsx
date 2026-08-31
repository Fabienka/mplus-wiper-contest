import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { buildLeaderboard } from "@/lib/leaderboard";
import {
  SEASON_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDateTime,
  formatTimeLimit,
  plural,
} from "@/lib/labels";
import { SiteHeader } from "../site-header";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <SiteHeader />
        <main className="site-main">
          <h1>Žebříček</h1>
          <p className="empty-state">Zatím není založená žádná sezóna.</p>
        </main>
      </>
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
    <>
      <SiteHeader />

      <main className="site-main site-main-wide">
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
                  <th style={{ width: "8%" }}>#</th>
                  <th style={{ width: "26%" }}>Tým</th>
                  <th style={{ width: "26%" }}>Nejlepší běh</th>
                  <th style={{ width: "12%" }}>Čas</th>
                  <th style={{ width: "12%" }}>Body</th>
                  <th>Běhů</th>
                </tr>
              </thead>
              <tbody>
                {odehrali.map((row) => {
                  const sestava = sestavaTymu.get(row.teamId) ?? [];

                  return (
                    <tr key={row.teamId}>
                      <td>
                        {row.rank === null ? (
                          <span style={{ color: "var(--muted)" }}>-</span>
                        ) : (
                          <strong>{row.rank}.</strong>
                        )}
                      </td>
                      <td>
                        {row.teamName}
                        {sestava.length > 0 && (
                          <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
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
                            <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                              {formatDateTime(row.best.completedAt)}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>
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
                      <td style={{ color: "var(--muted)" }}>
                        {row.validRuns} / {row.totalRuns}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p style={{ margin: "1rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
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
    </>
  );
}
