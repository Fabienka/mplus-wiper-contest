import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import {
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  formatDateTime,
  formatDuration,
  formatRange,
  formatTimeLimit,
  plural,
} from "@/lib/labels";
import { parseMonthParam, type CalendarEvent } from "@/lib/calendar";
import { MonthCalendar } from "../../month-calendar";
import { ConfirmButton } from "../confirm-button";
import {
  closeMatch,
  confirmMatch,
  reopenMatch,
  revokeMatch,
  setResultValidity,
} from "./actions";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "PROPOSED", label: "Ke schválení" },
  { value: "CONFIRMED", label: "Schválené" },
  { value: "COMPLETED", label: "Uzavřené" },
  { value: "ALL", label: "Vše" },
];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; status?: string; month?: string };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <h1>Termíny</h1>
        <p className="admin-subtitle">Zatím není založená žádná sezóna.</p>
      </>
    );
  }

  const activeFilter = FILTERS.some((f) => f.value === searchParams.status)
    ? (searchParams.status as string)
    : "PROPOSED";

  const matches = await prisma.match.findMany({
    where: {
      team: { seasonId: season.id },
      ...(activeFilter === "ALL"
        ? {}
        : { status: activeFilter as "PROPOSED" | "CONFIRMED" | "COMPLETED" }),
    },
    orderBy: { windowStart: "asc" },
    include: {
      team: { select: { name: true } },
      proposedBy: { select: { characterName: true } },
      confirmedBy: { select: { username: true } },
      results: { orderBy: { createdAt: "asc" } },
    },
  });

  const pending = await prisma.match.count({
    where: { team: { seasonId: season.id }, status: "PROPOSED" },
  });

  // Kalendář schválně ignoruje filtr - je to přehled, filtr patří k tabulce.
  const allMatches = await prisma.match.findMany({
    where: { team: { seasonId: season.id } },
    include: { team: { select: { name: true } }, proposedBy: { select: { characterName: true } } },
  });

  const month = parseMonthParam(searchParams.month);

  const calendarEvents: CalendarEvent[] = allMatches.map((match) => ({
    id: `match-${match.id}`,
    start: match.windowStart,
    end: match.windowEnd,
    kind:
      match.status === "PROPOSED"
        ? ("MATCH_PROPOSED" as const)
        : ("MATCH_CONFIRMED" as const),
    label: match.team.name,
    detail: `${match.team.name} - ${match.proposedBy.characterName} navrhl termín ${formatRange(
      match.windowStart,
      match.windowEnd
    )}`,
  }));

  return (
    <>
      <h1>Termíny</h1>
      <p className="admin-subtitle">{season.name}</p>

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

      {pending > 0 && (
        <div className="card">
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {pending} {plural(pending, "termín čeká", "termíny čekají", "termínů čeká")}{" "}
            na schválení.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Kalendář termínů</h2>
        <div className="cal-scroll">
          <MonthCalendar
            month={month}
            events={calendarEvents}
            basePath="/admin/matches"
            keepParams={{ status: searchParams.status }}
            legend={[
              { kind: "MATCH_CONFIRMED", label: "schválený" },
              { kind: "MATCH_PROPOSED", label: "čeká na schválení" },
            ]}
          />
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: "1.25rem" }}>
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            className={`btn${filter.value === activeFilter ? " btn-accent" : ""}`}
            href={`/admin/matches?status=${filter.value}&month=${searchParams.month ?? ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="card">
        {matches.length === 0 ? (
          <p className="empty-state">V tomto filtru nejsou žádné termíny.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>Tým</th>
                <th style={{ width: "26%" }}>Kdy</th>
                <th style={{ width: "10%" }}>Délka</th>
                <th style={{ width: "12%" }}>Stav</th>
                <th style={{ width: "14%" }}>Navrhl</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matches.flatMap((match) => [
                <tr key={match.id}>
                  <td>{match.team.name}</td>
                  <td>
                    {formatRange(match.windowStart, match.windowEnd)}
                    {match.note && (
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {match.note}
                      </div>
                    )}
                  </td>
                  <td>{formatDuration(match.windowStart, match.windowEnd)}</td>
                  <td>
                    <span className={MATCH_STATUS_BADGES[match.status]}>
                      {MATCH_STATUS_LABELS[match.status]}
                    </span>
                    {match.confirmedBy && (
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {match.confirmedBy.username}
                        {match.confirmedAt
                          ? `, ${formatDateTime(match.confirmedAt)}`
                          : ""}
                      </div>
                    )}
                  </td>
                  <td>{match.proposedBy.characterName}</td>
                  <td>
                    {match.status === "PROPOSED" && (
                      <form action={confirmMatch}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <button className="btn btn-accent" type="submit">
                          Schválit
                        </button>
                      </form>
                    )}

                    {match.status === "CONFIRMED" && (
                      <div className="row-actions" style={{ flexWrap: "wrap" }}>
                        <form action={closeMatch}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <ConfirmButton
                            className="btn btn-accent"
                            message="Uzavřít zápas? Tým už nebude moct nahrát další běh."
                          >
                            Uzavřít
                          </ConfirmButton>
                        </form>

                        {/* Zrušit schválení jde jen dokud u zápasu nejsou běhy -
                            jinak by výsledky visely na termínu, který neplatí. */}
                        {match.results.length === 0 && (
                          <form action={revokeMatch}>
                            <input type="hidden" name="matchId" value={match.id} />
                            <ConfirmButton
                              className="btn btn-danger"
                              message="Opravdu vrátit termín mezi návrhy?"
                            >
                              Zrušit schválení
                            </ConfirmButton>
                          </form>
                        )}
                      </div>
                    )}

                    {match.status === "COMPLETED" && (
                      <form action={reopenMatch}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <ConfirmButton
                          className="btn"
                          message="Znovu otevřít zápas, aby šly doplnit výsledky?"
                        >
                          Znovu otevřít
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>,

                /* Běhy se vypisují v samostatném řádku pod zápasem, ať se
                   hlavní tabulka nerozšiřuje o další sloupce. */
                match.results.length > 0 ? (
                  <tr key={`${match.id}-results`}>
                    <td colSpan={6} style={{ background: "var(--bg)" }}>
                      <strong style={{ fontSize: "0.82rem" }}>
                        Běhy ({match.results.length})
                      </strong>
                      <table className="data" style={{ marginTop: "0.4rem" }}>
                        <tbody>
                          {match.results.map((result) => (
                            <tr key={result.id}>
                              <td style={{ width: "26%" }}>
                                {result.dungeonName} +{result.keyLevel}
                              </td>
                              <td style={{ width: "12%" }}>
                                {formatTimeLimit(result.clearTimeSeconds)}
                              </td>
                              <td style={{ width: "12%" }}>
                                {result.points === null
                                  ? "-"
                                  : result.points.toFixed(1)}
                              </td>
                              <td style={{ width: "28%" }}>
                                {result.isOfficial ? (
                                  <span className="badge badge-approved">
                                    Počítá se
                                  </span>
                                ) : result.isValid ? (
                                  <span className="badge badge-pending">Platný</span>
                                ) : (
                                  <>
                                    <span className="badge badge-rejected">
                                      Neplatný
                                    </span>
                                    {result.invalidReason && (
                                      <div
                                        style={{
                                          color: "var(--muted)",
                                          fontSize: "0.76rem",
                                        }}
                                      >
                                        {result.invalidReason}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                              <td>
                                {match.status === "CONFIRMED" && (
                                  <form action={setResultValidity}>
                                    <input
                                      type="hidden"
                                      name="resultId"
                                      value={result.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="valid"
                                      value={result.isValid ? "0" : "1"}
                                    />
                                    <button className="btn" type="submit">
                                      {result.isValid ? "Zneplatnit" : "Uznat"}
                                    </button>
                                  </form>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
