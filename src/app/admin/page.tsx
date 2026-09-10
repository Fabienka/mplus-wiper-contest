import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import {
  SEASON_STATUS_LABELS,
  auditActionLabel,
  auditEntityLabel,
  formatDateTime,
  plural,
} from "@/lib/labels";

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

      {/* Každé číslo vede tam, kde se s ním dá něco dělat - dřív to byly
          mrtvé údaje a admin musel filtr hledat sám. */}
      <div className="stat-grid">
        <Link className="stat stat-link" href="/admin/registrations?status=PENDING">
          <span className="stat-value">{pending}</span>
          <span className="stat-label">Čeká na schválení</span>
        </Link>
        <Link className="stat stat-link" href="/admin/registrations?status=APPROVED">
          <span className="stat-value">{approved}</span>
          <span className="stat-label">Schválených</span>
        </Link>
        <Link className="stat stat-link" href="/admin/registrations?status=REJECTED">
          <span className="stat-value">{rejected}</span>
          <span className="stat-label">Zamítnutých</span>
        </Link>
        <Link className="stat stat-link" href="/admin/registrations?status=UNPAID">
          <span className="stat-value">{approved - paid}</span>
          <span className="stat-label">Nezaplacené zápisné</span>
        </Link>
        <Link className="stat stat-link" href="/admin/teams">
          <span className="stat-value">{teams}</span>
          <span className="stat-label">{plural(teams, "tým", "týmy", "týmů")}</span>
        </Link>
        <Link className="stat stat-link" href="/admin/season">
          <span className="stat-value">{dungeons}</span>
          <span className="stat-label">Aktivních dungeonů</span>
        </Link>
      </div>

      {pending > 0 && (
        <div className="card">
          <h2>Čeká na tebe</h2>
          {/* plural() je v labels.ts kvůli tomu, aby "2 registrací čekají"
              nevznikalo ručním if/else. */}
          <p className="card-lead">
            {pending} {plural(pending, "registrace čeká", "registrace čekají", "registrací čeká")}{" "}
            na schválení.
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
                <th scope="col">Kdy</th>
                <th scope="col">Kdo</th>
                <th scope="col">Akce</th>
                <th scope="col">Entita</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.actor.username}</td>
                  <td>{auditActionLabel(log.actionType)}</td>
                  <td className="muted">{auditEntityLabel(log.entityType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
