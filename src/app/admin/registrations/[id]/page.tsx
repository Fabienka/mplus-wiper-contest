import Link from "next/link";
import { SubmitButton } from "../../../submit-button";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/admin";
import { can } from "@/lib/permissions";
import {
  REGISTRATION_STATUS_BADGES,
  REGISTRATION_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDateTime,
} from "@/lib/labels";
import {
  approveRegistration,
  confirmEntryFee,
  rejectRegistration,
  reopenRegistration,
  revokeEntryFee,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Detail registrace – administrace",
};

/** Odpovědi z formuláře jsou volný JSON - vykreslí se, co v nich zrovna je. */
function formatAnswer(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ano" : "Ne";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function RegistrationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();

  const registration = await prisma.seasonRegistration.findUnique({
    where: { id: params.id },
    include: {
      season: { select: { name: true } },
      reviewedBy: { select: { username: true } },
      entryFeeConfirmedBy: { select: { username: true } },
      character: {
        include: {
          user: { select: { username: true, email: true, discordNick: true } },
        },
      },
    },
  });

  if (!registration) {
    notFound();
  }

  const { character } = registration;
  const answers = (registration.formAnswers ?? {}) as Record<string, unknown>;
  const isPending = registration.status === "PENDING";
  const canReview = can(user?.role, "reviewRegistrations");
  const canConfirmFee = can(user?.role, "confirmEntryFee");

  return (
    <>
      <h1>{character.characterName}</h1>
      <p className="admin-subtitle">
        {registration.season.name} -{" "}
        <span className={REGISTRATION_STATUS_BADGES[registration.status]}>
          {REGISTRATION_STATUS_LABELS[registration.status]}
        </span>
      </p>

      <div className="card">
        <h2>Postava</h2>
        <dl className="detail">
          <dt>Jméno a realm</dt>
          <dd>
            {character.characterName} - {character.realm}
          </dd>
          <dt>Class</dt>
          <dd>{character.class ?? "-"}</dd>
          <dt>Role</dt>
          <dd>{SPEC_ROLE_LABELS[character.specRole]}</dd>
          <dt>RIO skóre</dt>
          <dd>{character.rioScore ?? "-"}</dd>
          <dt>Guilda</dt>
          <dd>{character.guildName ?? "-"}</dd>
          <dt>Frakce</dt>
          <dd>{character.faction ?? "-"}</dd>
          <dt>Raider.io</dt>
          <dd>
            <a className="link"
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
      </div>

      <div className="card">
        <h2>Uživatel</h2>
        <dl className="detail">
          <dt>Uživatelské jméno</dt>
          <dd>{character.user.username}</dd>
          <dt>Discord</dt>
          <dd>{character.user.discordNick ?? "-"}</dd>
          <dt>E-mail</dt>
          <dd>{character.user.email ?? "-"}</dd>
          <dt>Přihlášeno</dt>
          <dd>{formatDateTime(registration.createdAt)}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Odpovědi z formuláře</h2>
        {Object.keys(answers).length === 0 ? (
          <p className="empty-state">Formulář neobsahoval žádné odpovědi.</p>
        ) : (
          <dl className="detail">
            {Object.entries(answers).map(([key, value]) => (
              <div key={key} style={{ display: "contents" }}>
                <dt>{key}</dt>
                <dd>{formatAnswer(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {!isPending && (
        <div className="card">
          <h2>Rozhodnutí</h2>
          <dl className="detail">
            <dt>Vyřídil</dt>
            <dd>{registration.reviewedBy?.username ?? "-"}</dd>
            <dt>Kdy</dt>
            <dd>{formatDateTime(registration.reviewedAt)}</dd>
            {registration.rejectionReason && (
              <>
                <dt>Důvod zamítnutí</dt>
                <dd>{registration.rejectionReason}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <div className="card">
        <h2>Zápisné</h2>

        {registration.entryFeePaidAt ? (
          <>
            <dl className="detail">
              <dt>Stav</dt>
              <dd>
                <span className="badge badge-approved">Zaplaceno</span>
              </dd>
              <dt>Potvrdil</dt>
              <dd>{registration.entryFeeConfirmedBy?.username ?? "-"}</dd>
              <dt>Kdy</dt>
              <dd>{formatDateTime(registration.entryFeePaidAt)}</dd>
              {registration.entryFeeNote && (
                <>
                  <dt>Poznámka</dt>
                  <dd>{registration.entryFeeNote}</dd>
                </>
              )}
            </dl>

            {canConfirmFee && (
              <form action={revokeEntryFee}>
                <input type="hidden" name="registrationId" value={registration.id} />
                <SubmitButton
                  pendingLabel="Ruším..."
                  className="btn btn-danger"
                  confirmTitle="Zrušit potvrzení zápisného?"
                  confirm="Přihláška se vrátí mezi nezaplacené a hráč to uvidí na svém profilu."
                  confirmLabel="Zrušit potvrzení"
                >
                  Zrušit potvrzení
                </SubmitButton>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="card-lead">
              Zápisné se posílá ve hře, aplikace ho neumí ověřit sama. Potvrď ho,
              až zlato dorazí.
            </p>

            {canConfirmFee ? (
              <form action={confirmEntryFee}>
                <input type="hidden" name="registrationId" value={registration.id} />
                <div className="field">
                  <label htmlFor="entryFeeNote">Poznámka (nepovinné)</label>
                  <input
                    id="entryFeeNote"
                    name="entryFeeNote"
                    placeholder="Např. kolik a od koho přišlo"
                  />
                </div>
                <SubmitButton
                  className="btn btn-accent"
                  pendingLabel="Potvrzuji..."
                >
                  Potvrdit zápisné
                </SubmitButton>
              </form>
            ) : (
              <p className="empty-state">
                Zápisné potvrzuje moderátor nebo admin.
              </p>
            )}
          </>
        )}
      </div>

      {canReview && (
      <div className="card">
        <h2>{isPending ? "Posouzení" : "Oprava rozhodnutí"}</h2>

        {isPending ? (
          <>
            <form action={approveRegistration} style={{ marginBottom: "1.5rem" }}>
              <input type="hidden" name="registrationId" value={registration.id} />
              <SubmitButton
                className="btn btn-accent"
                pendingLabel="Schvaluji..."
              >
                Schválit registraci
              </SubmitButton>
            </form>

            <form action={rejectRegistration}>
              <input type="hidden" name="registrationId" value={registration.id} />
              <div className="field">
                <label htmlFor="rejectionReason">Důvod zamítnutí</label>
                <textarea
                  id="rejectionReason"
                  name="rejectionReason"
                  rows={3}
                  required
                />
              </div>
              <SubmitButton
                className="btn btn-danger"
                pendingLabel="Zamítám..."
                confirmTitle="Zamítnout registraci?"
                confirm="Hráč uvidí na svém profilu zamítnutí i důvod. Vrátit ji mezi čekající půjde."
                confirmLabel="Zamítnout registraci"
              >
                Zamítnout registraci
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={reopenRegistration}>
            <input type="hidden" name="registrationId" value={registration.id} />
            <p className="card-lead">
              Vrátí registraci mezi čekající, aby šla posoudit znovu.
            </p>
            <SubmitButton
              className="btn"
              pendingLabel="Vracím..."
            >
              Vrátit k posouzení
            </SubmitButton>
          </form>
        )}
      </div>
      )}

      <Link className="btn" href="/admin/registrations">
        Zpět na seznam
      </Link>
    </>
  );
}
