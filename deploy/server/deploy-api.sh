#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/srv/mittagstisch}"
API_DIR="$ROOT_DIR/backend"

echo "==> Deploy API in $API_DIR"
cd "$API_DIR"

npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build

if pm2 describe mittagstisch-api >/dev/null 2>&1; then
  pm2 restart mittagstisch-api --update-env
else
  pm2 start ecosystem.config.cjs --only mittagstisch-api
fi

pm2 save
echo "==> API deploy done"
