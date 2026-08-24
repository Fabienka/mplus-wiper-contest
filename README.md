# Mythic+ Wiper Contest – appka (kostra projektu)

Tohle je první průchod kostrou projektu: **datový model (Prisma) + auth + registrační flow**.
Zbytek (admin rozhraní, shuffle algoritmus, zápasy, žebříček, Discord webhook) přijde v dalších krocích.

## Co je hotové

- Prisma schema (`prisma/schema.prisma`) odpovídající dohodnutému datovému modelu
- Přihlášení přes username/heslo (NextAuth, `src/lib/auth.ts`)
- Registrační formulář (`/register`) – vytvoří `User` + `Character` (data z Raider.io) + `SeasonRegistration` se stavem `PENDING`
- Middleware chránící `/admin` podle role
- Admin rozhraní – schvalování registrací, správa sezóny a dungeonů, audit log
- Shuffle algoritmus (`src/lib/shuffle.ts`) + admin stránka `/admin/shuffle` se 3 variantami
- Seed skript (`prisma/seed.ts`) – admin účet + otevřená sezóna pro lokální vývoj
- Oddělená testovací databáze a zálohování ostré databáze (viz níže)

## Co chybí (další kroky)

- Ruční úprava navržené varianty před potvrzením (teď jde varianta jen přijmout celá)
- Smazání rozdělených týmů z admin rozhraní (zatím jen ručně přes Prisma Studio)
- Zápasy, návrhy termínů, stahování výsledků z Raider.io v časovém okně
- Žebříček
- Discord webhook

## Spuštění (protože tady v sandboxu appku spustit nejde – bez připojení k internetu a bez PostgreSQL)

1. **Nainstaluj závislosti**
   ```bash
   npm install
   ```

2. **Priprav PostgreSQL databázi** (lokálně nebo např. přes Docker):
   ```bash
   docker run --name wow-mplus-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=wow_mplus_app -p 5432:5432 -d postgres:16
   ```

3. **Zkopíruj `.env.example` na `.env`** a uprav `DATABASE_URL` a `NEXTAUTH_SECRET`:
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # vlož výsledek jako NEXTAUTH_SECRET
   ```

4. **Spusť migraci** (vytvoří tabulky podle schema.prisma):
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Vytvoř testovací sezónu a admina** – seed skript (`prisma/seed.ts`) je idempotentní, dá se pustit opakovaně:
   ```bash
   npm run prisma:seed
   ```
   Založí admin účet (`admin` / `admin1234`, jde přepsat přes `SEED_ADMIN_USERNAME` a `SEED_ADMIN_PASSWORD`)
   a sezónu se `status = REGISTRATION_OPEN` včetně placeholder dungeonů, aby šlo projít `/register`.
   Na prohlížení a ruční úpravy dat slouží `npx prisma studio`.

6. **Spusť appku**
   ```bash
   npm run dev
   ```
   Appka poběží na http://localhost:3000, registrace na http://localhost:3000/register.

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

`scripts/seed-test-players.ts` se sám brání spuštění nad databází, jejíž název
neobsahuje „test“.

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

## Poznámky k architektuře

- **1 uživatel = 1 postava** – `Character.userId` je unique. Pokud se do budoucna přidá podpora víc postav na uživatele, stačí unique constraint zrušit; zbytek modelu (TeamMembership, SeasonRegistration) už visí na `characterId`, ne na `userId`.
- **Raider.io lookup** (`src/lib/raiderio.ts`) parsuje URL zadanou uživatelem a volá veřejné Raider.io API. Zatím nemá error handling pro všechny edge-case formáty URL – bude potřeba doladit podle reálných odkazů, které lidi budou zadávat.
- **Shuffle** (`src/lib/shuffle.ts`) je čistá funkce bez databáze – vygeneruje 300 náhodných
  rozdělení, každé zlepší lokálním prohledáváním a vrátí 3 nejlepší vzájemně odlišné varianty.
  Kontroluje se skriptem `npm run check:shuffle` (v projektu zatím není test runner).
  Dvě odchylky od původního zadání jsou okomentované přímo v kódu: počet týmů omezuje i
  nejvzácnější role (ne jen `floor(hráčů/5)`) a váhy pravidel se odvozují z počtu týmů,
  aby se vyšší pravidlo nikdy neobětovalo kvůli součtu porušení nižšího.
- **Tabulka speců** (`src/lib/wow-specs.ts`) drží ranged/melee, battle rez a bloodlust pro
  každou class/spec. Neodvozuje se automaticky – **při každém větším patchi je potřeba ji projít**
  a aktualizovat `LAST_VERIFIED`. Drums se do ní zanést nedají (nezávisí na class), takže shuffle
  hlásí „chybí bloodlust“ i tam, kde by je tým pokryl drumy.
- **Formulář je verzovaný natvrdo v kódu** – aktuální `/register` stránka odpovídá zjednodušené verzi formuláře. Pro každou sezónu s jinými otázkami se počítá s tím, že se stránka/schema v `route.ts` upraví ručně (podle rozhodnutí nepoužívat zatím dynamický form builder).
