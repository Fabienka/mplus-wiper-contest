import type { SpecRole } from "@prisma/client";
import { SubmitButton } from "../submit-button";
import { DateTimeField } from "../date-time-field";
import { ScreenshotInput } from "../screenshot-input";
import { CharacterName } from "../character-name";
import { MatchAuthor } from "../match-author";
import { TimeBudgetLine } from "../time-budget-line";
import {
  MATCH_STATUS_BADGES,
  MATCH_STATUS_LABELS,
  SPEC_ROLE_LABELS,
  formatDateTime,
  formatRange,
  formatTimeLimit,
} from "@/lib/labels";
import { isAwaitingVerification } from "@/lib/manual-result";
import { OVER_TIME_LIMIT_REASON } from "@/lib/time-budget";
import type { TeamData } from "./team-data";

/**
 * Karty stránky týmu sdílené mezi Můj tým (/team) a detailem týmu
 * v administraci (/admin/teams/[id]).
 *
 * Formuláře dostávají server action zvenku: hráč zapisuje za svůj tým
 * (tým se bere z jeho členství), admin a moderátor za tým z adresy detailu
 * (posílá se v poli teamId). Karta bez akce je jen ke čtení.
 */

type Action = (formData: FormData) => void | Promise<void>;
type TeamMatch = TeamData["matches"][number];

export interface RosterMember {
  id: string;
  characterId: string;
  roleInTeam: SpecRole;
  character: { characterName: string; class: string | null; wowSpec: string | null };
}

export function RosterCard({
  members,
  availabilities,
  viewerCharacterId,
}: {
  members: RosterMember[];
  availabilities: { characterId: string }[];
  /** Postava toho, kdo se dívá - v sestavě se označí "(ty)". */
  viewerCharacterId: string | null;
}) {
  return (
    <section className="card" id="sestava" aria-labelledby="sestava-nadpis">
      <h2 id="sestava-nadpis">Sestava</h2>
      {/* table-cards: pod 640 px se řádky rozpadnou na kartičky, jinak by
          se "Monk - Brewmas..." uprostřed slova ořízlo. */}
      <table className="data table-cards">
        <thead>
          <tr>
            <th scope="col" style={{ width: "30%" }}>Postava</th>
            <th scope="col" style={{ width: "34%" }}>Class / spec</th>
            <th scope="col" style={{ width: "18%" }}>Role</th>
            <th scope="col">Zadaných časů</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td data-label="Postava">
                <CharacterName
                  name={member.character.characterName}
                  wowClass={member.character.class}
                />
                {member.characterId === viewerCharacterId && (
                  <span className="meta"> (ty)</span>
                )}
              </td>
              <td className="muted" data-label="Class / spec">
                {member.character.wowSpec
                  ? `${member.character.class} - ${member.character.wowSpec}`
                  : member.character.class ?? "-"}
              </td>
              <td data-label="Role">{SPEC_ROLE_LABELS[member.roleInTeam]}</td>
              <td data-label="Zadaných časů">
                {availabilities.filter((a) => a.characterId === member.characterId).length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function MatchesCard({
  matches,
  deleteAction,
}: {
  matches: TeamMatch[];
  /** Zrušení vlastního návrhu termínu - jen na stránce týmu. */
  deleteAction?: Action;
}) {
  return (
    <section className="card" id="terminy" aria-labelledby="terminy-nadpis">
      <h2 id="terminy-nadpis">Termíny týmu</h2>

      {matches.length === 0 ? (
        <p className="empty-state">Zatím není navržený žádný termín.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col" style={{ width: "32%" }}>Kdy</th>
              <th scope="col" style={{ width: "14%" }}>Stav</th>
              <th scope="col" style={{ width: "18%" }}>Navrhl</th>
              <th scope="col" style={{ width: "18%" }}>Schválil</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id}>
                <td>
                  {formatRange(match.windowStart, match.windowEnd)}
                  {match.note && <div className="meta">{match.note}</div>}
                </td>
                <td>
                  <span className={MATCH_STATUS_BADGES[match.status]}>
                    {MATCH_STATUS_LABELS[match.status]}
                  </span>
                </td>
                <td>
                  <MatchAuthor match={match} />
                </td>
                <td className="muted">{match.confirmedBy?.username ?? "-"}</td>
                <td>
                  {deleteAction && match.status === "PROPOSED" && (
                    <form action={deleteAction}>
                      <input type="hidden" name="matchId" value={match.id} />
                      <SubmitButton
                        pendingLabel="Ruším..."
                        className="btn btn-danger"
                        confirmTitle="Zrušit návrh termínu?"
                        confirm="Zmizí i ostatním v týmu a moderátor ho už neschválí."
                        confirmLabel="Zrušit návrh"
                      >
                        Zrušit
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function RerollCard({
  reroll,
  activeDungeons,
  recordAction,
}: {
  reroll: TeamData["reroll"];
  activeDungeons: TeamData["activeDungeons"];
  /** Zápis rerollu - jen hráč na stránce týmu. Bez akce je karta ke čtení. */
  recordAction?: Action;
}) {
  return (
    <section className="card" id="reroll" aria-labelledby="reroll-nadpis">
      <h2 id="reroll-nadpis">Reroll klíče</h2>

      {reroll ? (
        <>
          <p className="card-lead">Tým reroll využil - na celou soutěž je jen jeden.</p>
          <p style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>
            <strong>
              {reroll.fromDungeonName} +{reroll.fromKeyLevel}
            </strong>{" "}
            <span aria-label="na">→</span>{" "}
            <strong>
              {reroll.toDungeonName} +{reroll.toKeyLevel}
            </strong>
          </p>
          <p className="meta" style={{ margin: 0 }}>
            Zapsal{" "}
            <CharacterName
              name={reroll.recordedBy.characterName}
              wowClass={reroll.recordedBy.class}
            />{" "}
            {formatDateTime(reroll.createdAt)}.{" "}
            {recordAction
              ? "Když je v záznamu chyba, napiš adminovi - opravit ho může jen on."
              : "Zrušit ho může admin v přehledu Týmy."}
          </p>
        </>
      ) : !recordAction ? (
        <p className="empty-state">Tým reroll zatím nevyužil.</p>
      ) : activeDungeons.length === 0 ? (
        <p className="empty-state">
          Sezóna zatím nemá aktivní dungeony, reroll proto nejde zapsat.
        </p>
      ) : (
        <>
          <p className="card-lead">
            Tým má na celou soutěž jeden reroll klíče. Kdo ho využije, zapíše
            sem, z jakého klíče na jaký. Zapsat ho může kdokoli z týmu, ale jen
            jednou.
          </p>

          <form action={recordAction}>
            <div className="row-actions row-actions-end">
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="reroll-from-dungeon">Z klíče</label>
                <select id="reroll-from-dungeon" name="fromDungeon" required defaultValue="">
                  <option value="" disabled>
                    Vyber dungeon
                  </option>
                  {activeDungeons.map((dungeon) => (
                    <option key={dungeon.id} value={dungeon.dungeonName}>
                      {dungeon.dungeonName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, width: "6rem" }}>
                <label htmlFor="reroll-from-level">Výška</label>
                <input
                  id="reroll-from-level"
                  name="fromLevel"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={40}
                  step={1}
                  placeholder="12"
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="reroll-to-dungeon">Na klíč</label>
                <select id="reroll-to-dungeon" name="toDungeon" required defaultValue="">
                  <option value="" disabled>
                    Vyber dungeon
                  </option>
                  {activeDungeons.map((dungeon) => (
                    <option key={dungeon.id} value={dungeon.dungeonName}>
                      {dungeon.dungeonName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, width: "6rem" }}>
                <label htmlFor="reroll-to-level">Výška</label>
                <input
                  id="reroll-to-level"
                  name="toLevel"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={40}
                  step={1}
                  placeholder="12"
                  required
                />
              </div>
              <SubmitButton
                className="btn btn-accent"
                pendingLabel="Zapisuji..."
                confirmTitle="Zapsat reroll klíče?"
                confirm="Tým má reroll jen jeden na celou soutěž. Po zapsání ho už nepůjde změnit - opravit ho může jen admin."
                confirmLabel="Zapsat reroll"
              >
                Zapsat reroll
              </SubmitButton>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

/** Stav výsledku jedním štítkem - a u neplatného důvod pod ním. */
function ResultStatus({ result }: { result: TeamMatch["results"][number] }) {
  if (result.isOfficial) {
    return <span className="badge badge-approved">Počítá se</span>;
  }

  if (result.abandoned) {
    return (
      <>
        <span className="badge badge-rejected">Vzdáno</span>
        <div className="meta">Do bodů se nepočítá, čas se odečetl z herního času.</div>
      </>
    );
  }

  if (result.overTimeLimit && !result.timeLimitOverride) {
    return (
      <>
        <span className="badge badge-rejected">Přes herní čas</span>
        <div className="meta">{OVER_TIME_LIMIT_REASON}</div>
      </>
    );
  }

  if (isAwaitingVerification(result)) {
    return (
      <>
        <span className="badge badge-pending">Čeká na ověření</span>
        {result.invalidReason && <div className="meta">{result.invalidReason}</div>}
      </>
    );
  }

  if (result.isValid) {
    return <span className="badge badge-pending">Platný</span>;
  }

  return (
    <>
      <span className="badge badge-rejected">Nepočítá se</span>
      {result.invalidReason && <div className="meta">{result.invalidReason}</div>}
    </>
  );
}

export function ResultsCard({
  matches,
  activeDungeons,
  budgetByMatch,
  runAction,
  manualAction,
  teamId,
  staff = false,
  matchExtra,
}: {
  matches: TeamMatch[];
  activeDungeons: TeamData["activeDungeons"];
  budgetByMatch: TeamData["budgetByMatch"];
  runAction: Action;
  manualAction: Action;
  /** Tým z adresy detailu - posílá ho admin a moderátor, hráč ne. */
  teamId?: string;
  /** Zapisuje admin nebo moderátor - ruční běh je rovnou ověřený. */
  staff?: boolean;
  /** Doplněk pod herním časem zápasu - na detailu týmu časovač. */
  matchExtra?: (match: TeamMatch) => React.ReactNode;
}) {
  const confirmed = matches.filter((m) => m.status === "CONFIRMED");
  const teamField = teamId ? <input type="hidden" name="teamId" value={teamId} /> : null;

  return (
    <section className="card" id="vysledky" aria-labelledby="vysledky-nadpis">
      <h2 id="vysledky-nadpis">Výsledky</h2>
      <p className="card-lead">
        {staff
          ? "Za tým můžeš nahrát běh z Raider.io i ručně se screenshotem. Ručně zapsaný běh je rovnou ověřený tebou - počítá se, pokud projde automatickými kontrolami."
          : "Po odehrání vlož odkaz na běh z Raider.io. Čas i sestavu si aplikace stáhne sama, takže se nedá překlepnout. Počítá se jen nejlepší platný běh - neúspěšný pokus o vyšší klíč vás o dřívější výsledek nepřipraví."}
      </p>

      {confirmed.length === 0 ? (
        <p className="empty-state">Výsledky jdou nahrávat až ke schválenému termínu.</p>
      ) : (
        confirmed.map((match) => (
          <div key={match.id} style={{ marginBottom: "1.5rem" }}>
            <strong style={{ fontSize: "0.95rem" }}>
              {formatRange(match.windowStart, match.windowEnd)}
            </strong>
            <TimeBudgetLine budget={budgetByMatch.get(match.id)!} />
            {matchExtra?.(match)}

            {match.results.length === 0 ? (
              <p className="empty-state" style={{ padding: "0.75rem 0" }}>
                Zatím žádný běh.
              </p>
            ) : (
              <table className="data" style={{ marginTop: "0.5rem" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "30%" }}>Dungeon</th>
                    <th scope="col" style={{ width: "10%" }}>Klíč</th>
                    <th scope="col" style={{ width: "14%" }}>Čas</th>
                    <th scope="col" style={{ width: "14%" }}>Body</th>
                    <th scope="col">Stav</th>
                  </tr>
                </thead>
                <tbody>
                  {match.results.map((result) => (
                    <tr key={result.id}>
                      <td>
                        {result.dungeonName}
                        {result.screenshot && (
                          <div className="meta">
                            zadáno ručně -{" "}
                            <a
                              href={`/team/screenshot/${result.screenshot.id}`}
                              target="_blank"
                              rel="noopener"
                            >
                              screenshot
                            </a>
                          </div>
                        )}
                        {/* Běh mimo termín (nebo s cizím hráčem, mimo rotaci)
                            herní čas týmu nečerpá. */}
                        {!result.countsTowardTimeLimit && (
                          <div className="meta">do herního času se nepočítá</div>
                        )}
                      </td>
                      <td>+{result.keyLevel}</td>
                      <td>{formatTimeLimit(result.clearTimeSeconds)}</td>
                      <td>{result.points === null ? "-" : result.points.toFixed(1)}</td>
                      <td>
                        <ResultStatus result={result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form action={runAction} style={{ marginTop: "0.75rem" }}>
              {teamField}
              <input type="hidden" name="matchId" value={match.id} />
              <div className="row-actions row-actions-end">
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label htmlFor={`run-${match.id}`}>Odkaz na běh</label>
                  <input
                    id={`run-${match.id}`}
                    name="runUrl"
                    placeholder="https://raider.io/mythic-plus-runs/..."
                    required
                  />
                </div>
                <SubmitButton
                  className="btn btn-accent"
                  pendingLabel="Stahuji běh z Raider.io..."
                >
                  Nahrát výsledek
                </SubmitButton>
              </div>
            </form>

            {/* Záložní cesta, když běh na Raider.io není. Schovaná pod
                rozbalením - hlavní cesta zůstává odkaz, ten se nedá
                překlepnout a nepotřebuje ověření. */}
            <details className="manual-run">
              <summary>Běh není na Raider.io? Zadat ho ručně se screenshotem</summary>

              {activeDungeons.length === 0 ? (
                <p className="field-hint">
                  Sezóna zatím nemá aktivní dungeony, ručně běh zadat nejde.
                </p>
              ) : (
                <>
                  <p className="field-hint">
                    {staff
                      ? "Údaje opiš ze screenshotu konce dungeonu a přilož ho. Běh zapsaný tebou je rovnou ověřený."
                      : "Údaje opiš z obrazovky na konci dungeonu a přilož její screenshot - musí na něm být vidět dungeon, výška klíče, čas i sestava. Počítat se běh začne, až ho moderátor podle screenshotu ověří."}
                  </p>

                  <form action={manualAction}>
                    {teamField}
                    <input type="hidden" name="matchId" value={match.id} />

                    <div className="row-actions row-actions-end" style={{ flexWrap: "wrap" }}>
                      <div className="field" style={{ marginBottom: 0, flex: "1 1 12rem" }}>
                        <label htmlFor={`manual-dungeon-${match.id}`}>Dungeon</label>
                        <select
                          id={`manual-dungeon-${match.id}`}
                          name="dungeon"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Vyber dungeon
                          </option>
                          {activeDungeons.map((dungeon) => (
                            <option key={dungeon.id} value={dungeon.dungeonName}>
                              {dungeon.dungeonName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom: 0, width: "6rem" }}>
                        <label htmlFor={`manual-level-${match.id}`}>Výška</label>
                        <input
                          id={`manual-level-${match.id}`}
                          name="keyLevel"
                          type="number"
                          inputMode="numeric"
                          min={2}
                          max={40}
                          step={1}
                          placeholder="12"
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0, width: "7rem" }}>
                        <label htmlFor={`manual-time-${match.id}`}>Čas</label>
                        <input
                          id={`manual-time-${match.id}`}
                          name="clearTime"
                          inputMode="decimal"
                          placeholder="32:15"
                          autoComplete="off"
                          required
                        />
                      </div>
                      <DateTimeField
                        id={`manual-completed-${match.id}`}
                        name="completed"
                        label="Kdy skončil"
                        required
                        style={{ marginBottom: 0 }}
                      />
                    </div>

                    <div className="field field-check" style={{ margin: "0.75rem 0 0" }}>
                      <label>
                        <input type="checkbox" name="abandoned" />
                        <span>
                          {staff
                            ? "Tým pokus vzdal, běh je nedokončený."
                            : "Pokus jsme vzdali, běh je nedokončený."}{" "}
                          <span className="muted">
                            {staff
                              ? "Čas z časovače v okamžiku, kdy tým odešel - odečte se z herního času zápasu. Do bodů se vzdaný pokus nepočítá."
                              : "Čas zadej z časovače v okamžiku, kdy jste odešli, a přilož screenshot - odečte se z herního času zápasu. Do bodů se vzdaný pokus nepočítá."}
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="row-actions row-actions-end" style={{ marginTop: "0.75rem" }}>
                      <ScreenshotInput
                        id={`manual-shot-${match.id}`}
                        name="screenshot"
                        label="Screenshot"
                        required
                        style={{ marginBottom: 0, flex: 1 }}
                      />
                      <SubmitButton className="btn btn-accent" pendingLabel="Nahrávám...">
                        Uložit běh
                      </SubmitButton>
                    </div>
                  </form>
                </>
              )}
            </details>
          </div>
        ))
      )}
    </section>
  );
}
