import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/admin";
import {
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  REGISTRATION_STATUS_BADGES,
  REGISTRATION_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  USER_ROLE_LABELS,
  formatDateTime,
  formatTimeLimit,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Detail uživatele – administrace",
};

/** Zařazení hráče v sezóně jednou větou. */
function membershipLabel(membership: {
  status: string;
  team: { name: string } | null;
}) {
  if (membership.status === "REMOVED") return "Vyřazen";
  if (membership.status === "SUBSTITUTE") return "Náhradník";
  return membership.team?.name ?? "Bez týmu";
}

export default async function UserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const currentUser = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      character: {
        include: {
          registrations: {
            include: {
              season: { select: { name: true } },
              entryFeeConfirmedBy: { select: { username: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          teamMemberships: {
            include: {
              season: { select: { name: true } },
              team: { select: { id: true, name: true } },
            },
            orderBy: { joinedAt: "desc" },
          },
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const character = user.character;

  // Odběhané dungeony se počítají přes tým: výsledek visí na zápase týmu,
  // ne na jednotlivém hráči. U vyřazeného člena se berou jen zápasy do jeho
  // vyřazení, ať mu nepřibývají běhy, u kterých už nebyl.
  const memberships = character?.teamMemberships ?? [];
  const teamIds = memberships
    .map((membership) => membership.teamId)
    .filter((teamId): teamId is string => teamId !== null);

  const matches = teamIds.length
    ? await prisma.match.findMany({
        where: { teamId: { in: teamIds } },
        include: {
          team: { select: { id: true, name: true } },
          results: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { windowStart: "desc" },
      })
    : [];

  const removedAtByTeam = new Map(
    memberships
      .filter((membership) => membership.teamId && membership.removedAt)
      .map((membership) => [membership.teamId!, membership.removedAt!])
  );

  const runs = matches
    .filter((match) => {
      const removedAt = removedAtByTeam.get(match.teamId);
      return !removedAt || match.windowStart <= removedAt;
    })
    .flatMap((match) => match.results.map((result) => ({ ...result, match })));

  const validRuns = runs.filter((run) => run.isValid);
  const bestKeyLevel = validRuns.reduce(
    (best, run) => Math.max(best, run.keyLevel),
    0
  );

  const registrations = character?.registrations ?? [];
  const paidCount = registrations.filter((r) => r.entryFeePaidAt).length;

  return (
    <>
      <h1>{user.username}</h1>
      <p className="admin-subtitle">
        <span className="badge badge-approved">{USER_ROLE_LABELS[user.role]}</span>
        {user.id === currentUser?.id && " - to jsi ty"}
      </p>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-value">{runs.length}</span>
          <span className="stat-label">Odběhaných dungeonů</span>
        </div>
        <div className="stat">
          <span className="stat-value">{validRuns.length}</span>
          <span className="stat-label">Uznaných běhů</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {bestKeyLevel === 0 ? "-" : `+${bestKeyLevel}`}
          </span>
          <span className="stat-label">Nejvyšší uznaný klíč</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {character?.rioScore == null ? "-" : Math.round(character.rioScore)}
          </span>
          <span className="stat-label">RIO skóre</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {paidCount}/{registrations.length}
          </span>
          <span className="stat-label">Zaplacené zápisné</span>
        </div>
      </div>

      <div className="card">
        <h2>Účet</h2>
        <dl className="detail">
          <dt>Uživatelské jméno</dt>
          <dd>{user.username}</dd>
          <dt>Role</dt>
          <dd>{USER_ROLE_LABELS[user.role]}</dd>
          <dt>Discord</dt>
          <dd>{user.discordNick ?? "-"}</dd>
          <dt>E-mail</dt>
          <dd>{user.email ?? "-"}</dd>
          <dt>Registrován</dt>
          <dd>{formatDateTime(user.createdAt)}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Postava</h2>
        {!character ? (
          <p className="empty-state">Uživatel zatím nemá založenou postavu.</p>
        ) : (
          <dl className="detail">
            <dt>Jméno a realm</dt>
            <dd>
              {character.characterName} - {character.realm}
            </dd>
            <dt>Class / spec</dt>
            <dd>
              {character.wowSpec
                ? `${character.class} - ${character.wowSpec}`
                : character.class ?? "-"}
            </dd>
            <dt>Role</dt>
            <dd>{SPEC_ROLE_LABELS[character.specRole]}</dd>
            <dt>RIO skóre</dt>
            <dd>
              {character.rioScore == null ? "-" : Math.round(character.rioScore)}
            </dd>
            <dt>Guilda</dt>
            <dd>{character.guildName ?? "-"}</dd>
            <dt>Frakce</dt>
            <dd>{character.faction ?? "-"}</dd>
            <dt>Raider.io</dt>
            <dd>
              <a
                className="link"
                href={character.raiderioUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {character.raiderioUrl}
              </a>
            </dd>
            <dt>Naposledy načteno</dt>
            <dd>{formatDateTime(character.lastSyncedAt)}</dd>
          </dl>
        )}
      </div>

      <div className="card">
        <h2>Zařazení v týmu</h2>
        {memberships.length === 0 ? (
          <p className="empty-state">Hráč zatím není nikam zařazený.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" style={{ width: "34%" }}>Sezóna</th>
                <th scope="col" style={{ width: "30%" }}>Zařazení</th>
                <th scope="col" style={{ width: "18%" }}>Role v týmu</th>
                <th scope="col" style={{ width: "18%" }}>Od</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => (
                <tr key={membership.id}>
                  <td>{membership.season.name}</td>
                  <td>{membershipLabel(membership)}</td>
                  <td>{SPEC_ROLE_LABELS[membership.roleInTeam]}</td>
                  <td className="muted">{formatDateTime(membership.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Přihlášky a zápisné</h2>
        {registrations.length === 0 ? (
          <p className="empty-state">Hráč se zatím do žádné sezóny nepřihlásil.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" style={{ width: "28%" }}>Sezóna</th>
                <th scope="col" style={{ width: "20%" }}>Stav</th>
                <th scope="col" style={{ width: "20%" }}>Zápisné</th>
                <th scope="col" style={{ width: "20%" }}>Potvrdil</th>
                <th scope="col" style={{ width: "12%" }} />
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id}>
                  <td>{registration.season.name}</td>
                  <td>
                    <span className={REGISTRATION_STATUS_BADGES[registration.status]}>
                      {REGISTRATION_STATUS_LABELS[registration.status]}
                    </span>
                  </td>
                  <td>
                    {registration.entryFeePaidAt ? (
                      <span className="badge badge-approved">Zaplaceno</span>
                    ) : (
                      <span className="badge badge-pending">Nezaplaceno</span>
                    )}
                  </td>
                  <td className="muted">
                    {registration.entryFeeConfirmedBy?.username ?? "-"}
                  </td>
                  <td>
                    <Link
                      className="btn"
                      href={`/admin/registrations/${registration.id}`}
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Odběhané dungeony ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className="empty-state">Zatím nemá zaznamenaný žádný běh.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" style={{ width: "26%" }}>Dungeon</th>
                <th scope="col" style={{ width: "10%" }}>Klíč</th>
                <th scope="col" style={{ width: "12%" }}>Čas</th>
                <th scope="col" style={{ width: "12%" }}>Body</th>
                <th scope="col" style={{ width: "20%" }}>Tým</th>
                <th scope="col" style={{ width: "20%" }}>Zápas</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    {run.dungeonName}
                    {!run.isValid && (
                      <span
                        className="badge badge-rejected"
                        style={{ marginLeft: "0.4rem" }}
                      >
                        Neuznáno
                      </span>
                    )}
                  </td>
                  <td>+{run.keyLevel}</td>
                  <td>{formatTimeLimit(run.clearTimeSeconds)}</td>
                  <td>{run.points === null ? "-" : Math.round(run.points)}</td>
                  <td className="muted">{run.match.team.name}</td>
                  <td className="muted">
                    {formatDateTime(run.match.windowStart)}{" "}
                    <span className={MATCH_STATUS_BADGES[run.match.status]}>
                      {MATCH_STATUS_LABELS[run.match.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Link className="btn" href="/admin/users">
        Zpět na seznam
      </Link>
    </>
  );
}
