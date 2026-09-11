import Link from "next/link";
import { NoSeason } from "../no-season";
import { SubmitButton } from "../../submit-button";
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
import { isAwaitingVerification } from "@/lib/manual-result";
import { MatchAuthor } from "../../match-author";
import { matchAuthorText } from "@/lib/match-author";
import { DEFAULT_SCORING_CONFIG, parseScoringConfig } from "@/lib/scoring";
import { OVER_TIME_LIMIT_REASON, budgetRunsOf, computeTimeBudget } from "@/lib/time-budget";
import { TimeBudgetLine } from "../../time-budget-line";
import { ActionNotice } from "../../action-notice";
import {
  closeMatch,
  confirmMatch,
  reopenMatch,
  revokeMatch,
  setResultValidity,
  setTimeLimitOverride,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Termíny – administrace",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "PROPOSED", label: "Ke schválení" },
  { value: "CONFIRMED", label: "Schválené" },
  { value: "COMPLETED", label: "Uzavřené" },
  { value: "ALL", label: "Vše" },
];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: {
    error?: string;
    saved?: string;
    status?: string;
    month?: string;
    day?: string;
  };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <NoSeason title="Termíny" />
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
      team: { select: { id: true, name: true } },
      proposedBy: { select: { characterName: true, class: true } },
      createdBy: { select: { username: true } },
      confirmedBy: { select: { username: true } },
      // Ze screenshotu jen id na odkaz - samotný obrázek se tahá zvlášť.
      results: {
        orderBy: { createdAt: "asc" },
        include: { screenshot: { select: { id: true } } },
      },
    },
  });

  const pending = await prisma.match.count({
    where: { team: { seasonId: season.id }, status: "PROPOSED" },
  });

  // Kalendář schválně ignoruje filtr - je to přehled, filtr patří k tabulce.
  const allMatches = await prisma.match.findMany({
    where: { team: { seasonId: season.id } },
    include: {
      team: { select: { name: true } },
      proposedBy: { select: { characterName: true } },
      createdBy: { select: { username: true } },
    },
  });

  const month = parseMonthParam(searchParams.month);

  // Rozbité nastavení sezóny nesmí shodit stránku - platí výchozí herní čas.
  let timeBudgetMinutes = DEFAULT_SCORING_CONFIG.timeBudgetMinutes;
  try {
    timeBudgetMinutes = parseScoringConfig(season.scoringConfig).timeBudgetMinutes;
  } catch {
    timeBudgetMinutes = DEFAULT_SCORING_CONFIG.timeBudgetMinutes;
  }

  const calendarEvents: CalendarEvent[] = allMatches.map((match) => ({
    id: `match-${match.id}`,
    start: match.windowStart,
    end: match.windowEnd,
    kind:
      match.status === "PROPOSED"
        ? ("MATCH_PROPOSED" as const)
        : ("MATCH_CONFIRMED" as const),
    label: match.team.name,
    detail: `${match.team.name} - ${matchAuthorText(match).name} ${matchAuthorText(match).verb} termín ${formatRange(
      match.windowStart,
      match.windowEnd
    )}`,
  }));

  return (
    <>
      <h1>Termíny</h1>
      <p className="admin-subtitle">{season.name}</p>

      <ActionNotice
        error={searchParams.error}
        success={searchParams.saved && "Termín uložený."}
      />

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
        <MonthCalendar
          month={month}
          events={calendarEvents}
          basePath="/admin/matches"
          keepParams={{ status: searchParams.status }}
          selectedDay={searchParams.day}
          legend={[
            { kind: "MATCH_CONFIRMED", label: "schválený" },
            { kind: "MATCH_PROPOSED", label: "čeká na schválení" },
          ]}
        />
      </div>

      <div className="row-actions" style={{ marginBottom: "1.25rem" }}>
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            className={`btn${filter.value === activeFilter ? " btn-accent" : ""}`}
            href={`/admin/matches?status=${filter.value}&month=${
              searchParams.month ?? ""
            }&day=${searchParams.day ?? ""}`}
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
                <th scope="col" style={{ width: "16%" }}>Tým</th>
                <th scope="col" style={{ width: "26%" }}>Kdy</th>
                <th scope="col" style={{ width: "10%" }}>Délka</th>
                <th scope="col" style={{ width: "12%" }}>Stav</th>
                <th scope="col" style={{ width: "14%" }}>Navrhl</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {matches.flatMap((match) => [
                <tr key={match.id}>
                  <td>
                    <Link className="link" href={`/admin/teams/${match.team.id}`}>
                      {match.team.name}
                    </Link>
                  </td>
                  <td>
                    {formatRange(match.windowStart, match.windowEnd)}
                    {match.note && (
                      <div className="meta">
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
                      <div className="meta">
                        {match.confirmedBy.username}
                        {match.confirmedAt
                          ? `, ${formatDateTime(match.confirmedAt)}`
                          : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    <MatchAuthor match={match} />
                  </td>
                  <td>
                    {match.status === "PROPOSED" && (
                      <form action={confirmMatch}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <SubmitButton
                          className="btn btn-accent"
                          pendingLabel="Schvaluji..."
                        >
                          Schválit
                        </SubmitButton>
                      </form>
                    )}

                    {match.status === "CONFIRMED" && (
                      <div className="row-actions" style={{ flexWrap: "wrap" }}>
                        <form action={closeMatch}>
                          <input type="hidden" name="matchId" value={match.id} />
                          <SubmitButton
                            pendingLabel="Uzavírám..."
                            className="btn btn-accent"
                            confirmTitle="Uzavřít zápas?"
                            confirm="Tým už k němu nenahraje další běh. Znovu otevřít ho půjde."
                            confirmLabel="Uzavřít zápas"
                          >
                            Uzavřít
                          </SubmitButton>
                        </form>

                        {/* Zrušit schválení jde jen dokud u zápasu nejsou běhy -
                            jinak by výsledky visely na termínu, který neplatí. */}
                        {match.results.length === 0 && (
                          <form action={revokeMatch}>
                            <input type="hidden" name="matchId" value={match.id} />
                            <SubmitButton
                              pendingLabel="Ruším..."
                              className="btn btn-danger"
                              confirmTitle="Zrušit schválení termínu?"
                              confirm="Termín se vrátí mezi návrhy a bude čekat na nové schválení."
                              confirmLabel="Zrušit schválení"
                            >
                              Zrušit schválení
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    )}

                    {match.status === "COMPLETED" && (
                      <form action={reopenMatch}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <SubmitButton
                          pendingLabel="Otevírám..."
                          className="btn"
                          confirmTitle="Znovu otevřít zápas?"
                          confirm="Tým bude moct doplnit další běhy a přepsat tím svůj nejlepší výsledek."
                          confirmLabel="Otevřít zápas"
                        >
                          Znovu otevřít
                        </SubmitButton>
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
                      <TimeBudgetLine
                        budget={computeTimeBudget(
                          budgetRunsOf(match.results),
                          timeBudgetMinutes * 60
                        )}
                      />
                      <table className="data" style={{ marginTop: "0.4rem" }}>
                        <tbody>
                          {match.results.map((result) => (
                            <tr key={result.id}>
                              <td style={{ width: "26%" }}>
                                {result.dungeonName} +{result.keyLevel}
                                {result.screenshot && (
                                  <div className="meta">
                                    zadáno ručně -{" "}
                                    <a
                                      href={`/team/screenshot/${result.screenshot.id}`}
                                      target="_blank"
                                      rel="noopener"
                                    >
                                      otevřít screenshot
                                    </a>
                                  </div>
                                )}
                                {!result.countsTowardTimeLimit && (
                                  <div className="meta">do herního času se nepočítá</div>
                                )}
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
                                  <>
                                    <span className="badge badge-approved">
                                      Počítá se
                                    </span>
                                    {result.overTimeLimit && result.timeLimitOverride && (
                                      <div className="meta">Uznáno i přes herní čas.</div>
                                    )}
                                  </>
                                ) : result.abandoned ? (
                                  <>
                                    <span className="badge badge-rejected">Vzdáno</span>
                                    <div className="meta">
                                      Tým pokus vzdal - čas se odečetl z herního času.
                                    </div>
                                  </>
                                ) : result.overTimeLimit && !result.timeLimitOverride ? (
                                  <>
                                    <span className="badge badge-rejected">
                                      Přes herní čas
                                    </span>
                                    <div className="meta">{OVER_TIME_LIMIT_REASON}</div>
                                  </>
                                ) : isAwaitingVerification(result) ? (
                                  <>
                                    <span className="badge badge-pending">
                                      Čeká na ověření
                                    </span>
                                    {/* Co našla automatická kontrola - moderátor
                                        to vidí dřív, než běh uzná. */}
                                    {result.invalidReason && (
                                      <div className="meta">{result.invalidReason}</div>
                                    )}
                                  </>
                                ) : result.isValid ? (
                                  <span className="badge badge-pending">Platný</span>
                                ) : (
                                  <>
                                    <span className="badge badge-rejected">
                                      Neplatný
                                    </span>
                                    {result.invalidReason && (
                                      <div className="meta"
                                      >
                                        {result.invalidReason}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                              <td>
                                {/* Ručně zadaný běh čeká na rozhodnutí - obě
                                    tlačítka, ať neověřený běh nevisí napořád
                                    jen proto, že je už teď neplatný. */}
                                {match.status === "CONFIRMED" &&
                                  isAwaitingVerification(result) && (
                                    <div className="row-actions" style={{ flexWrap: "wrap" }}>
                                      <form action={setResultValidity}>
                                        <input type="hidden" name="resultId" value={result.id} />
                                        <input type="hidden" name="valid" value="1" />
                                        <SubmitButton className="btn btn-accent" pendingLabel="Uznávám...">
                                          Uznat
                                        </SubmitButton>
                                      </form>
                                      <form action={setResultValidity}>
                                        <input type="hidden" name="resultId" value={result.id} />
                                        <input type="hidden" name="valid" value="0" />
                                        <input
                                          type="hidden"
                                          name="note"
                                          value="Moderátor běh podle screenshotu neuznal."
                                        />
                                        <SubmitButton
                                          className="btn btn-danger"
                                          pendingLabel="Zamítám..."
                                          confirmTitle="Zamítnout ručně zadaný běh?"
                                          confirm="Běh zůstane u zápasu jako neplatný. Uznat ho půjde i později."
                                          confirmLabel="Zamítnout"
                                        >
                                          Zamítnout
                                        </SubmitButton>
                                      </form>
                                    </div>
                                  )}

                                {/* Vzdaný pokus se nepočítá nikdy - není o čem rozhodovat. */}
                                {match.status === "CONFIRMED" &&
                                  !isAwaitingVerification(result) &&
                                  !result.abandoned && (
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

                                {match.status === "CONFIRMED" &&
                                  result.overTimeLimit &&
                                  !result.abandoned && (
                                    <form
                                      action={setTimeLimitOverride}
                                      style={{ marginTop: "0.35rem" }}
                                    >
                                      <input type="hidden" name="resultId" value={result.id} />
                                      <input
                                        type="hidden"
                                        name="allow"
                                        value={result.timeLimitOverride ? "0" : "1"}
                                      />
                                      <SubmitButton className="btn" pendingLabel="Ukládám...">
                                        {result.timeLimitOverride
                                          ? "Zrušit uznání přes limit"
                                          : "Uznat i přes limit"}
                                      </SubmitButton>
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
