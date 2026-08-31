import Link from "next/link";
import type { SpecRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { getCurrentUser } from "@/lib/admin";
import { computePoolStats, type SpecCount } from "@/lib/stats";
import { SEASON_STATUS_LABELS, plural } from "@/lib/labels";
import { SiteHeader } from "./site-header";

export const dynamic = "force-dynamic";

/** Kolik nejčastějších speců v každé roli se vypíše. */
const TOP_SPECS = 3;

/** Zkratka DPS se nesklápí na malá písmena, ostatní role ano. */
const ROLE_HEADING: Record<SpecRole, string> = {
  TANK: "Nejčastější tank",
  HEALER: "Nejčastější healer",
  DPS: "Nejčastější DPS",
};

function SpecList({ role, specs }: { role: SpecRole; specs: SpecCount[] }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <h2>{ROLE_HEADING[role]}</h2>

      {specs.length === 0 ? (
        <p className="empty-state" style={{ padding: "0.5rem 0" }}>
          Zatím nikdo.
        </p>
      ) : (
        <ol className="rank-list">
          {specs.slice(0, TOP_SPECS).map((spec) => (
            <li key={`${spec.className}-${spec.specName}`}>
              <span>
                {spec.specName}{" "}
                <span style={{ color: "var(--muted)" }}>{spec.className}</span>
              </span>
              <strong>{spec.count}×</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function HomePage() {
  const [season, user] = await Promise.all([getCurrentSeason(), getCurrentUser()]);

  if (!season) {
    return (
      <>
        <SiteHeader />
        <main className="site-main">
          <h1>Mythic+ Wiper Contest</h1>
          <p style={{ color: "var(--muted)" }}>
            Zatím není založená žádná sezóna.
          </p>
        </main>
      </>
    );
  }

  const [approved, pending, teamCount, dungeonCount] = await Promise.all([
    prisma.seasonRegistration.findMany({
      where: { seasonId: season.id, status: "APPROVED" },
      select: {
        character: {
          select: { class: true, wowSpec: true, specRole: true, rioScore: true },
        },
      },
    }),
    prisma.seasonRegistration.count({
      where: { seasonId: season.id, status: "PENDING" },
    }),
    prisma.team.count({ where: { seasonId: season.id } }),
    prisma.seasonDungeon.count({ where: { seasonId: season.id, isActive: true } }),
  ]);

  const stats = computePoolStats(
    approved.map((r) => ({
      className: r.character.class,
      wowSpec: r.character.wowSpec,
      specRole: r.character.specRole,
      rioScore: r.character.rioScore,
    }))
  );

  const znamy = stats.range.melee + stats.range.ranged;
  const meleePct = znamy > 0 ? Math.round((stats.range.melee / znamy) * 100) : 0;
  const registraceOtevrena = season.status === "REGISTRATION_OPEN";

  return (
    <>
      <SiteHeader />

      <main className="site-main site-main-wide">
        <h1>Mythic+ Wiper Contest</h1>
        <p className="admin-subtitle">
          {season.name} - {SEASON_STATUS_LABELS[season.status]}
        </p>

        {registraceOtevrena && !user && (
          <div className="card">
            <h2>Registrace je otevřená</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
              Přihlas se do sezóny {season.name}. Stačí odkaz na Raider.io profil
              postavy, se kterou chceš hrát.
            </p>
            <Link className="btn btn-accent" href="/register">
              Přihlásit se do soutěže
            </Link>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">
              {plural(stats.total, "účastník", "účastníci", "účastníků")}
            </div>
          </div>
          <div className="stat">
            <div className="stat-value">{teamCount}</div>
            <div className="stat-label">{plural(teamCount, "tým", "týmy", "týmů")}</div>
          </div>
          <div className="stat">
            <div className="stat-value">{dungeonCount}</div>
            <div className="stat-label">Dungeonů v rotaci</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {stats.rio ? Math.round(stats.rio.average) : "-"}
            </div>
            <div className="stat-label">Průměrné RIO</div>
          </div>
        </div>

        <div className="card">
          <h2>Složení pole</h2>

          {stats.total === 0 ? (
            <p className="empty-state">
              Zatím nemáme schválené účastníky.
              {pending > 0 &&
                ` ${pending} ${plural(pending, "přihláška čeká", "přihlášky čekají", "přihlášek čeká")} na schválení.`}
            </p>
          ) : (
            <>
              <div className="split-bar" aria-hidden="true">
                <span
                  className="split-tank"
                  style={{ width: `${(stats.byRole.TANK / stats.total) * 100}%` }}
                />
                <span
                  className="split-healer"
                  style={{ width: `${(stats.byRole.HEALER / stats.total) * 100}%` }}
                />
                <span
                  className="split-dps"
                  style={{ width: `${(stats.byRole.DPS / stats.total) * 100}%` }}
                />
              </div>

              <div className="split-legend">
                <span>
                  <i className="split-tank" /> {stats.byRole.TANK} tanků
                </span>
                <span>
                  <i className="split-healer" /> {stats.byRole.HEALER} healerů
                </span>
                <span>
                  <i className="split-dps" /> {stats.byRole.DPS} DPS
                </span>
              </div>

              <dl className="detail" style={{ marginTop: "1.25rem" }}>
                <dt>Melee / ranged</dt>
                <dd>
                  {stats.range.melee} / {stats.range.ranged}
                  {znamy > 0 && (
                    <span style={{ color: "var(--muted)" }}> ({meleePct} % melee)</span>
                  )}
                </dd>
                <dt>Umí battle rez</dt>
                <dd>
                  {stats.coverage.battleRez} z {stats.total}
                </dd>
                <dt>Umí bloodlust</dt>
                <dd>
                  {stats.coverage.bloodlust} z {stats.total}
                </dd>
                {stats.rio && (
                  <>
                    <dt>Rozpětí RIO</dt>
                    <dd>
                      {Math.round(stats.rio.lowest)} - {Math.round(stats.rio.highest)}
                    </dd>
                  </>
                )}
              </dl>
            </>
          )}
        </div>

        {stats.total > 0 && (
          <>
            <div className="trio-grid">
              <SpecList role="TANK" specs={stats.topSpecs.TANK} />
              <SpecList role="HEALER" specs={stats.topSpecs.HEALER} />
              <SpecList role="DPS" specs={stats.topSpecs.DPS} />
            </div>

            <div className="card">
              <h2>Zastoupení tříd</h2>
              <ol className="rank-list">
                {stats.classCounts.slice(0, 8).map((item) => (
                  <li key={item.className}>
                    <span style={{ flex: 1 }}>{item.className}</span>
                    <span className="bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${(item.count / stats.classCounts[0].count) * 100}%`,
                        }}
                      />
                    </span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </main>
    </>
  );
}
