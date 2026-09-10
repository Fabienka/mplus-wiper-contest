import { prisma } from "@/lib/prisma";
import { SubmitButton } from "../../submit-button";
import { getCurrentSeason } from "@/lib/season";
import { SEASON_STATUS_LABELS, formatTimeLimit } from "@/lib/labels";
import { DEFAULT_SCORING_CONFIG, parseScoringConfig } from "@/lib/scoring";
import { ActionNotice } from "../../action-notice";
import {
  addDungeon,
  deleteDungeon,
  syncDungeonTimes,
  updateDungeons,
  updateSeason,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sezóna a dungeony – administrace",
};

export default async function SeasonPage({
  searchParams,
}: {
  searchParams: { synced?: string; missing?: string; error?: string };
}) {
  const season = await getCurrentSeason();

  if (!season) {
    return (
      <>
        <h1>Sezóna a dungeony</h1>
        <p className="admin-subtitle">
          Zatím není založená žádná sezóna. Založ ji seed skriptem
          (<code>npm run prisma:seed</code>).
        </p>
      </>
    );
  }

  const dungeons = await prisma.seasonDungeon.findMany({
    where: { seasonId: season.id },
    orderBy: { dungeonName: "asc" },
  });

  const synced = Number(searchParams.synced);

  // Rozbité nastavení nesmí shodit celou stránku - formulář se pak otevře
  // s výchozími hodnotami a admin ho může opravit.
  let scoring = DEFAULT_SCORING_CONFIG;
  try {
    scoring = parseScoringConfig(season.scoringConfig);
  } catch {
    scoring = DEFAULT_SCORING_CONFIG;
  }

  return (
    <>
      <h1>Sezóna a dungeony</h1>
      <p className="admin-subtitle">{season.name}</p>

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.synced !== undefined &&
          (synced === 0
            ? "Časy dungeonů už odpovídaly Raider.io, nic se neměnilo."
            : `Doplněno časů z Raider.io: ${synced}.`) +
            (searchParams.missing
              ? ` Na Raider.io se nepodařilo najít: ${searchParams.missing}.`
              : "")
        }
      />

      <div className="card">
        <h2>Nastavení sezóny</h2>
        <form action={updateSeason}>
          <input type="hidden" name="seasonId" value={season.id} />

          <div className="field">
            <label htmlFor="name">Název</label>
            <input id="name" name="name" defaultValue={season.name} required />
          </div>

          <div className="field">
            <label htmlFor="status">Stav</label>
            <select id="status" name="status" defaultValue={season.status}>
              {Object.entries(SEASON_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="raiderioSeasonSlug">Slug sezóny na Raider.io</label>
            <input
              id="raiderioSeasonSlug"
              name="raiderioSeasonSlug"
              defaultValue={season.raiderioSeasonSlug ?? ""}
              placeholder="season-mn-2"
            />
            <span className="meta">
              Najdeš ho v adrese běhu na Raider.io:
              raider.io/mythic-plus-runs/<b>season-mn-2</b>/...
            </span>
          </div>

          <div className="field">
            <label htmlFor="minScoredKeyLevel">Nejnižší bodovaný klíč</label>
            <input
              id="minScoredKeyLevel"
              name="minScoredKeyLevel"
              type="number"
              min="2"
              max="30"
              step="1"
              defaultValue={scoring.minScoredKeyLevel}
              required
            />
            <span className="meta">
              Nižší klíče se nebodují vůbec, i když je tým stihne v limitu.
              Zároveň se od téhle výšky počítá skóre, takže nejnižší bodovaný
              klíč začíná na nule.
            </span>
          </div>

          <div className="field">
            <label htmlFor="pointsPerKeyLevel">Body za úroveň klíče</label>
            <input
              id="pointsPerKeyLevel"
              name="pointsPerKeyLevel"
              type="number"
              min="100"
              step="10"
              defaultValue={scoring.pointsPerKeyLevel}
              required
            />
            <span className="meta">
              Nesmí být pod 100 - časový bonus je až 100 bodů a vyšší klíč musí
              porazit nižší i při horším čase.
            </span>
          </div>

          <SubmitButton
            className="btn btn-accent"
            pendingLabel="Ukládám..."
          >
            Uložit sezónu
          </SubmitButton>
        </form>
      </div>

      <div className="card">
        <h2>Dungeony</h2>

        {/* Vlastní formulář, aby stažení časů nezáviselo na validaci tabulky. */}
        <form action={syncDungeonTimes} style={{ marginBottom: "1.25rem" }}>
          <input type="hidden" name="seasonId" value={season.id} />
          <SubmitButton
            className="btn"
            pendingLabel="Stahuji z Raider.io..."
          >
            Doplnit časy z Raider.io
          </SubmitButton>
          <span
            style={{
              color: "var(--muted)",
              fontSize: "0.82rem",
              marginLeft: "0.75rem",
            }}
          >
            Páruje se podle zkratky, ostatní sloupce zůstanou beze změny.
          </span>
        </form>

        <p className="card-lead">
          <strong style={{ color: "var(--text)" }}>Násobitel bonusu</strong> je
          normálně <strong style={{ color: "var(--text)" }}>1</strong>. Zvýšením
          se dungeon zvýhodní - hodí se tam, kde tým část času neovlivní
          (nucené čekání na NPC). Při 1,2 dostane tým za stejně ušetřený čas
          o 20 % bodů víc. Bonus je vždy useknutý těsně pod 100 body, aby vyšší
          klíč nemohl prohrát s nižším - hodnoty nad zhruba 2 proto už jen
          ubírají rozlišení mezi rychlými běhy.
        </p>

        {dungeons.length === 0 ? (
          <p className="empty-state">Sezóna zatím nemá žádné dungeony.</p>
        ) : (
          <form action={updateDungeons}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "32%" }}>Název</th>
                  <th scope="col" style={{ width: "12%" }}>Zkratka</th>
                  <th scope="col" style={{ width: "14%" }}>Čas (mm:ss)</th>
                  <th scope="col" style={{ width: "14%" }}>Násobitel bonusu</th>
                  <th scope="col" style={{ width: "10%" }}>Aktivní</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {dungeons.map((dungeon) => (
                  <tr key={dungeon.id}>
                    <td>
                      <input type="hidden" name="dungeonId" value={dungeon.id} />
                      <input
                        name={`name-${dungeon.id}`}
                        defaultValue={dungeon.dungeonName}
                        required
                      />
                    </td>
                    <td>
                      <input
                        name={`abbr-${dungeon.id}`}
                        defaultValue={dungeon.abbreviation}
                        maxLength={8}
                        required
                      />
                    </td>
                    <td>
                      <input
                        name={`time-${dungeon.id}`}
                        defaultValue={formatTimeLimit(dungeon.timeLimitSeconds)}
                        placeholder="TBD"
                        pattern="\d+(:[0-5]\d)?"
                        title="Formát mm:ss, např. 33:00. Prázdné = zatím neurčeno."
                      />
                    </td>
                    <td>
                      <input
                        name={`mult-${dungeon.id}`}
                        type="number"
                        step="0.05"
                        min="0.05"
                        defaultValue={dungeon.bonusMultiplier}
                        title="1 = bez zvýhodnění"
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        name={`active-${dungeon.id}`}
                        defaultChecked={dungeon.isActive}
                        style={{ width: "auto" }}
                      />
                    </td>
                    <td>
                      <SubmitButton
                        pendingLabel="Mažu..."
                        form="delete-dungeon"
                        className="btn btn-danger"
                        confirm={`Opravdu smazat dungeon "${dungeon.dungeonName}"?`}
                        formAction={deleteDungeon.bind(null, dungeon.id)}
                      >
                        Smazat
                      </SubmitButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              className="btn btn-accent"
              type="submit"
              style={{ marginTop: "1.25rem" }}
            >
              Uložit dungeony
            </button>
          </form>
        )}

        {/* Mazání má vlastní formulář, aby submit nezahodil rozeditované
            časy a koeficienty v tabulce výše. */}
        <form id="delete-dungeon" />
      </div>

      <div className="card">
        <h2>Přidat dungeon</h2>
        <form action={addDungeon} className="row-actions">
          <input type="hidden" name="seasonId" value={season.id} />
          <input
            name="dungeonName"
            placeholder="Název dungeonu"
            required
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "0.45rem 0.6rem",
              color: "var(--text)",
            }}
          />
          <input
            name="abbreviation"
            placeholder="ZKR"
            maxLength={8}
            required
            style={{
              width: "100px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "0.45rem 0.6rem",
              color: "var(--text)",
            }}
          />
          <SubmitButton
            className="btn"
            pendingLabel="Přidávám..."
          >
            Přidat
          </SubmitButton>
        </form>
      </div>
    </>
  );
}
