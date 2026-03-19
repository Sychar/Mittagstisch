#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/srv/mittagstisch}"
WEB_DIR="$ROOT_DIR/mobile"
WEB_ROOT="${WEB_ROOT:-/var/www/mittagstisch/app}"
WEB_CURRENT="$WEB_ROOT/current"
WEB_RELEASES="$WEB_ROOT/releases"
STAMP="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$WEB_RELEASES/$STAMP"

if [ -z "${EXPO_PUBLIC_API_URL:-}" ]; then
  echo "EXPO_PUBLIC_API_URL is not set. Example:"
  echo "EXPO_PUBLIC_API_URL=https://api.deinedomain.de bash deploy/server/deploy-web.sh"
  exit 1
fi

echo "==> Build web in $WEB_DIR"
cd "$WEB_DIR"
npm ci
npm run build:web

echo "==> Publish web release $RELEASE_DIR"
sudo mkdir -p "$WEB_RELEASES" "$WEB_ROOT"
sudo rm -rf "$RELEASE_DIR"
sudo mkdir -p "$RELEASE_DIR"
sudo rsync -a --delete "$WEB_DIR/dist-web/" "$RELEASE_DIR/"
sudo ln -sfn "$RELEASE_DIR" "$WEB_CURRENT"

echo "==> Web deploy done"
