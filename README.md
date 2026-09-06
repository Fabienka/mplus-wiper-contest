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

Použitelné, ale zatím jen lokálně - na veřejné adrese to ještě neběželo.
Před nasazením si projdi [Nasazení na server](#nasazení-na-server), hlavně
část o časové zóně a o tom, co ještě chybí.

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
- **Veřejné informace** (`/info`) - pravidla soutěže a kontakt, přístupné bez
  přihlášení; z registračního formuláře vede na pravidla odkaz
- **Reset a změna hesla** bez e-mailu - jednorázový odkaz vydá admin nebo
  moderátor na `/admin/hesla`, změna vlastního hesla je v `/profile`
- **Notifikace na Discord** přes webhook - nová přihláška, rozdělení do týmů,
  blížící se termín a nahraný běh; viz [Discord](#discord)
- Audit log u všech admin akcí, zálohy databáze, oddělená testovací databáze

### Chybí

- **Upgrade Next.js na 15/16.** Na řadě 14.x zůstávají dvě `high`
  zranitelnosti, které v ní opravit nejdou (`npm audit` je vypíše).
- Zamítnutí termínu s důvodem, oprava specu postavy z administrace
- ESLint není nakonfigurovaný, takže `next build` reálně nelintuje

## Spuštění

Potřebuješ **Node.js 18.17+** (vyvíjeno na 24) a **PostgreSQL** běžící
lokálně na `localhost:5432`.

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

## Nasazení na server

Aplikace je běžná Next.js appka - `npm run build` a `npm start`, žádný speciální
runtime. Potřebuje **Node 18.17+**, **PostgreSQL** a před sebou **reverse proxy
s HTTPS** (nginx, Caddy, Traefik). Bez HTTPS nenastaví NextAuth secure cookies.

### Proměnné prostředí

Musí to být skutečné proměnné prostředí serveru, ne jen soubor `.env`.

| Proměnná | Nutná | Poznámka |
|---|---|---|
| `DATABASE_URL` | ano | připojení k produkčnímu PostgreSQL |
| `NEXTAUTH_SECRET` | ano | **vygeneruj nový**, ne ten z vývoje: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ano | veřejná adresa včetně `https://` |
| `TZ` | ano | `Europe/Prague`, viz [Časová zóna](#časová-zóna) |
| `NODE_ENV` | ano | `production` |
| `SEED_ADMIN_PASSWORD` | jen při seedu | aspoň 12 znaků |
| `SEED_MODERATOR_PASSWORD` | jen při seedu | aspoň 12 znaků |
| `RAIDERIO_API_BASE` | ne | výchozí `https://raider.io/api/v1` |
| `DISCORD_WEBHOOK_URL` | ne | bez ní se notifikace neposílají, viz [Discord](#discord) |

### Postup

```bash
git clone <repo> && cd wow-mplus-app
npm ci                        # ne npm install - drží se package-lock.json
npx prisma migrate deploy     # NE migrate dev, ten umí nabídnout reset databáze
npm run build
npm start                     # naslouchá na portu 3000, PORT ho přepíše
```

Účty založíš buď seedem (`npm run prisma:seed` s nastavenými `SEED_*` hesly),
nebo si admina vytvoříš ručně a seed vůbec nepouštíš. Seed je idempotentní
a **existujícím účtům heslo nepřepisuje** - mění jen roli. Zapomenuté heslo
se řeší jednorázovým odkazem, ne zásahem do databáze (viz [Hesla](#hesla)).

Proces je potřeba držet naživu a restartovat po pádu (systemd unit, pm2, Docker
- podle toho, co na serveru máš).

### Při každé další aktualizaci

```bash
git pull
npm ci
npx prisma migrate deploy
npm run build
# restart procesu
```

### Na co si dát pozor

- **Zálohy nepojedou.** `scripts/backup-db.ps1` a `register-backup-task.ps1`
  jsou PowerShell pro Windows a čtou `.env` ze souboru. Na Linuxu použij zálohy
  svého poskytovatele databáze nebo vlastní `pg_dump` v cronu.
- **Časová zóna.** Když ji nenastavíš, server při startu spadne s vysvětlením.
  Je to schválně - tiše posunuté časy termínů by si nikdo nevšiml.
- **Raider.io se volá bez timeoutu.** Když jejich API nereaguje, registrace visí,
  dokud request nespadne na timeoutu proxy.
- **Kontakty na `/info/kontakt` jsou prázdné**, dokud je nevyplníš v
  `src/lib/contest-info.ts`. Do té doby stránka jen řekne, že se doplňují -
  schválně nic nevymýšlí, ať lidi nepíšou někam, kde je nikdo nečte.
- **`NEXTAUTH_URL` musí sedět na veřejnou adresu.** Sestavují se z ní odkazy na
  reset hesla, takže při špatné hodnotě vydáš odkaz, který nikam nevede.
- **Omezení pokusů** o přihlášení i registraci se počítá podle IP z hlavičky
  `X-Forwarded-For`. Nastav proxy tak, aby ji posílala pravdivě, jinak budou
  všechny požadavky vypadat jako jedna adresa.

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
npm run check:rate-limit      # omezení počtu pokusů
npm run check:password-reset  # platnost odkazu, kdo komu smí reset vydat
npm run check:discord         # tvar zpráv pro Discord
npm run check:result-flow:test  # celý zápis výsledku proti reálnému běhu
```

Poslední jmenovaný sahá na testovací databázi a na Raider.io, ostatní běží
bez obojího.

## Testovací databáze

Testovací data nepatří do ostré databáze, takže projekt má druhou databázi
(`wow_mplus_app_test`) na stejném lokálním PostgreSQL serveru. Přepínání řeší
`.env.test` (má vlastní `DATABASE_URL` a vlastní `DISCORD_WEBHOOK_URL`).

Ten webhook musí mířit **do testovacího kanálu, nebo být prázdný** - nikdy do
ostrého. Testovací data jinak skončí tam, kde je uvidí účastníci soutěže.

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

## Logo a ikony

Zdroj je `public/logo.png` (212×183). Z něj jsou odvozené:

- `public/icon-16/32/48/64.png` - **výřez hlavy berana**, ne celé logo. V šestnácti
  pixelech je z nápisu „Mythic Dungeon" jen šmouha, kdežto beran je poznat i
  v liště plné karet. Velikosti jsou předpočítané, ať si je prohlížeč
  nezmenšuje sám.
- `public/apple-icon.png` (180×180) - celé logo na čtverci; na ploše telefonu
  je ikona dost velká, aby se dal nápis přečíst.

Odkazuje na ně `metadata.icons` v `src/app/layout.tsx`. `logo.png` slouží
zároveň jako náhled při vložení odkazu na Discord (`openGraph.images`); ten
potřebuje absolutní adresu, takže se bere z `NEXTAUTH_URL`.

Zdrojové logo je malé - kdyby se objevila verze ve větším rozlišení, ikony
je potřeba přegenerovat z ní, hlavně `apple-icon.png`.

## Veřejné informace

`/info` je přístupná bez přihlášení (middleware hlídá jen `/admin` a `/team`)
a má dvě podstránky:

- **`/info/pravidla`** - pravidla soutěže. Čísla se **neopisují ručně**: nejnižší
  bodovaná výška klíče, body za úroveň i seznam dungeonů se berou z aktuální
  sezóny, takže po změně bodování v administraci nemůžou pravidla lhát.
- **`/info/kontakt`** - na koho se obrátit. Obsah je v `src/lib/contest-info.ts`;
  není v databázi schválně - mění se výjimečně a patří do verzí.

Na pravidla vede odkaz z registračního formuláře, od zaškrtávátka se souhlasem.
Otevírá se do nové karty, aby odchod ze stránky nesmazal rozepsanou registraci.

## Role a oprávnění

| | Admin | Moderátor | Uživatel |
|---|---|---|---|
| Vstup do administrace | ano | ano | ne |
| Schválit/zamítnout registraci | ano | ne | ne |
| Potvrdit zápisné | ano | ano | ne |
| Schválit termín zápasu | ano | ano | ne |
| Zadat dostupnost a navrhnout termín za tým | ano | ano | ano (svůj tým) |
| Vydat odkaz na reset hesla | ano (komukoli) | ano (jen uživateli) | ne |
| Sezóna, shuffle, týmy, uživatelé | ano | ne | ne |

Oprávnění jsou na jednom místě v `src/lib/permissions.ts` a ověřují se ve třech
vrstvách: middleware (přístup na cestu), stránka (co se vykreslí) a server
action (`requirePermission`). Poslední vrstva je ta podstatná - server actions
jdou vyvolat i mimo stránku, takže schované tlačítko samo o sobě nic nechrání.

Matici hlídá `npm run check:permissions`, aby budoucí úprava nemohla moderátorovi
tiše přidat práva.

## Hesla

Aplikace neposílá e-maily - není kam připojit SMTP a `email` je při registraci
nepovinný, takže standardní „zapomenuté heslo" e-mailem není možné. Místo něj
je **doručení mimo aplikaci**: odkaz vydá admin nebo moderátor a pošle ho hráči
na Discord.

1. Hráč si na Discordu řekne o reset. Že je to opravdu on, ověří člověk -
   aplikace to poznat nedokáže.
2. Admin nebo moderátor vydá odkaz na `/admin/hesla`. Zobrazí se **jedinkrát**;
   do databáze jde jen jeho SHA-256 otisk, takže ho zpátky nikdo nepřečte.
3. Hráč odkaz otevře a nastaví si heslo sám. Odkaz platí **60 minut** a jde
   použít **jednou**.

Vlastní heslo si každý přihlášený mění v `/profile` (se zadáním stávajícího).
Změna hesla i vydání nového odkazu ruší všechny dosud nepoužité odkazy na ten
účet.

**Moderátor smí vydat odkaz jen běžnému uživateli.** Kdyby směl adminovi,
nastavil by mu heslo a povýšil se - přitom nemá právo měnit role. Rozhoduje o
tom `canIssueResetFor` v `src/lib/password-rules.ts`; seznam na `/admin/hesla`
proto moderátorovi ostatní účty ani neukazuje.

Stránka resetu se neomezuje počtem pokusů schválně: token má 256 bitů náhody a
při neplatném tokenu se ke kontrole hesla vůbec nedojde, takže zkoušení nestojí
víc než jeden otisk a jeden dotaz do indexu.

### Když se nemá kdo přihlásit

Poslednímu adminovi nemá kdo odkaz vydat. Na to je skript, který běží přímo na
serveru:

```bash
npm run reset-password -- admin
```

Vypíše stejný jednorázový odkaz. Spustí ho jen ten, kdo má přístup na server;
v auditu je vidět jako `PASSWORD_RESET_ISSUED_BY_SCRIPT`. Běžné resety patří do
administrace, ať je poznat, kdo je vydal.

Odkazy se sestavují z **`NEXTAUTH_URL`** - bez ní se odkaz nevydá. Po nasazení
na veřejnou adresu ji tedy musí mít i prostředí, ve kterém běží tenhle skript.

## Discord

Aplikace umí posílat notifikace do kanálu na Discordu přes **incoming webhook**.
Není to bot ani přihlašování - jen odchozí zprávy, žádná registrace aplikace
u Discordu není potřeba.

### Nastavení

1. Na Discordu: *Nastavení kanálu → Integrace → Webhooky → Nový webhook*.
   Zvol kanál a zkopíruj URL.
2. Vlož ji serveru jako `DISCORD_WEBHOOK_URL`. Bez ní se notifikace neposílají
   a ani nezapisují do fronty - aplikace jede dál, jen tiše.

URL webhooku je heslo: kdo ji má, může do kanálu psát za aplikaci. Patří mezi
proměnné prostředí, ne do gitu.

### Co se posílá

| Událost | Kdy odejde |
|---|---|
| `NEW_REGISTRATION` | hráč odeslal přihlášku (ještě před schválením) |
| `SHUFFLE_RESULT` | admin potvrdil variantu rozdělení a týmy vznikly |
| `UPCOMING_MATCH` | termín začíná v nejbližších hodinách - posílá cron, viz níž |
| `MATCH_RESULT` | tým nahrál běh; do kanálu jde i neplatný, ať je vidět proč |

Zprávy mají zakázané zmínky (`allowed_mentions`), takže si nikdo nevynutí ping
tím, že si napíše `@everyone` do poznámky k termínu nebo do jména postavy.

Jak zprávy v kanálu vypadají, ukáže náhled - pošle po jedné ukázce od každého
typu, na vymyšlených datech a bez zápisu do databáze:

```bash
npm run discord:preview
npm run discord:preview -- --only MATCH_RESULT
```

Míří do kanálu podle `DISCORD_WEBHOOK_URL` v `.env`, takže se pouští proti
testovacímu Discordu, ne proti ostrému.

### Fronta

Každá notifikace se nejdřív zapíše do tabulky `DiscordEvent` ve stejné
transakci jako změna, která ji vyvolala, a teprve pak se odesílá. Zpráva o něčem,
co nakonec neproběhlo, tak nemůže odejít, a při výpadku Discordu zůstane
událost ve stavu `PENDING` místo aby se ztratila.

Výpadek Discordu nikdy neshodí akci uživatele - chyba se jen zaloguje. Ve
`status` je pak vidět, jak to dopadlo: `SENT` odesláno, `PENDING` čeká na další
pokus, `FAILED` Discord požadavek odmítl a opakování by dopadlo stejně.

### Cron

Připomínky termínů a dorovnání fronty nemá co spustit - aplikace nemá plánovač.
Pouští je skript, ideálně jednou za hodinu:

```bash
npm run discord:notify
```

```
0 * * * * cd /cesta/k/aplikaci && npm run discord:notify >> /var/log/mplus-discord.log 2>&1
```

Skript se dá pouštět opakovaně: na jeden termín upozorní jen jednou. Výchozí
předstih je 24 hodin, `-- --hours 3` ho zkrátí. S `-- --dry-run` jen vypíše,
co by odešlo - dobré na vyzkoušení, než se cron nasadí.

Bez cronu funguje všechno ostatní, jen nechodí připomínky termínů a zprávy
zdržené výpadkem zůstanou ve frontě.

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
