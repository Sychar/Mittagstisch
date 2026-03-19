# Web Deployment (app + api)

Dieses Projekt kann als Web-App und API unter zwei Subdomains laufen:

- `https://app.deinedomain.de` -> Expo Web Build (statisch)
- `https://api.deinedomain.de` -> Fastify Backend (Node + PM2)

## 1) Voraussetzungen (Ubuntu VPS)

- DNS zeigt `app` und `api` auf deinen Server.
- Ubuntu 22.04/24.04
- `git`, `nginx`, `certbot`, `python3-certbot-nginx`, Node.js 20 LTS, `npm`, `pm2`, PostgreSQL erreichbar

Beispiel:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx rsync
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2) Repo auf Server

```bash
sudo mkdir -p /srv/mittagstisch
sudo chown -R $USER:$USER /srv/mittagstisch
cd /srv/mittagstisch
git clone https://github.com/Sychar/Mittagstisch.git .
```

## 3) Backend konfigurieren

```bash
cd /srv/mittagstisch/backend
cp .env.example .env
```

Pflichtwerte in `backend/.env`:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `PUBLIC_BASE_URL=https://api.deinedomain.de`
- `HOST=127.0.0.1`
- `PORT=4000`

Dann deployen:

```bash
cd /srv/mittagstisch
bash deploy/server/deploy-api.sh
```

Health Check:

```bash
curl http://127.0.0.1:4000/health
```

## 4) Web-App bauen und ausrollen

```bash
cd /srv/mittagstisch
EXPO_PUBLIC_API_URL=https://api.deinedomain.de bash deploy/server/deploy-web.sh
```

Standard-Webroot:

- `/var/www/mittagstisch/app/current`

## 5) Nginx aktivieren

Vorlagen:

- `deploy/nginx/app.conf`
- `deploy/nginx/api.conf`

Empfohlen:

```bash
sudo cp deploy/nginx/app.conf /etc/nginx/sites-available/app.deinedomain.de
sudo cp deploy/nginx/api.conf /etc/nginx/sites-available/api.deinedomain.de
sudo ln -s /etc/nginx/sites-available/app.deinedomain.de /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.deinedomain.de /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Dann TLS:

```bash
sudo certbot --nginx -d app.deinedomain.de -d api.deinedomain.de
```

## 6) PM2 Autostart

```bash
pm2 startup
pm2 save
```

## 7) Update-Workflow

```bash
cd /srv/mittagstisch
git pull
bash deploy/server/deploy-api.sh
EXPO_PUBLIC_API_URL=https://api.deinedomain.de bash deploy/server/deploy-web.sh
sudo systemctl reload nginx
```

## 8) Abnahme

- `https://app.deinedomain.de` lädt auf Desktop + Mobile.
- Login, Angebote, Reservierung funktionieren.
- Digitales Menü (OpenAI) funktioniert.
- `https://api.deinedomain.de/health` antwortet mit `ok`.
- Keine Mixed-Content/CORS-Fehler.
- Nach Server-Neustart bleibt API über PM2 online.
