#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="${ROOT_DIR:-$DEFAULT_ROOT_DIR}"
API_DIR="$ROOT_DIR/backend"

echo "==> Deploy API in $API_DIR"
cd "$API_DIR"

# Load .env for DATA_STORE / DATABASE_URL checks (if present).
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

npm ci

# Website synchronization renders public JavaScript menu pages with Chromium.
# Keep the browser next to the API so PM2 and the deploy process use the same binary.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$API_DIR/.playwright-browsers}"
npx playwright install chromium

DATA_STORE_VALUE="${DATA_STORE:-}"
if [ -z "$DATA_STORE_VALUE" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    DATA_STORE_VALUE="prisma"
  else
    DATA_STORE_VALUE="memory"
  fi
fi

if [ "$DATA_STORE_VALUE" = "prisma" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATA_STORE=prisma but DATABASE_URL is empty."
    exit 1
  fi
  npm run prisma:generate
  npm run prisma:migrate:deploy
else
  echo "==> DATA_STORE=$DATA_STORE_VALUE (skip Prisma migrate)"
fi

npm run build

CURRENT_PM2_CWD="$(
  pm2 jlist | node -e '
    const fs = require("node:fs");
    const list = JSON.parse(fs.readFileSync(0, "utf8"));
    const app = list.find((entry) => entry.name === "mittagstisch-api");
    process.stdout.write(app?.pm2_env?.pm_cwd || "");
  '
)"

if [ -n "$CURRENT_PM2_CWD" ] && [ "$CURRENT_PM2_CWD" != "$API_DIR" ]; then
  echo "==> PM2 app mittagstisch-api points to $CURRENT_PM2_CWD (expected $API_DIR). Rebinding..."
  pm2 delete mittagstisch-api || true
fi

pm2 startOrRestart ecosystem.config.cjs --only mittagstisch-api --update-env

pm2 save
echo "==> API deploy done"
