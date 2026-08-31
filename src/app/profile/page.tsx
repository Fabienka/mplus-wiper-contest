import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/admin";
import { can } from "@/lib/permissions";
import {
  REGISTRATION_STATUS_BADGES,
  REGISTRATION_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  USER_ROLE_LABELS,
  formatDateTime,
} from "@/lib/labels";
import { Notice } from "../notice";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { prihlaseno?: string };
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const character = await prisma.character.findUnique({
    where: { userId: user.id },
    include: {
      registrations: {
        orderBy: { createdAt: "desc" },
        include: {
          season: { select: { name: true, status: true } },
          entryFeeConfirmedBy: { select: { username: true } },
        },
      },
      teamMemberships: {
        where: { status: { not: "REMOVED" } },
        orderBy: { joinedAt: "desc" },
        include: { team: { select: { name: true } } },
      },
    },
  });

  const registration = character?.registrations[0] ?? null;
  const membership = character?.teamMemberships[0] ?? null;

  return (
    <main className="site-main">
        <h1>Můj profil</h1>
        <p className="admin-subtitle">
          {user.name} - {USER_ROLE_LABELS[user.role]}
        </p>

        {searchParams.prihlaseno && (
          <Notice kind="success" title="Přihlášení proběhlo v pořádku">
            Jsi přihlášený jako <strong>{user.name}</strong>. V liště nahoře
            najdeš, kam se odsud dá jít dál.
          </Notice>
        )}

        {!character ? (
          <div className="card">
            <h2>Zatím nemáš přihlášku</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
              K účtu není přiřazená žádná postava. Do soutěže se přihlásíš
              registračním formulářem.
            </p>
            <Link className="btn btn-accent" href="/register">
              Přejít na registraci
            </Link>
          </div>
        ) : (
          <>
            <div className="card">
              <h2>Moje postava</h2>
              <dl className="detail">
                <dt>Jméno a realm</dt>
                <dd>
                  {character.characterName} - {character.realm}
                </dd>
                <dt>Class a spec</dt>
                <dd>
                  {character.wowSpec
                    ? `${character.class} - ${character.wowSpec}`
                    : character.class ?? "-"}
                </dd>
                <dt>Role</dt>
                <dd>{SPEC_ROLE_LABELS[character.specRole]}</dd>
                <dt>RIO skóre</dt>
                <dd>{character.rioScore ?? "-"}</dd>
                <dt>Raider.io</dt>
                <dd>
                  <a
                    href={character.raiderioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    {character.raiderioUrl}
                  </a>
                </dd>
              </dl>
            </div>

            <div className="card">
              <h2>Moje přihláška</h2>

              {!registration ? (
                <p className="empty-state">
                  Postava zatím není přihlášená do žádné sezóny.
                </p>
              ) : (
                <>
                  <dl className="detail">
                    <dt>Sezóna</dt>
                    <dd>{registration.season.name}</dd>
                    <dt>Stav</dt>
                    <dd>
                      <span className={REGISTRATION_STATUS_BADGES[registration.status]}>
                        {REGISTRATION_STATUS_LABELS[registration.status]}
                      </span>
                    </dd>
                    <dt>Zápisné</dt>
                    <dd>
                      <span
                        className={
                          registration.entryFeePaidAt
                            ? "badge badge-approved"
                            : "badge badge-pending"
                        }
                      >
                        {registration.entryFeePaidAt ? "Zaplaceno" : "Nezaplaceno"}
                      </span>
                      {registration.entryFeePaidAt && (
                        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          {" "}
                          potvrdil {registration.entryFeeConfirmedBy?.username ?? "-"},{" "}
                          {formatDateTime(registration.entryFeePaidAt)}
                        </span>
                      )}
                    </dd>
                    <dt>Přihlášeno</dt>
                    <dd>{formatDateTime(registration.createdAt)}</dd>
                    {registration.rejectionReason && (
                      <>
                        <dt>Důvod zamítnutí</dt>
                        <dd>{registration.rejectionReason}</dd>
                      </>
                    )}
                  </dl>

                  {!registration.entryFeePaidAt &&
                    registration.status !== "REJECTED" && (
                      <Notice kind="info" title="Zápisné zatím není potvrzené">
                        Přihlášku potvrdíš zaplacením zápisného ve hře. Jakmile
                        peníze dorazí, potvrdí to moderátor a uvidíš to tady.
                      </Notice>
                    )}
                </>
              )}
            </div>

            <div className="card">
              <h2>Můj tým</h2>

              {!membership?.team ? (
                <p className="empty-state">
                  {membership?.status === "SUBSTITUTE"
                    ? "Jsi vedený jako náhradník, zatím nejsi v žádném týmu."
                    : "Ještě nejsi zařazený do týmu. Týmy vzniknou po rozdělení."}
                </p>
              ) : (
                <>
                  <dl className="detail">
                    <dt>Tým</dt>
                    <dd>{membership.team.name}</dd>
                    <dt>Role v týmu</dt>
                    <dd>{SPEC_ROLE_LABELS[membership.roleInTeam]}</dd>
                  </dl>
                  <Link className="btn btn-accent" href="/team">
                    Kalendář a termíny týmu
                  </Link>
                </>
              )}
            </div>
          </>
        )}

        {can(user.role, "accessAdmin") && (
          <div className="card">
            <h2>Administrace</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
              Máš roli {USER_ROLE_LABELS[user.role]}.
            </p>
            <Link className="btn" href="/admin">
              Přejít do administrace
            </Link>
          </div>
        )}
    </main>
  );
}
