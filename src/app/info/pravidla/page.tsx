import Link from "next/link";
import { getCurrentSeason } from "@/lib/season";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCORING_CONFIG,
  MAX_TIME_BONUS,
  ScoringConfigError,
  parseScoringConfig,
} from "@/lib/scoring";
import { ENTRY_FEE_RECIPIENT } from "@/lib/contest-info";
import { Notice } from "../../notice";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const season = await getCurrentSeason();

  // Čísla v pravidlech se berou z nastavení sezóny, ne z ručně opsaného textu -
  // jinak by pravidla po změně bodování tiše lhala. Když je nastavení rozbité,
  // ukážou se výchozí hodnoty; opravit ho jde v administraci.
  let config = DEFAULT_SCORING_CONFIG;
  let configBroken = false;

  if (season) {
    try {
      config = parseScoringConfig(season.scoringConfig);
    } catch (err) {
      configBroken = err instanceof ScoringConfigError;
    }
  }

  const dungeons = season
    ? await prisma.seasonDungeon.findMany({
        where: { seasonId: season.id, isActive: true },
        orderBy: { dungeonName: "asc" },
        select: { dungeonName: true, abbreviation: true, bonusMultiplier: true },
      })
    : [];

  const zvyhodnene = dungeons.filter((d) => d.bonusMultiplier !== 1);

  return (
    <>
      <h1>Pravidla soutěže</h1>
      <p className="admin-subtitle">
        {season ? season.name : "Zatím není založená žádná sezóna."}
      </p>

      <div className="card">
        <h2>Přihlášení</h2>
        <ul className="info-list">
          <li>
            Přihlašuješ se odkazem na svůj profil na <strong>Raider.io</strong>.
            Podle něj se načte class, spec a skóre.
          </li>
          <li>
            Přihlášku schvaluje admin. Schválení <strong>není</strong> totéž co
            zaplacené zápisné - obojí musí proběhnout.
          </li>
          <li>
            Zápisné se posílá <strong>ve hře</strong>
            {ENTRY_FEE_RECIPIENT ? ` postavě ${ENTRY_FEE_RECIPIENT}` : ""}. Že
            peníze dorazily, potvrdí moderátor ručně - do té doby máš u přihlášky
            stav „nezaplaceno".
          </li>
          <li>
            Spec uveď ten, se kterým opravdu půjdeš hrát. Skládají se podle něj
            týmy, ne podle toho, co tě Raider.io vidělo hrát naposledy.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Týmy</h2>
        <ul className="info-list">
          <li>
            Tým má <strong>pět hráčů</strong>: jeden tank, jeden healer, tři
            DPS. Sestavu určuje rozdělení, ne domluva hráčů.
          </li>
          <li>
            Rozdělení se snaží vyvážit skóre týmů, poměr ranged/melee a pokrýt
            battle rez a bloodlust. Ne vždy to jde beze zbytku - které pravidlo
            se u které varianty porušilo, vidí admin před potvrzením.
          </li>
          <li>
            Hráči, na které nezbylo místo v žádném týmu, zůstávají jako
            náhradníci.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Termín a průběh</h2>
        <ul className="info-list">
          <li>
            Členové týmu si v kalendáři zadají, kdy mají čas. Z překryvů se
            navrhne termín; platí až po schválení moderátorem.
          </li>
          <li>
            Běhy se počítají <strong>jen z domluveného okna</strong>. Co odběhnete
            před jeho začátkem nebo po konci, se neuzná.
          </li>
          <li>
            Uvnitř okna můžete zkusit klíčů kolik chcete - počítá se z nich
            jediný nejlepší.
          </li>
          <li>
            Moderátor zápas na konci <strong>uzavře</strong> a tím se výsledky
            zamknou. Po uzavření už nejde nic přidat.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Co se boduje</h2>

        {configBroken && (
          <Notice kind="error" title="Nastavení bodování sezóny je poškozené">
            Níže jsou výchozí hodnoty. Řekni o tom adminovi.
          </Notice>
        )}

        <ul className="info-list">
          <li>
            Boduje se jen klíč <strong>+{config.minScoredKeyLevel} a vyšší</strong>.
            Nižší klíče se nepočítají, ani když je stihnete - berou se jen jako
            rozběh na vytažení klíče.
          </li>
          <li>
            <strong>Nestihnutý klíč se neboduje vůbec</strong>, nedostane ani
            nulu. Rozhoduje verdikt hry, ne naše měření. Když klíč nestihnete,
            musíte běžet jiný.
          </li>
          <li>
            Týmu se počítá <strong>jediný nejlepší bodovaný běh</strong>.
            Neúspěšný pokus vás o dřívější výsledek nepřipraví.
          </li>
          <li>
            <strong>Vyšší klíč porazí nižší vždycky</strong>, bez ohledu na čas.
            Obtížnost s každou úrovní roste natolik, že by srovnávání přes čas
            nedávalo smysl.
          </li>
        </ul>

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Vzorec</h3>
        <pre className="info-formula">
          {`body = (výška klíče − ${config.minScoredKeyLevel}) × ${config.pointsPerKeyLevel}
       + ${MAX_TIME_BONUS} × (1 − čas běhu ÷ časový limit klíče)`}
        </pre>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          Druhý řádek je procento limitu, které jste nevyčerpali. Díky tomu se
          srovnají různě dlouhé dungeony - ušetřená pětina času znamená všude
          totéž. Časový bonus je vždycky menší než {MAX_TIME_BONUS}, takže
          nemůže přebít celou úroveň klíče.
        </p>
      </div>

      <div className="card">
        <h2>Uznání běhu</h2>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "var(--muted)" }}>
          Výsledek se nahrává odkazem na běh z Raider.io. Aby se uznal, musí
          platit všechno naráz:
        </p>
        <ul className="info-list">
          <li>dungeon je v rotaci sezóny,</li>
          <li>běh skončil uvnitř okna schváleného termínu,</li>
          <li>
            celá pětice v sestavě patří do týmu - jeden cizí hráč běh
            zneplatňuje,
          </li>
          <li>klíč byl stihnutý a je aspoň +{config.minScoredKeyLevel}.</li>
        </ul>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
          Když něco nesedí, aplikace u běhu vypíše důvod. Poslední slovo má
          moderátor - běh může uznat i zneplatnit ručně.
        </p>
      </div>

      {dungeons.length > 0 && (
        <div className="card">
          <h2>Dungeony v rotaci ({dungeons.length})</h2>
          <ul className="info-list">
            {dungeons.map((dungeon) => (
              <li key={dungeon.dungeonName}>
                {dungeon.dungeonName}{" "}
                <span style={{ color: "var(--muted)" }}>
                  ({dungeon.abbreviation})
                </span>
                {dungeon.bonusMultiplier !== 1 && (
                  <strong> - zvýhodnění ×{dungeon.bonusMultiplier}</strong>
                )}
              </li>
            ))}
          </ul>

          {zvyhodnene.length > 0 && (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Zvýhodnění dostávají dungeony, kde část času neovlivníte - typicky
              nucené čekání na NPC. Násobí se jím časový bonus, ale nikdy tolik,
              aby nižší klíč porazil vyšší.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Něco není jasné?</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--muted)" }}>
          Spory o výsledek i technické problémy řeší pořadatel.
        </p>
        <Link className="btn" href="/info/kontakt">
          Kontakt
        </Link>
      </div>
    </>
  );
}
