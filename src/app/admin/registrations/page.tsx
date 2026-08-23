import Link from "next/link";
import type { RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import {
  REGISTRATION_STATUS_BADGES,
  REGISTRATION_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDateTime,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "PENDING", label: "Čekající" },
  { value: "APPROVED", label: "Schválené" },
  { value: "REJECTED", label: "Zamítnuté" },
  { value: "ALL", label: "Vše" },
];

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <h1>Registrace</h1>
        <p className="admin-subtitle">Zatím není založená žádná sezóna.</p>
      </>
    );
  }

  const activeFilter = FILTERS.some((f) => f.value === searchParams.status)
    ? (searchParams.status as string)
    : "PENDING";

  const registrations = await prisma.seasonRegistration.findMany({
    where: {
      seasonId: season.id,
      ...(activeFilter === "ALL"
        ? {}
        : { status: activeFilter as RegistrationStatus }),
    },
    orderBy: { createdAt: "asc" },
    include: {
      character: {
        select: {
          characterName: true,
          realm: true,
          class: true,
          specRole: true,
          rioScore: true,
          user: { select: { discordNick: true } },
        },
      },
    },
  });

  return (
    <>
      <h1>Registrace</h1>
      <p className="admin-subtitle">{season.name}</p>

      <div className="row-actions" style={{ marginBottom: "1.25rem" }}>
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            className={`btn${filter.value === activeFilter ? " btn-accent" : ""}`}
            href={`/admin/registrations?status=${filter.value}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="card">
        {registrations.length === 0 ? (
          <p className="empty-state">V tomto filtru nejsou žádné registrace.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Postava</th>
                <th>Role</th>
                <th>RIO</th>
                <th>Discord</th>
                <th>Přihlášeno</th>
                <th>Stav</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id}>
                  <td>
                    {registration.character.characterName}
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {registration.character.realm}
                      {registration.character.class
                        ? ` - ${registration.character.class}`
                        : ""}
                    </div>
                  </td>
                  <td>{SPEC_ROLE_LABELS[registration.character.specRole]}</td>
                  <td>{registration.character.rioScore ?? "-"}</td>
                  <td>{registration.character.user.discordNick ?? "-"}</td>
                  <td>{formatDateTime(registration.createdAt)}</td>
                  <td>
                    <span className={REGISTRATION_STATUS_BADGES[registration.status]}>
                      {REGISTRATION_STATUS_LABELS[registration.status]}
                    </span>
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
    </>
  );
}
