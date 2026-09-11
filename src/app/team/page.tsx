import Link from "next/link";
import { SubmitButton } from "../submit-button";
import { getMyTeamContext } from "@/lib/team";
import { parseMonthParam } from "@/lib/calendar";
import { MonthCalendar } from "../month-calendar";
import { DateTimeField } from "../date-time-field";
import { SectionNav } from "../section-nav";
import { CharacterName, CharacterNameList } from "../character-name";
import {
  SPEC_ROLE_LABELS,
  formatDuration,
  formatRange,
  toDateTimeLocal,
} from "@/lib/labels";
import { ActionNotice } from "../action-notice";
import { buildTeamCalendarEvents, findTeamOverlaps, loadTeamData } from "./team-data";
import { MatchesCard, RerollCard, ResultsCard, RosterCard } from "./team-cards";
import {
  addAvailability,
  addManualResult,
  addRunResult,
  deleteAvailability,
  deleteMatch,
  proposeMatch,
  recordReroll,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Můj tým",
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; month?: string; day?: string };
}) {
  const context = await getMyTeamContext();

  // Prázdné stavy nesmí být slepá ulička - z každého vede odkaz na to,
  // co má člověk udělat dál, nebo aspoň co se čeká.
  if (!context) {
    return (
      <main className="site-main" id="obsah">
        <h1>Můj tým</h1>
        <div className="card">
          <h2>Nejsi přihlášený</h2>
          <p className="card-lead">
            Termíny týmu jsou jen pro přihlášené účastníky soutěže.
          </p>
          <Link className="btn btn-accent" href="/login">
            Přihlásit se
          </Link>
        </div>
      </main>
    );
  }

  const { character, membership } = context;

  if (!character) {
    return (
      <main className="site-main" id="obsah">
        <h1>Můj tým</h1>
        <div className="card">
          <h2>Zatím nemáš přihlášku</h2>
          <p className="card-lead">
            K účtu není přiřazená žádná postava. Do soutěže se přihlásíš
            registračním formulářem.
          </p>
          <Link className="btn btn-accent" href="/register">
            Přejít na registraci
          </Link>
        </div>
      </main>
    );
  }

  if (!membership?.team) {
    const substitute = membership?.status === "SUBSTITUTE";

    return (
      <main className="site-main" id="obsah">
        <h1>Můj tým</h1>
        <div className="card">
          <h2>{substitute ? "Jsi náhradník" : "Čeká se na rozdělení týmů"}</h2>
          <p className="card-lead">
            {substitute
              ? "Zatím nejsi v žádném týmu. Když někdo vypadne, ozve se ti moderátor."
              : "Až se registrace uzavře, admin rozdělí hráče do týmů a tahle stránka se naplní."}
          </p>
          <Link className="btn" href="/profile">
            Zpět na profil
          </Link>
        </div>
      </main>
    );
  }

  const team = membership.team;
  const data = await loadTeamData(team);
  const { availabilities, matches } = data;

  const mySlots = availabilities.filter((a) => a.characterId === character.id);
  const teammateSlots = availabilities.filter((a) => a.characterId !== character.id);

  // Jméno i classa - jména se na stránce vypisují v barvě classy.
  const memberById = new Map(
    team.members.map((m) => [
      m.characterId,
      { name: m.character.characterName, wowClass: m.character.class },
    ])
  );

  const { overlaps, overlapMissing, fullTeamOverlaps } = findTeamOverlaps(
    team.members,
    availabilities
  );

  const month = parseMonthParam(searchParams.month);

  // Do kalendáře jdou termíny, vlastní časy, časy spoluhráčů a překryvy celého
  // týmu. Překryvy s chybějícími hráči se nezobrazují, ať kalendář nezaplní
  // skoro-termíny.
  const calendarEvents = buildTeamCalendarEvents({
    matches,
    availabilities,
    members: team.members,
    fullTeamOverlaps,
    viewerCharacterId: character.id,
  });

  const whoIsMissing = (ids: string[]) =>
    team.members
      .filter((m) => !ids.includes(m.characterId))
      .map((m) => ({ name: m.character.characterName, wowClass: m.character.class }));

  return (
    <main className="site-main site-main-wide" id="obsah">
      <h1>{team.name}</h1>
      <p className="admin-subtitle">
        {team.members.length} hráčů - hraješ {SPEC_ROLE_LABELS[membership.roleInTeam]}
      </p>

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.saved &&
          (searchParams.saved === "manual"
            ? "Běh je uložený. Počítat se začne, až ho moderátor ověří podle screenshotu."
            : searchParams.saved === "abandoned"
              ? "Vzdaný pokus je zapsaný, jeho čas se odečetl z herního času zápasu."
              : "Uloženo.")
        }
      />

      {/* Stránka má osm karet a přes 2 000 px - bez rozcestníku se ke
          každé věci muselo dorolovat. Obyčejné kotvy, fungují bez JS.

          Pořadí karet sleduje, jak tým stránku používá: kdo v něm je,
          kdy se hraje (kalendář, termíny), domluva termínu (moje časy,
          společné časy, vlastní návrh), reroll a nakonec výsledky. */}
      <SectionNav
        items={[
          { id: "sestava", label: "Sestava" },
          { id: "kalendar", label: "Kalendář" },
          { id: "terminy", label: "Termíny" },
          { id: "moje-casy", label: "Kdy mám čas" },
          { id: "casy-tymu", label: "Kdy může tým" },
          { id: "vlastni-termin", label: "Navrhnout termín" },
          { id: "reroll", label: "Reroll" },
          { id: "vysledky", label: "Výsledky" },
        ]}
      />

      <RosterCard
        members={team.members}
        availabilities={availabilities}
        viewerCharacterId={character.id}
      />

      <section className="card" id="kalendar" aria-labelledby="kalendar-nadpis">
        <h2 id="kalendar-nadpis">Kalendář</h2>
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
            { kind: "TEAMMATE_AVAILABILITY", label: "čas spoluhráče" },
          ]}
        />
      </section>

      <MatchesCard matches={matches} deleteAction={deleteMatch} />

      <section className="card" id="moje-casy" aria-labelledby="moje-casy-nadpis">
        <h2 id="moje-casy-nadpis">Kdy mám čas</h2>
        <p className="card-lead">
          Zadej úseky, kdy se ti dá hrát. Ze zadaných časů celého týmu se pak
          vybere společný termín.
        </p>

        {mySlots.length === 0 ? (
          <p className="empty-state">Zatím nemáš zadaný žádný čas.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" style={{ width: "40%" }}>Kdy</th>
                <th scope="col" style={{ width: "14%" }}>Délka</th>
                <th scope="col" style={{ width: "30%" }}>Poznámka</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {mySlots.map((slot) => (
                <tr key={slot.id}>
                  <td>{formatRange(slot.start, slot.end)}</td>
                  <td>{formatDuration(slot.start, slot.end)}</td>
                  <td className="muted">{slot.note ?? "-"}</td>
                  <td>
                    <form action={deleteAvailability}>
                      <input type="hidden" name="availabilityId" value={slot.id} />
                      <SubmitButton
                        className="btn btn-danger"
                        pendingLabel="Mažu..."
                        confirmTitle="Smazat zadaný čas?"
                        confirm="Přestane se počítat do společných termínů týmu. Zadat si ho znovu můžeš kdykoliv."
                        confirmLabel="Smazat čas"
                      >
                        Smazat
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={addAvailability} style={{ marginTop: "1.25rem" }}>
          <div className="row-actions row-actions-end">
            <DateTimeField
              id="start"
              name="start"
              label="Od"
              required
              style={{ marginBottom: 0 }}
            />
            <DateTimeField
              id="end"
              name="end"
              label="Do"
              required
              dayFallbackFrom="start"
              style={{ marginBottom: 0 }}
            />
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="note">Poznámka (nepovinné)</label>
              <input id="note" name="note" placeholder="Např. po 22:00 už jen možná" />
            </div>
            <SubmitButton className="btn btn-accent" pendingLabel="Přidávám...">
              Přidat
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="card" id="casy-tymu" aria-labelledby="casy-tymu-nadpis">
        <h2 id="casy-tymu-nadpis">Kdy může tým</h2>

        {overlaps.length === 0 ? (
          <p className="empty-state">
            Zatím se nenašel žádný společný čas. Chce to, aby si víc lidí zadalo
            své termíny.
          </p>
        ) : (
          <>
            {overlapMissing > 0 && (
              <p className="card-lead">
                Termín, kdy může celý tým, se nenašel. Níže jsou nejbližší
                možnosti, kde chybí nejvýš {overlapMissing} z týmu.
              </p>
            )}

            <table className="data">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "32%" }}>Kdy</th>
                  <th scope="col" style={{ width: "12%" }}>Délka</th>
                  <th scope="col" style={{ width: "12%" }}>Volných</th>
                  <th scope="col" style={{ width: "26%" }}>Chybí</th>
                  <th scope="col" />
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
                      <td className="muted">
                        {missing.length === 0 ? "nikdo" : <CharacterNameList characters={missing} />}
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
                          <SubmitButton className="btn" pendingLabel="Navrhuji...">
                            Navrhnout termín
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <h3 style={{ marginTop: "1.5rem" }}>Časy spoluhráčů</h3>

        {teammateSlots.length === 0 ? (
          <p className="empty-state">Spoluhráči si zatím nezadali žádný čas.</p>
        ) : (
          <table className="data table-cards">
            <thead>
              <tr>
                <th scope="col" style={{ width: "24%" }}>Hráč</th>
                <th scope="col" style={{ width: "36%" }}>Kdy</th>
                <th scope="col" style={{ width: "14%" }}>Délka</th>
                <th scope="col">Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {teammateSlots.map((slot) => (
                <tr key={slot.id}>
                  <td data-label="Hráč">
                    {memberById.has(slot.characterId) && (
                      <CharacterName
                        name={memberById.get(slot.characterId)!.name}
                        wowClass={memberById.get(slot.characterId)!.wowClass}
                      />
                    )}
                  </td>
                  <td data-label="Kdy">{formatRange(slot.start, slot.end)}</td>
                  <td data-label="Délka">{formatDuration(slot.start, slot.end)}</td>
                  <td className="muted" data-label="Poznámka">
                    {slot.note ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" id="vlastni-termin" aria-labelledby="vlastni-termin-nadpis">
        <h2 id="vlastni-termin-nadpis">Navrhnout vlastní termín</h2>
        <p className="card-lead">
          Když se tým domluví jinde, jde termín zadat rovnou. Schvaluje ho
          moderátor.
        </p>
        <form action={proposeMatch}>
          <div className="row-actions row-actions-end">
            <DateTimeField
              id="match-start"
              name="start"
              label="Od"
              required
              style={{ marginBottom: 0 }}
            />
            <DateTimeField
              id="match-end"
              name="end"
              label="Do"
              required
              dayFallbackFrom="start"
              style={{ marginBottom: 0 }}
            />
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="match-note">Poznámka (nepovinné)</label>
              <input id="match-note" name="note" placeholder="Např. sraz na Discordu" />
            </div>
            <SubmitButton className="btn btn-accent" pendingLabel="Navrhuji...">
              Navrhnout
            </SubmitButton>
          </div>
        </form>
      </section>

      <RerollCard
        reroll={data.reroll}
        activeDungeons={data.activeDungeons}
        recordAction={recordReroll}
      />

      <ResultsCard
        matches={matches}
        activeDungeons={data.activeDungeons}
        budgetByMatch={data.budgetByMatch}
        runAction={addRunResult}
        manualAction={addManualResult}
      />
    </main>
  );
}
