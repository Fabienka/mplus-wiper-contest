import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/admin";
import { parseMonthParam } from "@/lib/calendar";
import { formatDateTime } from "@/lib/labels";
import { MonthCalendar } from "../../../month-calendar";
import { SectionNav } from "../../../section-nav";
import { SubmitButton } from "../../../submit-button";
import { ActionNotice } from "../../../action-notice";
import {
  buildTeamCalendarEvents,
  findTeamOverlaps,
  loadTeamData,
} from "../../../team/team-data";
import {
  MatchesCard,
  RerollCard,
  ResultsCard,
  RosterCard,
} from "../../../team/team-cards";
import {
  addTeamNote,
  pauseMatchTimer,
  resetMatchTimer,
  staffAddManualResult,
  staffAddMatch,
  staffAddRunResult,
  startMatchTimer,
} from "../actions";
import { MatchTimer } from "../match-timer";
import { DateTimeField } from "../../../date-time-field";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Detail týmu – administrace",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  "manual-verified": "Běh je uložený a rovnou ověřený.",
  abandoned: "Vzdaný pokus je zapsaný, jeho čas se odečetl z herního času zápasu.",
  note: "Poznámka je přidaná.",
  match: "Termín je přidaný a rovnou schválený.",
};

/**
 * Detail týmu pro admina a moderátora - stejné karty jako Můj tým, ale
 * pohledem zvenku: za tým jde nahrát běh (z Raider.io i ručně) a psát
 * neveřejné poznámky. Hráčské formuláře (vlastní časy, návrh termínu, zápis
 * rerollu) tu nejsou - patří hráčům.
 *
 * Admin i moderátor můžou mít vlastní tým. Ten spravují na Můj tým jako
 * hráči; tady ho vidí stejně jako každý jiný tým.
 */
export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string; month?: string; day?: string };
}) {
  const [team, user] = await Promise.all([
    prisma.team.findUnique({
      where: { id: params.id },
      include: {
        season: { select: { name: true } },
        members: {
          where: { status: "ACTIVE" },
          include: {
            character: {
              select: { id: true, characterName: true, class: true, wowSpec: true },
            },
          },
        },
      },
    }),
    getCurrentUser(),
  ]);

  if (!team) {
    notFound();
  }

  const [data, notes, viewerCharacter] = await Promise.all([
    loadTeamData(team),
    prisma.teamNote.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { username: true } } },
    }),
    user
      ? prisma.character.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null,
  ]);

  const viewerCharacterId = viewerCharacter?.id ?? null;

  // Časovač si podle toho srovná hodiny prohlížeče se serverem.
  const serverNow = new Date().toISOString();
  const isOwnTeam = team.members.some((m) => m.characterId === viewerCharacterId);

  const { fullTeamOverlaps } = findTeamOverlaps(team.members, data.availabilities);

  // Pohled zvenku: všechny časy jako časy hráčů, i když je v týmu i ten,
  // kdo se dívá.
  const calendarEvents = buildTeamCalendarEvents({
    matches: data.matches,
    availabilities: data.availabilities,
    members: team.members,
    fullTeamOverlaps,
    viewerCharacterId: null,
  });

  return (
    <>
      <p style={{ margin: "0 0 0.5rem" }}>
        <Link className="link" href="/admin/teams">
          ← Všechny týmy
        </Link>
      </p>
      <h1>{team.name}</h1>
      <p className="admin-subtitle">
        {team.season.name} - {team.members.length} hráčů
        {isOwnTeam && " - v tomhle týmu hraješ i ty"}
      </p>

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.saved && (SUCCESS_MESSAGES[searchParams.saved] ?? "Uloženo.")
        }
      />

      <SectionNav
        items={[
          { id: "sestava", label: "Sestava" },
          { id: "kalendar", label: "Kalendář" },
          { id: "terminy", label: "Termíny" },
          { id: "novy-termin", label: "Přidat termín" },
          { id: "reroll", label: "Reroll" },
          { id: "vysledky", label: "Výsledky" },
          { id: "poznamky", label: "Poznámky" },
        ]}
      />

      <RosterCard
        members={team.members}
        availabilities={data.availabilities}
        viewerCharacterId={viewerCharacterId}
      />

      <section className="card" id="kalendar" aria-labelledby="kalendar-nadpis">
        <h2 id="kalendar-nadpis">Kalendář</h2>
        <MonthCalendar
          month={parseMonthParam(searchParams.month)}
          events={calendarEvents}
          basePath={`/admin/teams/${team.id}`}
          selectedDay={searchParams.day}
          legend={[
            { kind: "MATCH_CONFIRMED", label: "schválený termín" },
            { kind: "MATCH_PROPOSED", label: "navržený termín" },
            { kind: "OVERLAP", label: "může celý tým" },
            { kind: "TEAMMATE_AVAILABILITY", label: "čas hráče" },
          ]}
        />
      </section>

      <MatchesCard matches={data.matches} />

      <section className="card" id="novy-termin" aria-labelledby="novy-termin-nadpis">
        <h2 id="novy-termin-nadpis">Přidat termín</h2>
        <p className="card-lead">
          Když tým termín v aplikaci nevyplní sám, přidej ho za něj. Termín
          přidaný tady je rovnou schválený a tým k němu hned může nahrávat běhy.
        </p>
        <form action={staffAddMatch}>
          <input type="hidden" name="teamId" value={team.id} />
          <div className="row-actions row-actions-end">
            <DateTimeField
              id="staff-match-start"
              name="start"
              label="Od"
              required
              style={{ marginBottom: 0 }}
            />
            <DateTimeField
              id="staff-match-end"
              name="end"
              label="Do"
              required
              dayFallbackFrom="start"
              style={{ marginBottom: 0 }}
            />
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="staff-match-note">Poznámka (nepovinné)</label>
              <input
                id="staff-match-note"
                name="note"
                placeholder="Např. domluveno s týmem na Discordu"
              />
            </div>
            <SubmitButton className="btn btn-accent" pendingLabel="Přidávám...">
              Přidat termín
            </SubmitButton>
          </div>
        </form>
      </section>

      <RerollCard reroll={data.reroll} activeDungeons={data.activeDungeons} />

      <ResultsCard
        matches={data.matches}
        activeDungeons={data.activeDungeons}
        budgetByMatch={data.budgetByMatch}
        runAction={staffAddRunResult}
        manualAction={staffAddManualResult}
        teamId={team.id}
        staff
        matchExtra={(match) => {
          const budget = data.budgetByMatch.get(match.id)!;

          return (
            <MatchTimer
              matchId={match.id}
              teamId={team.id}
              limitSeconds={budget.limitSeconds}
              elapsedSeconds={match.timerElapsedSeconds}
              runningSince={match.timerStartedAt?.toISOString() ?? null}
              recordedSeconds={budget.usedSeconds}
              serverNow={serverNow}
              startAction={startMatchTimer}
              pauseAction={pauseMatchTimer}
              resetAction={resetMatchTimer}
            />
          );
        }}
      />

      <section className="card" id="poznamky" aria-labelledby="poznamky-nadpis">
        <h2 id="poznamky-nadpis">Poznámky moderátorů</h2>
        <p className="card-lead">
          Vidí je jen admini a moderátoři, hráči ne. Poznámky se jen přidávají,
          ať zůstane vidět, kdo co kdy napsal.
        </p>

        <form action={addTeamNote}>
          <input type="hidden" name="teamId" value={team.id} />
          <div className="field">
            <label htmlFor="note-body">Nová poznámka</label>
            <textarea id="note-body" name="body" rows={3} maxLength={2000} required />
          </div>
          <SubmitButton className="btn btn-accent" pendingLabel="Ukládám...">
            Přidat poznámku
          </SubmitButton>
        </form>

        {notes.length === 0 ? (
          <p className="empty-state">Zatím žádná poznámka.</p>
        ) : (
          <ul className="team-notes">
            {notes.map((note) => (
              <li key={note.id}>
                <div className="team-note-head">
                  <strong>{note.author.username}</strong>
                  <span className="meta">{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="team-note-body">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
