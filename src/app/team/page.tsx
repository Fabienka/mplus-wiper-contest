import { prisma } from "@/lib/prisma";
import { getMyTeamContext } from "@/lib/team";
import { findOverlaps, type MemberSlots, type Overlap } from "@/lib/availability";
import { parseMonthParam, type CalendarEvent } from "@/lib/calendar";
import { MonthCalendar } from "../month-calendar";
import {
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDuration,
  formatRange,
  formatTimeLimit,
  toDateTimeLocal,
} from "@/lib/labels";
import { ConfirmButton } from "../admin/confirm-button";
import {
  addAvailability,
  addRunResult,
  deleteAvailability,
  deleteMatch,
  proposeMatch,
} from "./actions";

export const dynamic = "force-dynamic";

/** Nejdřív se hledá termín pro celý tým, pak se povolí chybějící hráči. */
const FALLBACK_STEPS = [0, 1, 2];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; month?: string; day?: string };
}) {
  const context = await getMyTeamContext();

  if (!context) {
    return (
      <div className="site-main">
        <h1>Můj tým</h1>
        <p className="error-text">Nejsi přihlášený.</p>
      </div>
    );
  }

  const { character, membership } = context;

  if (!character) {
    return (
      <div className="site-main">
        <h1>Můj tým</h1>
        <p className="empty-state">
          K účtu není přiřazená žádná postava. Projdi nejdřív registrací.
        </p>
      </div>
    );
  }

  if (!membership?.team) {
    return (
      <div className="site-main">
        <h1>Můj tým</h1>
        <div className="card">
          <p className="empty-state" style={{ margin: 0 }}>
            {membership?.status === "SUBSTITUTE"
              ? "Jsi vedený jako náhradník, zatím nejsi v žádném týmu."
              : "Ještě nejsi zařazený do týmu. Týmy vzniknou po rozdělení."}
          </p>
        </div>
      </div>
    );
  }

  const team = membership.team;
  const teamCharacterIds = team.members.map((m) => m.characterId);

  const [availabilities, matches] = await Promise.all([
    prisma.availability.findMany({
      where: {
        seasonId: membership.seasonId,
        characterId: { in: teamCharacterIds },
        // Minulé termíny jen zabírají místo.
        end: { gte: new Date() },
      },
      orderBy: { start: "asc" },
    }),
    prisma.match.findMany({
      where: { teamId: team.id },
      orderBy: { windowStart: "asc" },
      include: {
        proposedBy: { select: { characterName: true } },
        confirmedBy: { select: { username: true } },
        results: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  const mySlots = availabilities.filter((a) => a.characterId === character.id);

  const memberSlots: MemberSlots[] = team.members.map((member) => ({
    characterId: member.characterId,
    characterName: member.character.characterName,
    slots: availabilities
      .filter((a) => a.characterId === member.characterId)
      .map((a) => ({ start: a.start, end: a.end })),
  }));

  // Nejdřív termín pro celý tým; když žádný není, povolí se postupně chybějící
  // hráči, ať stránka neukáže prázdno, když se jeden člověk nezapsal.
  let overlaps: Overlap[] = [];
  let overlapMissing = 0;

  for (const step of FALLBACK_STEPS) {
    const needed = team.members.length - step;
    if (needed < 2) break;

    overlaps = findOverlaps(memberSlots, needed, { minDurationMinutes: 30 });
    if (overlaps.length > 0) {
      overlapMissing = step;
      break;
    }
  }

  const month = parseMonthParam(searchParams.month);

  // Do kalendáře jdou termíny, vlastní časy a překryvy celého týmu. Překryvy
  // s chybějícími hráči se nezobrazují, ať kalendář nezaplní skoro-termíny.
  const fullTeamOverlaps =
    overlapMissing === 0
      ? overlaps
      : findOverlaps(memberSlots, team.members.length, { minDurationMinutes: 30 });

  const calendarEvents: CalendarEvent[] = [
    ...matches.map((match) => ({
      id: `match-${match.id}`,
      start: match.windowStart,
      end: match.windowEnd,
      kind:
        match.status === "PROPOSED"
          ? ("MATCH_PROPOSED" as const)
          : ("MATCH_CONFIRMED" as const),
      label: match.proposedBy.characterName,
      detail: `${match.proposedBy.characterName} navrhl termín ${formatRange(
        match.windowStart,
        match.windowEnd
      )} - ${MATCH_STATUS_LABELS[match.status].toLowerCase()}`,
    })),
    ...fullTeamOverlaps.map((overlap) => ({
      id: `overlap-${overlap.start.toISOString()}`,
      start: overlap.start,
      end: overlap.end,
      kind: "OVERLAP" as const,
      label: "může tým",
      detail: `Celý tým může ${formatRange(overlap.start, overlap.end)}`,
    })),
    ...mySlots.map((slot) => ({
      id: `slot-${slot.id}`,
      start: slot.start,
      end: slot.end,
      kind: "AVAILABILITY" as const,
      label: "můj čas",
      detail: `Zadal jsi si čas ${formatRange(slot.start, slot.end)}${
        slot.note ? ` (${slot.note})` : ""
      }`,
    })),
  ];

  const whoIsMissing = (ids: string[]) =>
    team.members
      .filter((m) => !ids.includes(m.characterId))
      .map((m) => m.character.characterName);

  return (
    <div className="site-main site-main-wide">
      <h1>{team.name}</h1>
      <p className="admin-subtitle">
        {team.members.length} hráčů - hraješ {SPEC_ROLE_LABELS[membership.roleInTeam]}
      </p>

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
            Uloženo.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Kalendář</h2>
        <MonthCalendar
          month={month}
          events={calendarEvents}
          basePath="/team"
          selectedDay={searchParams.day}
          legend={[
            { kind: "MATCH_CONFIRMED", label: "schválený termín" },
            { kind: "MATCH_PROPOSED", label: "navržený termín" },
            { kind: "OVERLAP", label: "může celý tým" },
            { kind: "AVAILABILITY", label: "můj čas" },
          ]}
        />
      </div>

      <div className="card">
        <h2>Kdy mám čas</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
          Zadej úseky, kdy se ti dá hrát. Ze zadaných časů celého týmu se pak
          vybere společný termín.
        </p>

        {mySlots.length === 0 ? (
          <p className="empty-state">Zatím nemáš zadaný žádný čas.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Kdy</th>
                <th style={{ width: "14%" }}>Délka</th>
                <th style={{ width: "30%" }}>Poznámka</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mySlots.map((slot) => (
                <tr key={slot.id}>
                  <td>{formatRange(slot.start, slot.end)}</td>
                  <td>{formatDuration(slot.start, slot.end)}</td>
                  <td style={{ color: "var(--muted)" }}>{slot.note ?? "-"}</td>
                  <td>
                    <form action={deleteAvailability}>
                      <input type="hidden" name="availabilityId" value={slot.id} />
                      <button className="btn btn-danger" type="submit">
                        Smazat
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={addAvailability} style={{ marginTop: "1.25rem" }}>
          <div className="row-actions" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="start">Od</label>
              <input id="start" name="start" type="datetime-local" required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="end">Do</label>
              <input id="end" name="end" type="datetime-local" required />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="note">Poznámka (nepovinné)</label>
              <input id="note" name="note" placeholder="Např. po 22:00 už jen možná" />
            </div>
            <button className="btn btn-accent" type="submit">
              Přidat
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Kdy může tým</h2>

        {overlaps.length === 0 ? (
          <p className="empty-state">
            Zatím se nenašel žádný společný čas. Chce to, aby si víc lidí zadalo
            své termíny.
          </p>
        ) : (
          <>
            {overlapMissing > 0 && (
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
                Termín, kdy může celý tým, se nenašel. Níže jsou nejbližší
                možnosti, kde chybí nejvýš {overlapMissing} z týmu.
              </p>
            )}

            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: "32%" }}>Kdy</th>
                  <th style={{ width: "12%" }}>Délka</th>
                  <th style={{ width: "12%" }}>Volných</th>
                  <th style={{ width: "26%" }}>Chybí</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overlaps.map((overlap) => {
                  const missing = whoIsMissing(overlap.characterIds);
                  const key = `${overlap.start.toISOString()}-${overlap.end.toISOString()}`;

                  return (
                    <tr key={key}>
                      <td>{formatRange(overlap.start, overlap.end)}</td>
                      <td>{formatDuration(overlap.start, overlap.end)}</td>
                      <td>
                        {overlap.characterIds.length} / {team.members.length}
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {missing.length === 0 ? "nikdo" : missing.join(", ")}
                      </td>
                      <td>
                        <form action={proposeMatch}>
                          <input
                            type="hidden"
                            name="start"
                            value={toDateTimeLocal(overlap.start)}
                          />
                          <input
                            type="hidden"
                            name="end"
                            value={toDateTimeLocal(overlap.end)}
                          />
                          <button className="btn" type="submit">
                            Navrhnout termín
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2>Termíny týmu</h2>

        {matches.length === 0 ? (
          <p className="empty-state">Zatím není navržený žádný termín.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: "32%" }}>Kdy</th>
                <th style={{ width: "14%" }}>Stav</th>
                <th style={{ width: "18%" }}>Navrhl</th>
                <th style={{ width: "18%" }}>Schválil</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={match.id}>
                  <td>
                    {formatRange(match.windowStart, match.windowEnd)}
                    {match.note && (
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {match.note}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={MATCH_STATUS_BADGES[match.status]}>
                      {MATCH_STATUS_LABELS[match.status]}
                    </span>
                  </td>
                  <td>{match.proposedBy.characterName}</td>
                  <td style={{ color: "var(--muted)" }}>
                    {match.confirmedBy?.username ?? "-"}
                  </td>
                  <td>
                    {match.status === "PROPOSED" && (
                      <form action={deleteMatch}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <ConfirmButton
                          className="btn btn-danger"
                          message="Opravdu zrušit tenhle návrh termínu?"
                        >
                          Zrušit
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Výsledky</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
          Po odehrání vlož odkaz na běh z Raider.io. Čas i sestavu si aplikace
          stáhne sama, takže se nedá překlepnout. Počítá se jen nejlepší platný
          běh - neúspěšný pokus o vyšší klíč vás o dřívější výsledek nepřipraví.
        </p>

        {matches.filter((m) => m.status === "CONFIRMED").length === 0 ? (
          <p className="empty-state">
            Výsledky jdou nahrávat až ke schválenému termínu.
          </p>
        ) : (
          matches
            .filter((m) => m.status === "CONFIRMED")
            .map((match) => (
              <div key={match.id} style={{ marginBottom: "1.5rem" }}>
                <strong style={{ fontSize: "0.95rem" }}>
                  {formatRange(match.windowStart, match.windowEnd)}
                </strong>

                {match.results.length === 0 ? (
                  <p className="empty-state" style={{ padding: "0.75rem 0" }}>
                    Zatím žádný běh.
                  </p>
                ) : (
                  <table className="data" style={{ marginTop: "0.5rem" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "30%" }}>Dungeon</th>
                        <th style={{ width: "10%" }}>Klíč</th>
                        <th style={{ width: "14%" }}>Čas</th>
                        <th style={{ width: "14%" }}>Body</th>
                        <th>Stav</th>
                      </tr>
                    </thead>
                    <tbody>
                      {match.results.map((result) => (
                        <tr key={result.id}>
                          <td>{result.dungeonName}</td>
                          <td>+{result.keyLevel}</td>
                          <td>{formatTimeLimit(result.clearTimeSeconds)}</td>
                          <td>
                            {result.points === null ? "-" : result.points.toFixed(1)}
                          </td>
                          <td>
                            {result.isOfficial ? (
                              <span className="badge badge-approved">Počítá se</span>
                            ) : result.isValid ? (
                              <span className="badge badge-pending">Platný</span>
                            ) : (
                              <>
                                <span className="badge badge-rejected">Nepočítá se</span>
                                {result.invalidReason && (
                                  <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                                    {result.invalidReason}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <form action={addRunResult} style={{ marginTop: "0.75rem" }}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <div className="row-actions" style={{ alignItems: "flex-end" }}>
                    <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                      <label htmlFor={`run-${match.id}`}>Odkaz na běh</label>
                      <input
                        id={`run-${match.id}`}
                        name="runUrl"
                        placeholder="https://raider.io/mythic-plus-runs/..."
                        required
                      />
                    </div>
                    <button className="btn btn-accent" type="submit">
                      Nahrát výsledek
                    </button>
                  </div>
                </form>
              </div>
            ))
        )}
      </div>

      <div className="card">
        <h2>Navrhnout vlastní termín</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
          Když se tým domluví jinde, jde termín zadat rovnou. Schvaluje ho
          moderátor.
        </p>
        <form action={proposeMatch}>
          <div className="row-actions" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="match-start">Od</label>
              <input id="match-start" name="start" type="datetime-local" required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="match-end">Do</label>
              <input id="match-end" name="end" type="datetime-local" required />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="match-note">Poznámka (nepovinné)</label>
              <input id="match-note" name="note" placeholder="Např. sraz na Discordu" />
            </div>
            <button className="btn btn-accent" type="submit">
              Navrhnout
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Sestava</h2>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Postava</th>
              <th style={{ width: "34%" }}>Class / spec</th>
              <th style={{ width: "18%" }}>Role</th>
              <th>Zadaných časů</th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((member) => (
              <tr key={member.id}>
                <td>
                  {member.character.characterName}
                  {member.characterId === character.id && (
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {" "}
                      (ty)
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--muted)" }}>
                  {member.character.wowSpec
                    ? `${member.character.class} - ${member.character.wowSpec}`
                    : member.character.class ?? "-"}
                </td>
                <td>{SPEC_ROLE_LABELS[member.roleInTeam]}</td>
                <td>
                  {
                    availabilities.filter((a) => a.characterId === member.characterId)
                      .length
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
