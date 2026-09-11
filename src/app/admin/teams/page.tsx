import Link from "next/link";
import { NoSeason } from "../no-season";
import { SubmitButton } from "../../submit-button";
import type { SpecRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/admin";
import { can } from "@/lib/permissions";
import { getCurrentSeason } from "@/lib/season";
import { SPEC_ROLE_LABELS, formatDateTime, plural } from "@/lib/labels";
import { describeTeamComposition } from "@/lib/shuffle";
import { addAsSubstitute, deleteAllTeams, resetTeamReroll, updateTeams } from "./actions";
import { ActionNotice } from "../../action-notice";
import { CharacterName } from "../../character-name";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Týmy – administrace",
};

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
          <td>
            <CharacterName name={row.characterName} wowClass={row.className} />
          </td>
          <td className="muted">
            {row.wowSpec ? `${row.className} - ${row.wowSpec}` : row.className ?? "-"}
          </td>
          <td>{row.rioScore === null ? "-" : Math.round(row.rioScore)}</td>
          <td>
            {/* Bez popisku přečte čtečka v řádku jen "combobox" a není
                poznat, ke kterému hráči patří. */}
            <select
              name={`role-${row.membershipId}`}
              defaultValue={row.roleInTeam}
              aria-label={`Role hráče ${row.characterName} v týmu`}
            >
              {Object.entries(SPEC_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </td>
          <td>
            <select
              name={`dest-${row.membershipId}`}
              defaultValue={row.destination}
              aria-label={`Zařazení hráče ${row.characterName}`}
            >
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
        <th scope="col" style={{ width: "22%" }}>Postava</th>
        <th scope="col" style={{ width: "26%" }}>Class / spec</th>
        <th scope="col" style={{ width: "10%" }}>RIO</th>
        <th scope="col" style={{ width: "18%" }}>Role v týmu</th>
        <th scope="col" style={{ width: "24%" }}>Zařazení</th>
      </tr>
    </thead>
  );
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; deleted?: string };
}) {
  const [season, user] = await Promise.all([getCurrentSeason(), getCurrentUser()]);

  // Přesuny v soupiskách zvládne i moderátor - nic se jimi nemaže a jdou
  // vzít zpátky. Smazat celé rozdělení smí jen admin.
  const canDelete = can(user?.role, "deleteTeams");
  const canResetReroll = can(user?.role, "resetTeamReroll");

  if (!season) {
    return (
      <>
        <NoSeason title="Týmy" />
      </>
    );
  }

  const [teams, memberships, approved, rerolls] = await Promise.all([
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
    prisma.teamReroll.findMany({
      where: { team: { seasonId: season.id } },
      include: { recordedBy: { select: { characterName: true, class: true } } },
    }),
  ]);

  const rerollByTeam = new Map(rerolls.map((reroll) => [reroll.teamId, reroll]));

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

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.deleted
            ? "Týmy smazané. Nové rozdělení jde vytvořit na stránce Shuffle."
            : searchParams.saved && "Změny v týmech uložené."
        }
      />

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
                  {/* Detail je mimo formulář úprav jen odkazem - neodesílá nic. */}
                  <div className="row-actions" style={{ justifyContent: "flex-end", marginBottom: "0.5rem" }}>
                    <Link className="btn" href={`/admin/teams/${team.id}`}>
                      Detail týmu - termíny, běhy, poznámky
                    </Link>
                  </div>
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
                        <li className="meta"
                          key={violation}
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
              <SubmitButton
                className="btn btn-accent"
                pendingLabel="Ukládám..."
              >
                Uložit změny
              </SubmitButton>
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

          {/* Mimo velký formulář úprav - zrušení rerollu je samostatná akce
              a vnořený formulář HTML nedovolí. */}
          {teams.length > 0 && (
            <div className="card">
              <h2>Reroll klíče</h2>
              <p className="card-lead">
                Každý tým má na soutěž jeden reroll. Zapisuje ho tým sám na
                stránce Můj tým.
              </p>
              <table className="data table-cards">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "22%" }}>Tým</th>
                    <th scope="col" style={{ width: "38%" }}>Reroll</th>
                    <th scope="col" style={{ width: "24%" }}>Zapsal</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const reroll = rerollByTeam.get(team.id);

                    return (
                      <tr key={team.id}>
                        <td data-label="Tým">
                          <Link className="link" href={`/admin/teams/${team.id}`}>
                            {team.name}
                          </Link>
                        </td>
                        <td data-label="Reroll">
                          {reroll ? (
                            `${reroll.fromDungeonName} +${reroll.fromKeyLevel} → ${reroll.toDungeonName} +${reroll.toKeyLevel}`
                          ) : (
                            <span className="muted">nevyužitý</span>
                          )}
                        </td>
                        <td className="muted" data-label="Zapsal">
                          {reroll ? (
                            <>
                              <CharacterName
                                name={reroll.recordedBy.characterName}
                                wowClass={reroll.recordedBy.class}
                              />
                              , {formatDateTime(reroll.createdAt)}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {reroll && canResetReroll && (
                            <form action={resetTeamReroll}>
                              <input type="hidden" name="teamId" value={team.id} />
                              <SubmitButton
                                className="btn btn-danger"
                                pendingLabel="Ruším..."
                                confirmTitle="Zrušit reroll týmu?"
                                confirm={`Záznam rerollu týmu "${team.name}" se smaže a tým si ho bude moct zapsat znovu.`}
                                confirmLabel="Zrušit reroll"
                              >
                                Zrušit reroll
                              </SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {withoutMembership.length > 0 && (
            <div className="card">
              <h2>Schválení bez zařazení ({withoutMembership.length})</h2>
              <p className="card-lead">
                Typicky hráči schválení až po rozdělení týmů. Přidají se mezi
                náhradníky, odkud je jde přesunout do týmu.
              </p>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "26%" }}>Postava</th>
                    <th scope="col" style={{ width: "30%" }}>Class / spec</th>
                    <th scope="col" style={{ width: "14%" }}>Role</th>
                    <th scope="col" style={{ width: "12%" }}>RIO</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {withoutMembership.map((registration) => (
                    <tr key={registration.id}>
                      <td>
                        <CharacterName
                          name={registration.character.characterName}
                          wowClass={registration.character.class}
                        />
                      </td>
                      <td className="muted">
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
                          <SubmitButton
                            className="btn"
                            pendingLabel="Přidávám..."
                          >
                            Přidat mezi náhradníky
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canDelete && (
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
                <SubmitButton
                  pendingLabel="Mažu..."
                  className="btn btn-danger"
                  confirmTitle="Smazat všechny týmy?"
                  confirm={`Zruší se všechny týmy sezóny "${season.name}" i členství v nich. Nejde to vrátit.`}
                  confirmLabel="Smazat všechny týmy"
                >
                  Smazat všechny týmy
                </SubmitButton>
              </form>
            </div>
          )}
        </>
      )}
    </>
  );
}
