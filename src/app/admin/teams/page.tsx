import Link from "next/link";
import type { SpecRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { SPEC_ROLE_LABELS, plural } from "@/lib/labels";
import { describeTeamComposition } from "@/lib/shuffle";
import { ConfirmButton } from "../confirm-button";
import { addAsSubstitute, deleteAllTeams, updateTeams } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_ORDER: Record<SpecRole, number> = { TANK: 0, HEALER: 1, DPS: 2 };

interface Row {
  membershipId: string;
  characterName: string;
  className: string | null;
  wowSpec: string | null;
  rioScore: number | null;
  roleInTeam: SpecRole;
  destination: string;
}

function MemberRows({
  rows,
  teams,
}: {
  rows: Row[];
  teams: { id: string; name: string }[];
}) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.membershipId}>
          <td>{row.characterName}</td>
          <td style={{ color: "var(--muted)" }}>
            {row.wowSpec ? `${row.className} - ${row.wowSpec}` : row.className ?? "-"}
          </td>
          <td>{row.rioScore === null ? "-" : Math.round(row.rioScore)}</td>
          <td>
            <select name={`role-${row.membershipId}`} defaultValue={row.roleInTeam}>
              {Object.entries(SPEC_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </td>
          <td>
            <select name={`dest-${row.membershipId}`} defaultValue={row.destination}>
              {teams.map((team) => (
                <option key={team.id} value={`team:${team.id}`}>
                  {team.name}
                </option>
              ))}
              <option value="sub">Náhradník</option>
              <option value="removed">Vyřazen</option>
            </select>
          </td>
        </tr>
      ))}
    </>
  );
}

/** Hlavička tabulky členů - stejná pro týmy, náhradníky i vyřazené. */
function MemberTableHead() {
  return (
    <thead>
      <tr>
        <th style={{ width: "22%" }}>Postava</th>
        <th style={{ width: "26%" }}>Class / spec</th>
        <th style={{ width: "10%" }}>RIO</th>
        <th style={{ width: "18%" }}>Role v týmu</th>
        <th style={{ width: "24%" }}>Zařazení</th>
      </tr>
    </thead>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; deleted?: string };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <h1>Týmy</h1>
        <p className="admin-subtitle">Zatím není založená žádná sezóna.</p>
      </>
    );
  }

  const [teams, memberships, approved] = await Promise.all([
    prisma.team.findMany({
      where: { seasonId: season.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMembership.findMany({
      where: { seasonId: season.id },
      include: { character: true },
    }),
    prisma.seasonRegistration.findMany({
      where: { seasonId: season.id, status: "APPROVED" },
      include: { character: true },
    }),
  ]);

  const toRow = (membership: (typeof memberships)[number]): Row => ({
    membershipId: membership.id,
    characterName: membership.character.characterName,
    className: membership.character.class,
    wowSpec: membership.character.wowSpec,
    rioScore: membership.character.rioScore,
    roleInTeam: membership.roleInTeam,
    destination:
      membership.status === "REMOVED"
        ? "removed"
        : membership.teamId
          ? `team:${membership.teamId}`
          : "sub",
  });

  const sortRows = (rows: Row[]) =>
    rows.sort(
      (a, b) =>
        ROLE_ORDER[a.roleInTeam] - ROLE_ORDER[b.roleInTeam] ||
        (b.rioScore ?? 0) - (a.rioScore ?? 0)
    );

  const withoutMembership = approved.filter(
    (registration) =>
      !memberships.some((m) => m.characterId === registration.characterId)
  );

  const substitutes = sortRows(
    memberships.filter((m) => m.status === "SUBSTITUTE").map(toRow)
  );
  const removed = sortRows(
    memberships.filter((m) => m.status === "REMOVED").map(toRow)
  );

  const hasAnything = teams.length > 0 || memberships.length > 0;

  return (
    <>
      <h1>Týmy</h1>
      <p className="admin-subtitle">{season.name}</p>

      {searchParams.error && (
        <div className="card">
          <p className="error-text" style={{ margin: 0 }}>
            {searchParams.error}
          </p>
        </div>
      )}

      {searchParams.saved && (
        <div className="card">
          <p className="success-text" style={{ margin: 0 }}>
            Změny uložené.
          </p>
        </div>
      )}

      {searchParams.deleted && (
        <div className="card">
          <p className="success-text" style={{ margin: 0 }}>
            Týmy smazané. Nové rozdělení jde vytvořit na stránce Shuffle.
          </p>
        </div>
      )}

      {!hasAnything ? (
        <div className="card">
          <h2>Zatím nejsou rozdělené týmy</h2>
          <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
            Týmy vzniknou potvrzením některé varianty shuffle.
          </p>
          <Link className="btn btn-accent" href="/admin/shuffle">
            Přejít na shuffle
          </Link>
        </div>
      ) : (
        <>
          <form action={updateTeams}>
            <input type="hidden" name="seasonId" value={season.id} />

            {teams.map((team) => {
              const rows = sortRows(
                memberships
                  .filter((m) => m.teamId === team.id && m.status === "ACTIVE")
                  .map(toRow)
              );

              const violations = describeTeamComposition(
                rows.map((row) => ({
                  characterName: row.characterName,
                  className: row.className,
                  wowSpec: row.wowSpec,
                  roleInTeam: row.roleInTeam,
                }))
              );

              return (
                <div className="card" key={team.id}>
                  <div className="field" style={{ maxWidth: "280px" }}>
                    <label htmlFor={`teamname-${team.id}`}>Název týmu</label>
                    <input
                      id={`teamname-${team.id}`}
                      name={`teamname-${team.id}`}
                      defaultValue={team.name}
                      required
                    />
                  </div>

                  {rows.length === 0 ? (
                    <p className="empty-state">Tým je prázdný.</p>
                  ) : (
                    <table className="data">
                      <MemberTableHead />
                      <tbody>
                        <MemberRows rows={rows} teams={teams} />
                      </tbody>
                    </table>
                  )}

                  {violations.length > 0 && (
                    <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.2rem" }}>
                      {violations.map((violation) => (
                        <li
                          key={violation}
                          style={{ fontSize: "0.82rem", color: "var(--muted)" }}
                        >
                          {violation}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            <div className="card">
              <h2>Náhradníci ({substitutes.length})</h2>
              {substitutes.length === 0 ? (
                <p className="empty-state">Žádní náhradníci.</p>
              ) : (
                <table className="data">
                  <MemberTableHead />
                  <tbody>
                    <MemberRows rows={substitutes} teams={teams} />
                  </tbody>
                </table>
              )}
            </div>

            {removed.length > 0 && (
              <div className="card">
                <h2>Vyřazení ({removed.length})</h2>
                <table className="data">
                  <MemberTableHead />
                  <tbody>
                    <MemberRows rows={removed} teams={teams} />
                  </tbody>
                </table>
              </div>
            )}

            <div className="card">
              <button className="btn btn-accent" type="submit">
                Uložit změny
              </button>
              <span
                style={{
                  color: "var(--muted)",
                  fontSize: "0.82rem",
                  marginLeft: "0.75rem",
                }}
              >
                Přesuny i změny rolí se ukládají najednou.
              </span>
            </div>
          </form>

          {withoutMembership.length > 0 && (
            <div className="card">
              <h2>Schválení bez zařazení ({withoutMembership.length})</h2>
              <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                Typicky hráči schválení až po rozdělení týmů. Přidají se mezi
                náhradníky, odkud je jde přesunout do týmu.
              </p>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: "26%" }}>Postava</th>
                    <th style={{ width: "30%" }}>Class / spec</th>
                    <th style={{ width: "14%" }}>Role</th>
                    <th style={{ width: "12%" }}>RIO</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {withoutMembership.map((registration) => (
                    <tr key={registration.id}>
                      <td>{registration.character.characterName}</td>
                      <td style={{ color: "var(--muted)" }}>
                        {registration.character.wowSpec
                          ? `${registration.character.class} - ${registration.character.wowSpec}`
                          : registration.character.class ?? "-"}
                      </td>
                      <td>{SPEC_ROLE_LABELS[registration.character.specRole]}</td>
                      <td>
                        {registration.character.rioScore === null
                          ? "-"
                          : Math.round(registration.character.rioScore)}
                      </td>
                      <td>
                        <form action={addAsSubstitute}>
                          <input type="hidden" name="seasonId" value={season.id} />
                          <input
                            type="hidden"
                            name="characterId"
                            value={registration.characterId}
                          />
                          <button className="btn" type="submit">
                            Přidat mezi náhradníky
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2>Smazat rozdělení</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
              Smaže všechny týmy a členství sezóny ({teams.length}{" "}
              {plural(teams.length, "tým", "týmy", "týmů")}, {memberships.length}{" "}
              členství). Použitý shuffle běh se vrátí mezi návrhy, takže půjde
              použít jiná varianta. Nejde vzít zpět.
            </p>
            <form action={deleteAllTeams}>
              <input type="hidden" name="seasonId" value={season.id} />
              <ConfirmButton
                className="btn btn-danger"
                message={`Opravdu smazat všechny týmy sezóny "${season.name}"? Nejde to vrátit.`}
              >
                Smazat všechny týmy
              </ConfirmButton>
            </form>
          </div>
        </>
      )}
    </>
  );
}
