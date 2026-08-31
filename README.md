# Mythic+ Wiper Contest

Aplikace pro pořádání soutěže v Mythic+ dungeonech: přihlášky hráčů, rozdělení
do týmů, domlouvání termínů, evidence odehraných běhů a jejich bodování.

## Jak soutěž funguje

1. Hráč se přihlásí odkazem na svůj **Raider.io profil**; admin přihlášku schválí
   a moderátor potvrdí zaplacené **zápisné** (platí se ve hře).
2. Po uzavření registrace spustí admin **shuffle** - algoritmus rozdělí hráče do
   týmů po pěti (1 tank, 1 healer, 3 DPS) a nabídne tři varianty na výběr.
3. Členové týmu si zadají, **kdy mají čas**; z překryvů se navrhne termín, který
   moderátor schválí.
4. V termínu má tým zhruba dvě hodiny na odehrání klíčů. Výsledek nahraje
   **odkazem na běh z Raider.io**, aplikace si čas i sestavu stáhne sama.
5. Počítá se **jediný nejlepší běh**. Moderátor zápas uzavře a výsledky se
   zamknou.
6. Veřejný **žebříček** (`/leaderboard`) řadí týmy podle jejich nejlepšího
   běhu sezóny.

Podrobná pravidla jsou v sekcích [Role a oprávnění](#role-a-oprávnění),
[Bodování](#bodování) a [Výsledky běhů](#výsledky-běhů).

## Stav projektu

Rozpracované na větvi **`shuffle-algoritmus`**, nic nepushnuto. Sloučení:

```bash
git checkout main && git merge shuffle-algoritmus
```

### Hotové

- Přihlášení username/heslo (NextAuth), role **admin / moderátor / uživatel**
  s oprávněními v `src/lib/permissions.ts`, správa rolí na `/admin/users`
- Registrace do sezóny přes Raider.io profil, schvalování adminem, potvrzení
  zápisného moderátorem
- Správa sezóny a dungeonů včetně stažení časových limitů z Raider.io
- **Shuffle** (`src/lib/shuffle.ts`) - tři varianty rozdělení s vysvětlením
  porušených pravidel, ruční úprava týmů a smazání rozdělení
- **Kalendář dostupností a termíny** - `/team` pro hráče, `/admin/matches` pro
  moderátora, měsíční kalendář s událostmi
- **Bodování** (`src/lib/scoring.ts`) a **výsledky běhů** - nahrání odkazu,
  ověření, uzavření zápasu
- **Žebříček** (`/leaderboard`) - veřejný, podle nejlepšího běhu sezóny
- Uživatelská část: `/profile` s přihláškou a stavem zápisného, statistiky
  o složení pole na úvodní stránce
- Audit log u všech admin akcí, zálohy databáze, oddělená testovací databáze

### Chybí

- Discord webhook (`DiscordEvent` je zatím model bez kódu)
- Zamítnutí termínu s důvodem, oprava specu postavy z administrace
- Administrace není použitelná na mobilu, ESLint není nakonfigurovaný

## Spuštění

Potřebuješ **Node.js** a **PostgreSQL** běžící lokálně na `localhost:5432`.

```bash
npm install
cp .env.example .env          # uprav DATABASE_URL a NEXTAUTH_SECRET
npx prisma migrate deploy     # vytvoří tabulky
npm run prisma:seed           # admin účet + otevřená sezóna
npm run dev                   # http://localhost:3000
```

Seed založí **`admin` / `admin1234`** a **`moderator` / `moderator1234`**
(jde přepsat proměnnými `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` a
obdobně pro moderátora). Na prohlížení dat slouží `npx prisma studio`.

S `NODE_ENV=production` se výchozí hesla **nepoužijí** - `SEED_ADMIN_PASSWORD`
i `SEED_MODERATOR_PASSWORD` musí přijít z prostředí a mít aspoň 12 znaků,
jinak seed skončí chybou. Hesla se v tom režimu ani nevypisují do logu.

## Časová zóna

Aplikace formátuje i parsuje všechny termíny v **systémové zóně serveru** -
nikde se zóna nepředává explicitně. Hosting proto musí mít proměnnou prostředí:

```
TZ=Europe/Prague
```

Musí to být skutečná proměnná prostředí, ne řádek v `.env` - Node si zónu čte
při startu procesu, dřív než se `.env` vůbec načte. Bez ní běží server v UTC
a všechny časy se ukazují o hodinu (v létě o dvě) posunuté, aniž by cokoliv
spadlo.

Aby to nešlo přehlédnout, `src/instrumentation.ts` zónu při startu kontroluje:
na produkci server rovnou spadne s vysvětlením, v dev jen napíše varování.

## Kontrolní skripty

Projekt zatím nemá test runner, logika se ověřuje samostatnými skripty:

```bash
npm run check:shuffle         # rozdělení do týmů
npm run check:scoring         # bodování běhů
npm run check:match-result    # ověření běhu proti zápasu
npm run check:availability    # překryvy dostupností
npm run check:calendar        # měsíční mřížka
npm run check:permissions     # matice oprávnění
npm run check:stats           # statistiky na úvodní stránce
npm run check:leaderboard     # žebříček týmů
npm run check:result-flow:test  # celý zápis výsledku proti reálnému běhu
```

Poslední jmenovaný sahá na testovací databázi a na Raider.io, ostatní běží
bez obojího.

## Testovací databáze

Testovací data nepatří do ostré databáze, takže projekt má druhou databázi
(`wow_mplus_app_test`) na stejném lokálním PostgreSQL serveru. Přepínání řeší
`.env.test` (má vlastní `DATABASE_URL` a **prázdný `DISCORD_WEBHOOK_URL`**, aby
testovací běh neposílal notifikace do ostrého kanálu).

```bash
npm run dev:test              # appka proti testovací DB
npm run prisma:migrate:test   # migrace testovací DB
npm run prisma:studio:test    # prohlížení testovacích dat
npm run seed:players:test     # vygeneruje 33 schválených hráčů na vyzkoušení shuffle
npm run db:test:reset         # smaže a znovu založí testovací DB
```

Po každé změně `schema.prisma` je potřeba migrovat **obě** databáze – jinak
testy běží proti starému schématu a nic to nenahlásí.

Oba seed skripty se samy brání spuštění nad databází, jejíž název neobsahuje
„test“.

### Testovací účty

| Účet | Heslo | Role | Odkud |
|---|---|---|---|
| `admin` | `admin1234` | admin | `prisma:seed` |
| `moderator` | `moderator1234` | moderátor | `prisma:seed` |
| `testplayer-tank-0` … | `test1234` | uživatel | `seed:players:test` (33 hráčů, 6 týmů) |
| `runteam-thórus` … | `test1234` | uživatel | `seed:run-team:test` (tým z reálného běhu) |

Kompletní příprava testovacího prostředí od nuly:

```bash
npm run db:test:reset         # schéma + admin a moderátor
npm run seed:players:test     # 33 hráčů pro shuffle
npm run seed:run-team:test    # tým z reálného běhu pro výsledky
npm run dev:test
```

## Zálohy

`scripts/backup-db.ps1` dělá `pg_dump` ostré databáze do `backups/` (složka je
v `.gitignore`, zálohy obsahují reálná data) a maže zálohy starší 30 dní.
Naplánovaná úloha Windows `WowMplusApp-DbBackup` ho spouští v 8:00 a 20:00;
registruje ji `scripts/register-backup-task.ps1`.

```bash
npm run backup:db
```

Dvě omezení, o kterých je dobré vědět: úloha běží jen když je uživatel
přihlášený (zmeškaný běh se nedohání) a zálohy leží na stejném disku jako
databáze – proti selhání disku tedy nechrání.

## Role a oprávnění

| | Admin | Moderátor | Uživatel |
|---|---|---|---|
| Vstup do administrace | ano | ano | ne |
| Schválit/zamítnout registraci | ano | ne | ne |
| Potvrdit zápisné | ano | ano | ne |
| Schválit termín zápasu | ano | ano | ne |
| Zadat dostupnost a navrhnout termín za tým | ano | ano | ano (svůj tým) |
| Sezóna, shuffle, týmy, uživatelé | ano | ne | ne |

Oprávnění jsou na jednom místě v `src/lib/permissions.ts` a ověřují se ve třech
vrstvách: middleware (přístup na cestu), stránka (co se vykreslí) a server
action (`requirePermission`). Poslední vrstva je ta podstatná - server actions
jdou vyvolat i mimo stránku, takže schované tlačítko samo o sobě nic nechrání.

Matici hlídá `npm run check:permissions`, aby budoucí úprava nemohla moderátorovi
tiše přidat práva.

## Bodování

```
skóre = (výška klíče − minScoredKeyLevel) × pointsPerKeyLevel
        + 100 × (1 − čas běhu / časový limit klíče)
```

Druhý člen je procento limitu, které tým nevyčerpal - tím se srovnají různě
dlouhé dungeony, protože 20 % ušetřeného času znamená všude totéž.

Pravidla, která z toho plynou:

- **Nestihnutý klíč se neboduje vůbec**, nedostane ani nulu. Platnost se bere
  z verdiktu hry (`num_keystone_upgrades`), ne z porovnání s naším uloženým
  časem - odpadá tím dohadování o doběhu přesně na limitu.
- **Klíče pod `minScoredKeyLevel` se nebodují** ani když je tým stihne; berou se
  jen jako rozběh na vytažení klíče.
- **Vyšší klíč porazí nižší vždycky.** Časový bonus je vždy menší než 100 a
  jedna úroveň má aspoň 100 bodů - proto `parseScoringConfig` nižší hodnotu
  odmítne.
- Týmu se počítá **jen nejlepší bodovaný běh**; neúspěšný pokus ho nepřipraví
  o dřív dosažený výsledek.
- Procenta se počítají proti limitu **konkrétního běhu** z Raider.io, ne proti
  ručně udržovanému času u dungeonu. Ten slouží jen jako záloha pro výsledky
  ze screenshotů.
- `SeasonDungeon.bonusMultiplier` umožňuje dungeon **ručně zvýhodnit** - hodí se
  tam, kde tým část času neovlivní (nucené čekání na NPC). 1 = bez zvýhodnění.
  Bonus se usekne těsně pod 100, takže ani vysoký násobitel nedovolí nižšímu
  klíči porazit vyšší; strop odpovídá teoreticky nejrychlejšímu doběhu, aby
  mezi úrovněmi klíče zůstala mezera.

Kontroluje se `npm run check:scoring`.

## Výsledky běhů

Tým nahraje odkaz na běh z Raider.io, aplikace si čas i sestavu stáhne sama -
opsané číslo by se dalo zfalšovat. Ověřuje se, že běh patří týmu (celá sestava
musí být z týmu), spadá do okna zápasu a je z dungeonu v rotaci; teprve pak se
boduje. Neplatný běh se ukládá taky, jen s důvodem - tým i moderátor pak vidí,
že se pokus stal a proč se nepočítá.

Týmu se počítá **jen nejlepší platný běh** (`MatchResult.isOfficial`), který se
přepočítává po každé změně. Neúspěšný pokus o vyšší klíč tým nepřipraví o dřív
dosažený výsledek.

Zápas uzavírá moderátor ručně, ne automaticky koncem okna - jde tak doplnit běh
odehraný těsně před koncem. Po uzavření se výsledky zamknou; moderátor může
zápas znovu otevřít.

Kontroluje se `npm run check:match-result` (logika bez databáze) a
`npm run check:result-flow:test` (celý průchod proti reálnému běhu z Raider.io).

**Aplikace běžící v sandboxu nemá přístup na Raider.io**, zatímco skripty ano -
proto ten druhý kontrolní skript existuje. Na běžném stroji stahování z prohlížeče
funguje.

## Žebříček

Řadí se podle **jediného nejlepšího platného běhu sezóny**, ne podle součtu -
soutěž je postavená na jednom výkonu v rámci dvouhodinového termínu.

- Neplatné běhy se ignorují, takže tým s vysokým skóre z nepočítaného běhu
  zůstane bez pořadí.
- Tým, který něco odběhl, ale nemá platný běh, v žebříčku zůstane - jen bez
  pořadí. Týmy bez jediného běhu jsou vypsané zvlášť pod tabulkou.
- Shoda bodů znamená **sdílené umístění** (1., 2., 2., 4.). Při shodě je
  v pořadí dřív ten, kdo výkonu dosáhl první.

Stránka je veřejná, přihlášení nevyžaduje. Kontroluje se
`npm run check:leaderboard`.

## Testovací tým z reálného běhu

```bash
npm run seed:run-team:test          # výchozí běh
npm run seed:run-team:test -- <odkaz na běh>
```

Založí tým ze sestavy konkrétního běhu na Raider.io. Hodí se, když je potřeba
mít data, na která sedí i stažení výsledku. Přihlášení:
`runteam-<jméno postavy malými písmeny>` / `test1234`.

## Dev server a kontrolní build

`next build` a `next dev` si sdílejí adresář `.next`. Build spuštěný za běhu
dev serveru mu přepíše chunky a stránka se pak načte bez CSS a bez JS
(vypadá to jako rozbité styly, ale kód je v pořádku). Kontrolní build proto
běží do vlastního adresáře:

```bash
npm run build:check
```

Když se přesto stane, že se stránka načte neostylovaná, pomůže smazat `.next`
a spustit dev server znovu.

**Po migraci schématu je potřeba dev server restartovat** - drží si v paměti
Prisma klient vygenerovaný při startu, takže by jinak hlásil neexistující sloupec.

## Responzivita

Layout je řešený v `src/app/globals.css`, zlomy na 900 px (administrace: sidebar
nad obsah, navigace do řádku) a 640 px (lišta, formuláře a popisky pod sebe).
Široké tabulky a kalendář se rolují **uvnitř své karty**, ne celou stránkou.

Dvě věci, na které je potřeba myslet při úpravách:

- Grid track musí být `minmax(0, 1fr)`, ne `1fr`. Track s `1fr` má implicitně
  `min-width: auto`, takže se nesmrskne pod šířku obsahu a jedna široká tabulka
  roztáhne celou stránku.
- `color-mix()` a `dvh` mají v CSS uvedené jednodušší fallbacky kvůli starším
  Safari (`color-mix` je od 16.2, `dvh` od 15.4).

**Testování na Apple zařízeních:** vestavěný prohlížeč je Chromium, takže jde
emulovat rozměr a dotyk iPhonu, ale ne WebKit. Chyby specifické pro Safari
(hlavně vzhled `datetime-local` a chování `100vh`) tím odchytit nejdou -
na to je potřeba reálné zařízení nebo Playwright s WebKitem.

## Poznámky k architektuře

- **1 uživatel = 1 postava** – `Character.userId` je unique. Pokud se do budoucna přidá podpora víc postav na uživatele, stačí unique constraint zrušit; zbytek modelu (TeamMembership, SeasonRegistration) už visí na `characterId`, ne na `userId`.
- **Raider.io lookup** (`src/lib/raiderio.ts`) parsuje URL zadanou uživatelem a volá veřejné Raider.io API. Zatím nemá error handling pro všechny edge-case formáty URL – bude potřeba doladit podle reálných odkazů, které lidi budou zadávat.
- **Shuffle** (`src/lib/shuffle.ts`) je čistá funkce bez databáze – vygeneruje 300 náhodných
  rozdělení, každé zlepší lokálním prohledáváním a vrátí 3 nejlepší vzájemně odlišné varianty.
  Kontroluje se skriptem `npm run check:shuffle` (v projektu zatím není test runner).
  Dvě odchylky od původního zadání jsou okomentované přímo v kódu: počet týmů omezuje i
  nejvzácnější role (ne jen `floor(hráčů/5)`) a váhy pravidel se odvozují z počtu týmů,
  aby se vyšší pravidlo nikdy neobětovalo kvůli součtu porušení nižšího.
- **Ruční úprava týmů** (`/admin/teams`) hlídá stejná pravidla jako shuffle - obojí volá
  `describeSharedViolations` v `src/lib/shuffle.ts`, aby se hodnocení nerozešlo. Rozbité složení
  týmu se schválně nezakazuje (admin může potřebovat mezikrok), jen se označí. Nekontroluje se
  pokrytí košů - koše jsou pomůcka losování a po rozdělení se nedrží.
- **Smazání rozdělení** vrátí použitý `ShuffleRun` zpět na `PROPOSED`, takže jde použít jiná
  varianta. Neprojde, pokud na týmech visí zápasy - to se kontroluje dopředu, aby admin dostal
  srozumitelnou hlášku místo chyby cizího klíče.
- **Tabulka speců** (`src/lib/wow-specs.ts`) drží ranged/melee, battle rez a bloodlust pro
  každou class/spec. Neodvozuje se automaticky – **při každém větším patchi je potřeba ji projít**
  a aktualizovat `LAST_VERIFIED`. Drums se do ní zanést nedají (nezávisí na class), takže shuffle
  hlásí „chybí bloodlust“ i tam, kde by je tým pokryl drumy.
- **Kalendář termínů** (`/team`): každý člen týmu si zadá, kdy má čas, a `src/lib/availability.ts`
  z toho přejezdem událostí spočítá úseky, kdy může celý tým. Když společný termín pro všech pět
  neexistuje, stránka postupně povolí jednoho a dva chybějící, ať nezůstane prázdná. Návrh termínu
  může založit kdokoli z týmu, schvaluje ho moderátor. Kontroluje se `npm run check:availability`.
- **Měsíční kalendář** (`src/app/month-calendar.tsx`) je server komponenta - listování měsíců jde
  přes odkazy s `?month=YYYY-MM`, takže funguje i bez JavaScriptu a na konkrétní měsíc se dá poslat
  odkaz. Sestavení mřížky a mapování událostí na dny je v `src/lib/calendar.ts`, kontroluje se
  `npm run check:calendar`. Týden začíná pondělím, událost přes půlnoc se ukáže u obou dnů.
- **Časy se ukládají v UTC** a zobrazují v místním čase (`toDateTimeLocal`, `formatRange`).
  Při ručním vkládání do databáze přes SQL je potřeba na to myslet - holý timestamp se přečte
  jako UTC a v aplikaci se ukáže posunutý.
- **Zápisné** je samostatná brána vedle schválení registrace, ne jeho náhrada - hráč může být
  schválený a nezaplacený i naopak. Do shuffle zatím vstupují všichni schválení bez ohledu na
  platbu (vědomé rozhodnutí, ne opomenutí).
- **Formulář je verzovaný natvrdo v kódu** – aktuální `/register` stránka odpovídá zjednodušené verzi formuláře. Pro každou sezónu s jinými otázkami se počítá s tím, že se stránka/schema v `route.ts` upraví ručně (podle rozhodnutí nepoužívat zatím dynamický form builder).
