import Link from "next/link";
import { getCurrentSeason } from "@/lib/season";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfigError,
  parseScoringConfig,
} from "@/lib/scoring";
import { plural } from "@/lib/labels";
import { Notice } from "../../notice";
import { EntryFeeLine } from "../../entry-fee";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pravidla soutěže",
};

/** Herní čas do věty: "2 hodiny", u necelých hodin "90 minut". */
function playTimeLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${plural(hours, "hodinu", "hodiny", "hodin")}`;
  }
  return `${minutes} ${plural(minutes, "minutu", "minuty", "minut")}`;
}

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
  const playTime = playTimeLabel(config.timeBudgetMinutes);

  return (
    <>
      <h1>Pravidla soutěže</h1>
      <p className="admin-subtitle">
        {season ? season.name : "Zatím není založená žádná sezóna."}
      </p>

      <div className="card">
        <h2>Ve zkratce</h2>
        <p className="card-lead">
          Soutěž má jedno kolo. Každý tým odehraje jeden zápas a má v něm{" "}
          <strong>{playTime} herního času</strong>, aby vytáhl klíč co nejvýš.
          Vyhrává tým s nejvyšším stihnutým klíčem.
        </p>
        <p className="card-note">
          Pořadatel si vyhrazuje právo zasáhnout do soutěže, když někdo poruší
          pravidla, a pravidla v průběhu soutěže upravit.
        </p>
      </div>

      <div className="card">
        <h2>Přihlášení</h2>
        <ul className="info-list">
          <li>
            Přihlašuješ se odkazem na svůj profil na <strong>Raider.io</strong>.
            Podle něj se načte class, spec a skóre.
          </li>
          <li>
            Přihlášku schvaluje admin. Požadavky na postavu (třeba item level)
            se liší sezónu od sezóny - přihlášku postavy, která je nesplňuje,
            admin neschválí.
          </li>
          <li>
            Výši zápisného stanovuje pořadatel. <EntryFeeLine /> Najdeš to
            i na přihlášce a v profilu.
          </li>
          <li>
            Schválení <strong>není</strong> totéž co zaplacené zápisné - obojí
            musí proběhnout. Že peníze dorazily, potvrdí moderátor ručně - do té
            doby máš u přihlášky stav „nezaplaceno".
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
            DPS.
          </li>
          <li>
            Hráči se do týmů rozdělí <strong>náhodně</strong>. Z mnoha možných
            rozdělení se vybere to nejlepší - týmy mají být co nejvyrovnanější
            a mít v sestavě battle rez i bloodlust. Rozdělení se počítá
            z anonymních údajů (role, spec, Raider.io skóre), jména hráčů
            nezná.
          </li>
          <li>
            Na výběr spoluhráčů není nárok. Ve výjimečných případech může admin
            hráče na požádání přesunout do jiného týmu - do kterého, si ale
            vybrat nejde.
          </li>
          <li>
            Hráči, na které nezbylo místo v žádném týmu, zůstávají jako
            náhradníci.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Termín</h2>
        <ul className="info-list">
          <li>
            Členové týmu si v kalendáři zadají, kdy mají čas. Z překryvů se
            navrhne termín; platí až po schválení moderátorem.
          </li>
          <li>
            Každý tým odehraje <strong>jeden zápas</strong>. Když ho tým musí
            zrušit nebo přerušit, o dalším postupu rozhoduje moderátor.
          </li>
          <li>
            V domluvený čas se tým sejde na Discordu. Začít můžete, až když je
            u vás supervizor. Když nedorazí, napište pořadateli (Fabienka).
          </li>
          <li>
            Běh se počítá, když <strong>začne po začátku schváleného termínu a
            nejpozději ve 23:59 téhož dne</strong>. Rozhoduje začátek - klíč
            načatý večer smí doběhnout i po půlnoci. Když začnete později, třeba
            protože se čeká na supervizora, nevadí to.
          </li>
          <li>
            Během zápasu tým <strong>streamuje</strong> na Discordu nebo jiné
            streamovací platformě.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Průběh zápasu</h2>
        <ul className="info-list">
          <li>Startovní klíč může dát kdokoli z týmu.</li>
          <li>
            <strong>Klíče musí navazovat</strong>: další dungeon jdete s klíčem,
            který vám hra dala po tom předchozím. Jiný klíč z inventáře použít
            nesmíte (kromě rerollu). Hlídá to supervizor.
          </li>
          <li>
            Na zápas máte <strong>{playTime} herního času</strong>. Počítá se
            jen čas v dungeonu podle herního časovače, včetně penalizace za
            smrt - příprava, přesuny a pauzy mezi klíči ne. Čas ubírají
            i nestihnuté a vzdané klíče.
          </li>
          <li>
            Klíč, během kterého vám herní čas dojde, se nepočítá - ani když ho
            stihnete v limitu dungeonu. Výsledek, kterého jste dosáhli dřív, vám
            zůstává.
          </li>
          <li>
            Tým má na celou soutěž <strong>jeden reroll</strong>: místo klíče,
            který dostal po posledním dokončeném dungeonu, smí použít jiný klíč
            - <strong>aspoň o 1 úroveň nižší</strong>. Například místo +11
            můžete jít +10 v jiném dungeonu. Reroll zapíše kdokoli z týmu na
            stránce týmu.
          </li>
          <li>
            Aspoň jeden hráč v týmu musí mít addon <strong>Raider.IO</strong>{" "}
            a časovač klíče - addon <strong>MPlusTimer</strong>, nebo timer
            v <strong>EllesmereUI</strong>.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Supervizor</h2>
        <ul className="info-list">
          <li>
            Každý tým má přiděleného supervizora. Dohlíží na dodržování pravidel
            a na zápis výsledků.
          </li>
          <li>
            Do hry nijak nezasahuje. Může vám připomenout pravidla a odpovídá na
            otázky k soutěži.
          </li>
          <li>
            Když uvidí porušení pravidel, cheatování nebo nesportovní chování,
            musí to nahlásit pořadateli.
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
            Vyhrává tým s <strong>nejvyšším stihnutým klíčem</strong>. Vyšší
            klíč porazí nižší vždycky, bez ohledu na čas.
          </li>
          <li>
            Když mají dva týmy stejně vysoký klíč, rozhoduje,{" "}
            <strong>kolik procent z limitu dungeonu jim zbylo</strong> - ne
            čistý čas. Dungeony mají různě dlouhý limit, takže procenta jsou
            férovější.
            <br />
            <span className="muted">
              Příklad: tým A dá +15 v dungeonu s limitem 30 minut za 27 minut,
              zbylo mu 10 % limitu. Tým B dá +15 v dungeonu s limitem 40 minut
              za 34 minut, zbylo mu 15 %. Vyhrává B, i když byl v dungeonu
              déle.
            </span>
          </li>
          <li>
            Boduje se jen klíč <strong>+{config.minScoredKeyLevel} a vyšší</strong>.
            Nižší klíče se nepočítají, ani když je stihnete.
          </li>
          <li>
            <strong>Nestihnutý klíč se neboduje vůbec</strong>. Rozhoduje verdikt
            hry, ne naše měření.
          </li>
          <li>
            Týmu se počítá <strong>jediný nejlepší běh</strong>. Neúspěšný pokus
            vás o dřívější výsledek nepřipraví.
          </li>
          <li>
            Kdyby dva týmy skončily přesně stejně, rozhodne{" "}
            <strong>rozstřel</strong>: oba půjdou stejný dungeon na čas
            a rychlejší vyhrává. Rozstřel může mít podle situace další pravidla
            - dozvíte se je před startem.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Uznání běhu</h2>
        <p className="card-lead">
          Výsledek nahrajete do aplikace odkazem na běh z Raider.io - čas
          i sestavu si aplikace stáhne sama. Aby se běh uznal, musí platit
          všechno naráz:
        </p>
        <ul className="info-list">
          <li>
            běh začal po začátku schváleného termínu a nejpozději ve 23:59 téhož
            dne,
          </li>
          <li>běh se celý vešel do zbývajícího herního času zápasu,</li>
          <li>
            celá pětice v sestavě patří do týmu - jeden cizí hráč běh
            zneplatňuje,
          </li>
          <li>
            klíč byl dokončen v čase dungeonu a je alespoň +
            {config.minScoredKeyLevel},
          </li>
          <li>klíč navazuje na předchozí (hlídá supervizor).</li>
        </ul>
        <p className="card-note">
          Běh, který na Raider.io není, se zadá ručně se screenshotem a počítá
          se až po ověření moderátorem. Běh mimo termín nebo s cizím hráčem vám
          neubírá ani herní čas. Když něco nesedí,
          aplikace u běhu vypíše důvod. Poslední slovo má moderátor - běh může
          uznat i zneplatnit ručně. Na konci moderátor zápas uzavře a výsledky
          se tím zamknou.
        </p>
      </div>

      {dungeons.length > 0 && (
        <div className="card">
          <h2>Dungeony v rotaci ({dungeons.length})</h2>
          <ul className="info-list">
            {dungeons.map((dungeon) => (
              <li key={dungeon.dungeonName}>
                {dungeon.dungeonName}{" "}
                <span className="muted">
                  ({dungeon.abbreviation})
                </span>
                {dungeon.bonusMultiplier !== 1 && (
                  <strong> - zvýhodnění ×{dungeon.bonusMultiplier}</strong>
                )}
              </li>
            ))}
          </ul>

          {zvyhodnene.length > 0 && (
            <p className="card-note">
              Zvýhodnění dostávají dungeony, kde část času neovlivníte - typicky
              nucené čekání na NPC. Ušetřený čas se v nich počítá víc, ale nikdy
              tolik, aby nižší klíč porazil vyšší.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Porušení pravidel</h2>
        <ul className="info-list">
          <li>
            Za hrubé porušení pravidel, nesportovní chování nebo podezření na
            programy třetích stran (cheaty) bude hráč ze soutěže vyřazen.
          </li>
          <li>
            Tým pak dostane náhradníka, pokud je nějaký k dispozici. Jinak si
            může náhradu najít sám, ale už bez nároku na výhru.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Něco není jasné?</h2>
        <p className="card-lead">
          Spory o výsledek i technické problémy řeší pořadatel.
        </p>
        <Link className="btn" href="/info/kontakt">
          Kontakt
        </Link>
      </div>
    </>
  );
}
