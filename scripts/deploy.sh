#!/bin/bash
set -e

APP_DIR="/var/www/mplus-wiper-contest.fredrik.cz"
PM2_APP_NAME="mplus-wiper"
BACKUP_DIR="$APP_DIR/backups"
BACKUP_RETENTION_DAYS=30

echo "🚀 Startuji deployment Mythic+ Wiper Contest..."

cd "$APP_DIR"

echo "🔑 Nacitam produkcni promenne prostredi z .env.production..."
if [ ! -f .env.production ]; then
    echo "❌ Chybi $APP_DIR/.env.production" >&2
    exit 1
fi
set -a
source .env.production
set +a

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL neni nastavena" >&2
    exit 1
fi

echo "📥 Stahuji aktualni kod z GitHubu..."
git pull

echo "📦 Instaluji zavislosti..."
npm ci

echo "💾 Zalohuji databazi..."
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
echo "   -> $BACKUP_FILE"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "⏸️ Zastavuji PM2 proces (aby migrace nebezela proti zivym zapisum)..."
pm2 stop "$PM2_APP_NAME" || true

echo "🗃️ Aplikuji migrace databaze..."
npx prisma migrate deploy

echo "🏗️ Buildim aplikaci (Next.js)..."
npm run build

echo "▶️ Startuji PM2 proces..."
pm2 start npm --name "$PM2_APP_NAME" --update-env -- start

echo "✅ Hotovo! Aplikace bezi v nove verzi."
