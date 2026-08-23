# Mythic+ Wiper Contest – appka (kostra projektu)

Tohle je první průchod kostrou projektu: **datový model (Prisma) + auth + registrační flow**.
Zbytek (admin rozhraní, shuffle algoritmus, zápasy, žebříček, Discord webhook) přijde v dalších krocích.

## Co je hotové

- Prisma schema (`prisma/schema.prisma`) odpovídající dohodnutému datovému modelu
- Přihlášení přes username/heslo (NextAuth, `src/lib/auth.ts`)
- Registrační formulář (`/register`) – vytvoří `User` + `Character` (data z Raider.io) + `SeasonRegistration` se stavem `PENDING`
- Middleware chránící `/admin` podle role
- Seed skript (`prisma/seed.ts`) – admin účet + otevřená sezóna pro lokální vývoj

## Co chybí (další kroky)

- Admin rozhraní (schvalování registrací, ruční úpravy, audit log)
- Shuffle algoritmus + zobrazení 3 variant adminovi
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

## Poznámky k architektuře

- **1 uživatel = 1 postava** – `Character.userId` je unique. Pokud se do budoucna přidá podpora víc postav na uživatele, stačí unique constraint zrušit; zbytek modelu (TeamMembership, SeasonRegistration) už visí na `characterId`, ne na `userId`.
- **Raider.io lookup** (`src/lib/raiderio.ts`) parsuje URL zadanou uživatelem a volá veřejné Raider.io API. Zatím nemá error handling pro všechny edge-case formáty URL – bude potřeba doladit podle reálných odkazů, které lidi budou zadávat.
- **Formulář je verzovaný natvrdo v kódu** – aktuální `/register` stránka odpovídá zjednodušené verzi formuláře. Pro každou sezónu s jinými otázkami se počítá s tím, že se stránka/schema v `route.ts` upraví ručně (podle rozhodnutí nepoužívat zatím dynamický form builder).
