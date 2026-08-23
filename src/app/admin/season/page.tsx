import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { SEASON_STATUS_LABELS, formatTimeLimit } from "@/lib/labels";
import { ConfirmButton } from "../confirm-button";
import {
  addDungeon,
  deleteDungeon,
  syncDungeonTimes,
  updateDungeons,
  updateSeason,
} from "./actions";

export const dynamic = "force-dynamic";

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

  return (
    <>
      <h1>Sezóna a dungeony</h1>
      <p className="admin-subtitle">{season.name}</p>

      {searchParams.error && (
        <div className="card">
          <p className="error-text" style={{ margin: 0 }}>
            {searchParams.error}
          </p>
        </div>
      )}

      {searchParams.synced !== undefined && !searchParams.error && (
        <div className="card">
          <p className="success-text" style={{ margin: 0 }}>
            {synced === 0
              ? "Časy dungeonů už odpovídaly Raider.io, nic se neměnilo."
              : `Doplněno časů z Raider.io: ${synced}.`}
            {searchParams.missing &&
              ` Na Raider.io se nepodařilo najít: ${searchParams.missing}.`}
          </p>
        </div>
      )}

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
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              Najdeš ho v adrese běhu na Raider.io:
              raider.io/mythic-plus-runs/<b>season-mn-2</b>/...
            </span>
          </div>

          <button className="btn btn-accent" type="submit">
            Uložit sezónu
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Dungeony</h2>

        {/* Vlastní formulář, aby stažení časů nezáviselo na validaci tabulky. */}
        <form action={syncDungeonTimes} style={{ marginBottom: "1.25rem" }}>
          <input type="hidden" name="seasonId" value={season.id} />
          <button className="btn" type="submit">
            Doplnit časy z Raider.io
          </button>
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

        {dungeons.length === 0 ? (
          <p className="empty-state">Sezóna zatím nemá žádné dungeony.</p>
        ) : (
          <form action={updateDungeons}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: "32%" }}>Název</th>
                  <th style={{ width: "12%" }}>Zkratka</th>
                  <th style={{ width: "14%" }}>Čas (mm:ss)</th>
                  <th style={{ width: "14%" }}>Koeficient</th>
                  <th style={{ width: "10%" }}>Aktivní</th>
                  <th />
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
                        name={`coef-${dungeon.id}`}
                        type="number"
                        step="0.05"
                        min="0.05"
                        defaultValue={dungeon.coefficient}
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
                      <ConfirmButton
                        form="delete-dungeon"
                        className="btn btn-danger"
                        message={`Opravdu smazat dungeon "${dungeon.dungeonName}"?`}
                        formAction={deleteDungeon.bind(null, dungeon.id)}
                      >
                        Smazat
                      </ConfirmButton>
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
          <button className="btn" type="submit">
            Přidat
          </button>
        </form>
      </div>
    </>
  );
}
