#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ROOT_DIR="${ROOT_DIR:-$DEFAULT_ROOT_DIR}"
SRC_DIR="$ROOT_DIR"
HOME_ROOT="${HOME_ROOT:-/var/www/mittagstisch/home}"
HOME_CURRENT="$HOME_ROOT/current"
HOME_RELEASES="$HOME_ROOT/releases"
STAMP="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$HOME_RELEASES/$STAMP"

echo "==> Build home static release in $RELEASE_DIR"
sudo mkdir -p "$HOME_RELEASES" "$HOME_ROOT"
sudo rm -rf "$RELEASE_DIR"
sudo mkdir -p "$RELEASE_DIR/assets" "$RELEASE_DIR/agb" "$RELEASE_DIR/datenschutz" "$RELEASE_DIR/copyright"

for file in index.html manifest.json service-worker.js; do
  if [ ! -f "$SRC_DIR/$file" ]; then
    echo "Missing source file: $SRC_DIR/$file"
    exit 1
  fi
done

if [ ! -d "$SRC_DIR/assets" ]; then
  echo "Missing source directory: $SRC_DIR/assets"
  exit 1
fi

for dir in agb datenschutz copyright; do
  if [ ! -d "$SRC_DIR/$dir" ]; then
    echo "Missing source directory: $SRC_DIR/$dir"
    exit 1
  fi
done

sudo rsync -a --delete "$SRC_DIR/assets/" "$RELEASE_DIR/assets/"
sudo rsync -a --delete "$SRC_DIR/agb/" "$RELEASE_DIR/agb/"
sudo rsync -a --delete "$SRC_DIR/datenschutz/" "$RELEASE_DIR/datenschutz/"
sudo rsync -a --delete "$SRC_DIR/copyright/" "$RELEASE_DIR/copyright/"
sudo install -m 0644 "$SRC_DIR/index.html" "$RELEASE_DIR/index.html"
sudo install -m 0644 "$SRC_DIR/manifest.json" "$RELEASE_DIR/manifest.json"
sudo install -m 0644 "$SRC_DIR/service-worker.js" "$RELEASE_DIR/service-worker.js"
sudo ln -sfn "$RELEASE_DIR" "$HOME_CURRENT"

echo "==> Home deploy done"
