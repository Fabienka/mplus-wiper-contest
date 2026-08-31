import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { SEASON_STATUS_LABELS, formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <h1>Přehled</h1>
        <p className="admin-subtitle">
          Zatím není založená žádná sezóna. Založ ji seed skriptem
          (<code>npm run prisma:seed</code>) nebo v Prisma Studiu.
        </p>
      </>
    );
  }

  const [pending, approved, rejected, paid, teams, dungeons, recentLogs] =
    await Promise.all([
      prisma.seasonRegistration.count({
        where: { seasonId: season.id, status: "PENDING" },
      }),
      prisma.seasonRegistration.count({
        where: { seasonId: season.id, status: "APPROVED" },
      }),
      prisma.seasonRegistration.count({
        where: { seasonId: season.id, status: "REJECTED" },
      }),
      prisma.seasonRegistration.count({
        where: { seasonId: season.id, entryFeePaidAt: { not: null } },
      }),
      prisma.team.count({ where: { seasonId: season.id } }),
      prisma.seasonDungeon.count({
        where: { seasonId: season.id, isActive: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { actor: { select: { username: true } } },
      }),
    ]);

  return (
    <>
      <h1>Přehled</h1>
      <p className="admin-subtitle">
        {season.name} - {SEASON_STATUS_LABELS[season.status]}
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{pending}</div>
          <div className="stat-label">Čeká na schválení</div>
        </div>
        <div className="stat">
          <div className="stat-value">{approved}</div>
          <div className="stat-label">Schválených</div>
        </div>
        <div className="stat">
          <div className="stat-value">{rejected}</div>
          <div className="stat-label">Zamítnutých</div>
        </div>
        <div className="stat">
          <div className="stat-value">{paid}</div>
          <div className="stat-label">Zaplacené zápisné</div>
        </div>
        <div className="stat">
          <div className="stat-value">{teams}</div>
          <div className="stat-label">Týmů</div>
        </div>
        <div className="stat">
          <div className="stat-value">{dungeons}</div>
          <div className="stat-label">Aktivních dungeonů</div>
        </div>
      </div>

      {pending > 0 && (
        <div className="card">
          <h2>Čeká na tebe</h2>
          <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
            {pending === 1
              ? "1 registrace čeká na schválení."
              : `${pending} registrací čeká na schválení.`}
          </p>
          <Link className="btn btn-accent" href="/admin/registrations">
            Zobrazit registrace
          </Link>
        </div>
      )}

      <div className="card">
        <h2>Poslední změny</h2>
        {recentLogs.length === 0 ? (
          <p className="empty-state">Zatím žádné zaznamenané změny.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Kdy</th>
                <th>Kdo</th>
                <th>Akce</th>
                <th>Entita</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.actor.username}</td>
                  <td>{log.actionType}</td>
                  <td style={{ color: "var(--muted)" }}>{log.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
