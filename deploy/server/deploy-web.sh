#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="${ROOT_DIR:-$DEFAULT_ROOT_DIR}"
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

# Production-web defaults are explicit so a clean shell cannot silently hide
# Events or expose Preview-only features.
export EXPO_PUBLIC_EVENTS_ENABLED="1"
export EXPO_PUBLIC_CATERING_ENABLED="0"
export EXPO_PUBLIC_WEBSITE_SYNC_ENABLED="0"
export EXPO_PUBLIC_REVIEW_REPORTING_ENABLED="0"
export EXPO_PUBLIC_DISCOVERY_HOME_ENABLED="0"

echo "==> Production feature flags"
echo "    Events: $EXPO_PUBLIC_EVENTS_ENABLED"
echo "    Catering: $EXPO_PUBLIC_CATERING_ENABLED"
echo "    Website sync: $EXPO_PUBLIC_WEBSITE_SYNC_ENABLED"
echo "    Review reporting: $EXPO_PUBLIC_REVIEW_REPORTING_ENABLED"
echo "    Discovery home: $EXPO_PUBLIC_DISCOVERY_HOME_ENABLED"

echo "==> Build web in $WEB_DIR"
cd "$WEB_DIR"
npm ci
# Clear Expo/Metro caches so EXPO_PUBLIC_API_URL changes are always picked up.
npx expo export --platform web --output-dir dist-web --clear

echo "==> Publish web release $RELEASE_DIR"
sudo mkdir -p "$WEB_RELEASES" "$WEB_ROOT"
sudo rm -rf "$RELEASE_DIR"
sudo mkdir -p "$RELEASE_DIR"
sudo rsync -a --delete "$WEB_DIR/dist-web/" "$RELEASE_DIR/"
sudo ln -sfn "$RELEASE_DIR" "$WEB_CURRENT"

echo "==> Web deploy done"
