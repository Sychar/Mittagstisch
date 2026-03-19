#!/usr/bin/env bash
set -euo pipefail

echo "==> Install system dependencies"
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx rsync curl ca-certificates gnupg

echo "==> Install Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "==> Install PM2"
sudo npm install -g pm2

echo "==> Create project directory"
sudo mkdir -p /srv/mittagstisch
sudo chown -R "$USER:$USER" /srv/mittagstisch

echo "==> Bootstrap done"
