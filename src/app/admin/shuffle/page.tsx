import Link from "next/link";
import { Notice } from "../../notice";
import { NoSeason } from "../no-season";
import { SubmitButton } from "../../submit-button";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { SPEC_ROLE_LABELS, formatDateTime } from "@/lib/labels";
import { LAST_VERIFIED } from "@/lib/wow-specs";
import type {
  ShuffleMember,
  StoredRuleViolations,
  StoredTeamAssignments,
} from "@/lib/shuffle";
import { applyVariant, runShuffleForSeason } from "./actions";
import { ActionNotice } from "../../action-notice";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shuffle – administrace",
};

function MemberRow({ member }: { member: ShuffleMember }) {
  return (
    <tr>
      <td>{SPEC_ROLE_LABELS[member.roleInTeam]}</td>
      <td>{member.characterName}</td>
      <td className="muted">
        {member.wowSpec ? `${member.className} - ${member.wowSpec}` : member.className ?? "-"}
      </td>
      <td>{member.dpsBucket ?? "-"}</td>
      <td>{Math.round(member.rioScore)}</td>
    </tr>
  );
}

export default async function ShufflePage({
  searchParams,
}: {
  searchParams: { error?: string; applied?: string };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <NoSeason title="Shuffle" />
      </>
    );
  }

  const [approved, latestRun, existingMemberships] = await Promise.all([
    prisma.seasonRegistration.findMany({
      where: { seasonId: season.id, status: "APPROVED" },
      include: { character: { select: { specRole: true } } },
    }),
    prisma.shuffleRun.findFirst({
      where: { seasonId: season.id },
      orderBy: { executedAt: "desc" },
      include: {
        executedBy: { select: { username: true } },
        proposals: { orderBy: { variantNumber: "asc" } },
      },
    }),
    prisma.teamMembership.count({ where: { seasonId: season.id } }),
  ]);

  const tanks = approved.filter((r) => r.character.specRole === "TANK").length;
  const healers = approved.filter((r) => r.character.specRole === "HEALER").length;
  const dps = approved.filter((r) => r.character.specRole === "DPS").length;
  const possibleTeams = Math.min(
    Math.floor(approved.length / 5),
    tanks,
    healers,
    Math.floor(dps / 3)
  );

  return (
    <>
      <h1>Shuffle</h1>
      <p className="admin-subtitle">{season.name}</p>

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.applied &&
          "Varianta byla použita - týmy a členství jsou založené."
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{tanks}</div>
          <div className="stat-label">Tanků</div>
        </div>
        <div className="stat">
          <div className="stat-value">{healers}</div>
          <div className="stat-label">Healerů</div>
        </div>
        <div className="stat">
          <div className="stat-value">{dps}</div>
          <div className="stat-label">DPS</div>
        </div>
        <div className="stat">
          <div className="stat-value">{possibleTeams}</div>
          <div className="stat-label">Vyjde týmů</div>
        </div>
      </div>

      <div className="card">
        <h2>Spustit shuffle</h2>
        <p className="card-lead">
          Rozdělí schválené hráče do týmů po 5 a navrhne 3 varianty. Nic se tím
          nemění - týmy vzniknou až potvrzením vybrané varianty. Tabulka speců
          (ranged/melee, battle rez, bloodlust) byla naposledy ověřená{" "}
          {LAST_VERIFIED}.
        </p>

        {possibleTeams === 0 ? (
          <p className="empty-state">
            Ze schválených registrací nejde složit ani jeden kompletní tým
            (potřeba aspoň 1 tank, 1 healer a 3 DPS).
          </p>
        ) : (
          <form action={runShuffleForSeason}>
            <input type="hidden" name="seasonId" value={season.id} />
            <SubmitButton
              className="btn btn-accent"
              pendingLabel="Počítám varianty..."
            >
              Spustit shuffle
            </SubmitButton>
          </form>
        )}
      </div>

      {/* Upozornění, ne běžná karta - je to překážka, o kterou se admin
          zarazí až po spuštění shufflu, když bude chtít variantu použít. */}
      {existingMemberships > 0 && (
        <Notice kind="info" title="Týmy už jsou rozdělené">
          Sezóna má {existingMemberships} členství. Rozdělení jde ručně doladit
          nebo celé smazat na stránce Týmy - teprve pak půjde použít jiná
          varianta. Přepsat ho rovnou by zahodilo i navázané zápasy.
          <p style={{ margin: "0.75rem 0 0" }}>
            <Link className="btn" href="/admin/teams">
              Přejít na týmy
            </Link>
          </p>
        </Notice>
      )}

      {!latestRun ? (
        <div className="card">
          <h2>Návrhy</h2>
          <p className="empty-state">Shuffle zatím neproběhl.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Poslední běh</h2>
            <dl className="detail">
              <dt>Spuštěn</dt>
              <dd>{formatDateTime(latestRun.executedAt)}</dd>
              <dt>Kdo</dt>
              <dd>{latestRun.executedBy.username}</dd>
              <dt>Stav</dt>
              <dd>{latestRun.status === "APPLIED" ? "Použitý" : "Návrh"}</dd>
              <dt>Seed</dt>
              <dd>{latestRun.seed ?? "-"}</dd>
            </dl>

            {(() => {
              const warnings =
                (latestRun.proposals[0]?.ruleViolations as unknown as StoredRuleViolations)
                  ?.warnings ?? [];

              if (warnings.length === 0) return null;

              return (
                <div style={{ marginTop: "1rem" }}>
                  <strong style={{ fontSize: "0.9rem" }}>Upozornění k běhu</strong>
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
                    {warnings.map((warning) => (
                      <li
                        key={warning}
                        style={{ fontSize: "0.85rem", color: "var(--muted)" }}
                      >
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>

          {latestRun.proposals.map((proposal) => {
            const assignments =
              proposal.teamAssignments as unknown as StoredTeamAssignments;
            const violations =
              proposal.ruleViolations as unknown as StoredRuleViolations;
            const breakdown = violations?.breakdown;

            return (
              <div className="card" key={proposal.id}>
                <h2>
                  Varianta {proposal.variantNumber}
                  {proposal.variantNumber === 1 && " - doporučená"}
                </h2>

                <p className="card-lead">
                  Skóre {Math.round(proposal.score)} (nižší je lepší).
                  {breakdown && (
                    <>
                      {" "}
                      Porušení pravidel po týmech: pokrytí košů{" "}
                      {breakdown.dpsBucketCoverage}×, poměr melee/ranged{" "}
                      {breakdown.rangedMeleeBalance}×, battle rez/bloodlust{" "}
                      {breakdown.battleRezOrBloodlust}×, stejná class u DPS{" "}
                      {breakdown.duplicateDpsClass}×.
                    </>
                  )}
                </p>

                {assignments.teams.map((team) => (
                  <div key={team.teamIndex} style={{ marginBottom: "1.5rem" }}>
                    <strong style={{ fontSize: "0.95rem" }}>
                      Tým {team.teamIndex + 1}
                    </strong>

                    <table className="data" style={{ marginTop: "0.5rem" }}>
                      <thead>
                        <tr>
                          <th scope="col" style={{ width: "14%" }}>Role</th>
                          <th scope="col" style={{ width: "26%" }}>Postava</th>
                          <th scope="col" style={{ width: "34%" }}>Class / spec</th>
                          <th scope="col" style={{ width: "12%" }}>Koš</th>
                          <th scope="col" style={{ width: "14%" }}>RIO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.members.map((member) => (
                          <MemberRow key={member.characterId} member={member} />
                        ))}
                      </tbody>
                    </table>

                    {team.violations.length > 0 && (
                      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
                        {team.violations.map((violation) => (
                          <li className="meta"
                            key={violation}
                          >
                            {violation}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {assignments.substitutes.length > 0 && (
                  <div style={{ marginBottom: "1.5rem" }}>
                    <strong style={{ fontSize: "0.95rem" }}>
                      Náhradníci ({assignments.substitutes.length})
                    </strong>
                    <table className="data" style={{ marginTop: "0.5rem" }}>
                      <thead>
                        <tr>
                          <th scope="col" style={{ width: "14%" }}>Role</th>
                          <th scope="col" style={{ width: "26%" }}>Postava</th>
                          <th scope="col" style={{ width: "34%" }}>Class / spec</th>
                          <th scope="col" style={{ width: "12%" }}>Koš</th>
                          <th scope="col" style={{ width: "14%" }}>RIO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.substitutes.map((member) => (
                          <MemberRow key={member.characterId} member={member} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Rozhoduje skutečný stav, ne stav běhu - po smazání týmů jde
                    použít i variantu z běhu, který už jednou použitý byl. */}
                {existingMemberships === 0 && (
                  <form>
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <SubmitButton
                      pendingLabel="Zakládám týmy..."
                      className="btn btn-accent"
                      confirmTitle={`Použít variantu ${proposal.variantNumber}?`}
                      confirm="Podle ní se založí týmy a členství. Jinou variantu půjde použít, až tyhle týmy smažeš."
                      confirmLabel="Použít variantu"
                      formAction={applyVariant}
                    >
                      Použít tuto variantu
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
