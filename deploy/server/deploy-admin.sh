#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="${ROOT_DIR:-$DEFAULT_ROOT_DIR}"
SRC_DIR="$ROOT_DIR"
ADMIN_ROOT="${ADMIN_ROOT:-/var/www/mittagstisch/admin}"
ADMIN_CURRENT="$ADMIN_ROOT/current"
ADMIN_RELEASES="$ADMIN_ROOT/releases"
STAMP="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$ADMIN_RELEASES/$STAMP"

echo "==> Build admin static release in $RELEASE_DIR"
sudo mkdir -p "$ADMIN_RELEASES" "$ADMIN_ROOT"
sudo rm -rf "$RELEASE_DIR"
sudo mkdir -p "$RELEASE_DIR/assets"

for file in admin.html manifest.json service-worker.js; do
  if [ ! -f "$SRC_DIR/$file" ]; then
    echo "Missing source file: $SRC_DIR/$file"
    exit 1
  fi
done

if [ ! -d "$SRC_DIR/assets" ]; then
  echo "Missing source directory: $SRC_DIR/assets"
  exit 1
fi

sudo rsync -a --delete "$SRC_DIR/assets/" "$RELEASE_DIR/assets/"
sudo install -m 0644 "$SRC_DIR/admin.html" "$RELEASE_DIR/admin.html"
sudo install -m 0644 "$SRC_DIR/manifest.json" "$RELEASE_DIR/manifest.json"
sudo install -m 0644 "$SRC_DIR/service-worker.js" "$RELEASE_DIR/service-worker.js"
sudo ln -sfn "$RELEASE_DIR" "$ADMIN_CURRENT"

echo "==> Admin deploy done"
