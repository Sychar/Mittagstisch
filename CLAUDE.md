# CLAUDE.md

Projekt **Nah&Fein** (intern „Mittagstisch“): Plattform für Mittagstisch-Angebote, Events, Speisekarten und Catering von Restaurants. Nutzer finden Angebote per Postleitzahl/Radius; Restaurants pflegen ihre Inhalte selbst; ein Admin moderiert.

## Repo-Aufbau

| Pfad | Inhalt | Deploy-Ziel |
|---|---|---|
| `backend/` | Fastify-API (Node 20, TypeScript, Prisma/PostgreSQL) | `api.nahundfein.com` via PM2 (`mittagstisch-api`, Port 4000) |
| `mobile/` | Expo-App (SDK 54, RN 0.81, React 19), auch als Web exportiert | iOS/Android via EAS, Web-Build → `app.nahundfein.com` |
| `admin.html` + `assets/admin.js` | Statisches Admin-Frontend (Freigaben, Review-Meldungen, Highlights) | `admin.` Subdomain |
| `index.html` + `assets/app.css`, `app.js`, `agb/`, `datenschutz/`, `copyright/` | Marketing-Landingpage | `home.nahundfein.com` |
| `user.html`, `restaurant.html`, `assets/user.js`, `assets/restaurant.js` | **Legacy**-PWA-Prototypen (nur localStorage, kein Backend) | nicht mehr relevant |
| `deploy/` | nginx-Vorlagen und Deploy-Skripte | – |

Domains: aktuell `nahundfein.com`; ältere Reste nutzen `mymittagstisch.jetzt` (u. a. Bundle-ID `jetzt.mymittagstisch.app`, Admin-API-Fallback).

## Backend (`backend/`)

Befehle (im Ordner `backend/`):
- `npm run dev` – tsx watch auf `src/server.ts`
- `npm run build` – `tsc` nach `dist/`; `npm start` startet `dist/server.js`
- `npm run prisma:generate`, `npm run prisma:migrate:deploy`, `npm run prisma:migrate` (dev)
- Tests: kein npm-Script; `node:test` + `assert`, z. B. `npx tsx --test src/services/*.test.ts`
- Lokale DB: `docker compose up -d` (Postgres 16 auf Port 5433)

Architektur:
- `server.ts` → `app.ts` (Fastify, CORS, Multipart 10 MB, statisch `/uploads/`, zentraler Error-Handler) → `context.ts` (`buildContext`, manuelle DI) → `routes/index.ts`.
- Schichten: `routes/` → `services/` → `repositories/`. Jedes Repo hat ein Interface + `InMemory*`-Implementierung und eine `Prisma*`-Implementierung. Auswahl über `DATA_STORE` (`prisma` | `memory`, Default: `prisma`, wenn `DATABASE_URL` gesetzt ist).
- Nicht alle Daten laufen über Repos: Events, Highlights, Reviews, Catering, Support-Chat greifen in Routes/Services direkt auf `ctx.prisma` zu.
- Fehler: `throw new HttpError(status, CODE, message, details)`; Validierung mit zod über `parseOrThrow` (`utils/http.ts`) → 400 `INVALID_INPUT`.
- Auth Restaurant: Bearer-Token, `requireAuth(request, ctx.sessionRepo)` gibt `restaurantId` zurück. Sessions liegen in `uploads/auth-sessions.json` (dateibasiert, nicht in der DB).
- Auth Admin: separat über `requireAdminAuth` in `routes/admin.ts`; Admin-Account wird beim Start aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` gebootstrapped.
- `routes/restaurants.ts` ist sehr groß (~6000 Zeilen) – gezielt per grep suchen statt ganz lesen. Weitere große Dateien: `services/digitalMenuService.ts`, `services/websiteSyncService.ts`, `routes/events.ts`.

Wichtige Services:
- `digitalMenuService` – Speisekarte aus PDF/Bild per OpenAI extrahieren (`OPENAI_MENU_MODEL`, Fallback-Modell)
- `menuUploadService` – Dateityp-Erkennung über Signatur, HEIC-Konvertierung, Batch-Limits
- `websiteSyncService` – Restaurant-Website mit Playwright/Chromium crawlen und Inhalte übernehmen; `previewSyncServer.ts` ist ein separater Preview-Server (Port 4001), der gegen die Produktions-API arbeitet
- `supportChatService` – KI-Support-Chat für Restaurants (OpenAI)
- `pushService` – Expo Push; `emailService` – SMTP/nodemailer; `geoService` – PLZ → Koordinaten (Nominatim)
- `orderSpamGuard` – Rate-Limits für Bestellungen/Reservierungen (`ORDER_*`-Env-Variablen)

Prisma:
- Schema: `prisma/schema.prisma` (Restaurant, Offer, Order, Event + Recurrence/Occurrences/Cancellations/Follows, Reviews + Reports/Images, Menu-/Content-Views, SupportConversation/Messages, FeaturedHighlight, CateringOffer, AdminAccount).
- Migrationen in `prisma/migrations/YYYYMMDDHHMMSS_beschreibung/` – werden beim Deploy mit `migrate deploy` angewendet.

Env: siehe `backend/.env.example`. Wichtig: `DATABASE_URL`, `OPENAI_API_KEY`, `PUBLIC_BASE_URL`, `APP_PUBLIC_URL`, `ADMIN_PUBLIC_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `SMTP_*`, `EXPO_ACCESS_TOKEN`. Echte `.env`-Dateien niemals ausgeben oder committen.

## Mobile-App (`mobile/`)

- Befehle: `npm start` / `npm run web` / `npm run build:web` (→ `dist-web/`). `postinstall` führt `patch-package` aus (`patches/expo-image-picker+…patch` für iCloud-Fotos auf iOS).
- Einstieg: `index.js` → `App.js`. Kein echtes Navigation-Routing: `App.js` schaltet per State zwischen `UserScreen` (Nutzer) und `RestaurantScreen` (Restaurant-Backend); auf Web werden `/events/:id` und `/offers/:id` per URL auf Landing-Screens geroutet.
- `src/screens/UserScreen.js` (~8k Zeilen) und `RestaurantScreen.js` (~19k Zeilen) sind monolithisch – gezielt greppen.
- State: `src/store/OffersContext.js` (`OffersProvider`, `useOffers`). Session-Token in SecureStore (native) bzw. localStorage (web).
- API: `src/services/api.js`; Basis-URL aus `EXPO_PUBLIC_API_URL`, sonst Dev `localhost:4000`/`10.0.2.2:4000`, Prod `https://api.nahundfein.com`. Sendet `X-Device-Id`, `X-Client-Platform`, `X-Client-Version`.
- Feature-Flags: `src/config/features.js` (`events`, `websiteSync`, `catering`, `reviewReporting`, `discoveryHome`) aus `EXPO_PUBLIC_*_ENABLED=1` bzw. `expoConfig.extra`. **In `__DEV__` sind die meisten Flags an** – Produktion verhält sich anders. Produktionswerte setzen `deploy/server/deploy-web.sh` und `eas.json`.
- Plattformdateien: `RestaurantMap.native.js` (react-native-maps) / `RestaurantMap.web.js` (Leaflet).
- `app.json` = statische Basis (Version, Build-Nummern); `app.config.js` ergänzt Flags und Google-Maps-Key (Android-EAS-Build bricht ohne `GOOGLE_MAPS_ANDROID_API_KEY` ab).
- EAS-Profile: `development`, `preview`, `testflight-preview`, `production`. Build-/Submit-Befehle stehen in `DEPLOYMENT.md` Abschnitt 9.

## Statische Seiten

- `admin.js` leitet die API-URL aus dem Hostnamen ab (`admin.X` → `api.X`); überschreibbar im UI (localStorage). Cache-Busting über `?v=`-Query-Strings in `admin.html`.
- `service-worker.js`: bei Änderungen an gecachten Assets `CACHE_NAME` hochzählen, sonst sehen Nutzer alte Versionen.

## Deployment

Details in `DEPLOYMENT.md`. Skripte in `deploy/server/`:
- `deploy-api.sh` – `npm ci`, Playwright-Chromium, Prisma generate + migrate deploy, build, PM2-Restart
- `deploy-web.sh` – benötigt `EXPO_PUBLIC_API_URL`, setzt Produktions-Flags, Expo-Web-Export → `/var/www/mittagstisch/app/current`
- `deploy-admin.sh`, `deploy-home.sh` – kopieren statische Dateien in Release-Ordner unter `/var/www/mittagstisch/*` und setzen den `current`-Symlink

## Konventionen

- UI-Texte und Fehlermeldungen für Nutzer auf **Deutsch** (Du-Form); Code-Bezeichner auf Englisch.
- Storage-Keys mit Präfix `mittagstisch.*` bzw. `nahundfein.*`.
- Build-Output (`dist/`, `dist-web/`, `dist-ios-preview*`), `uploads/`, `backups/`, `logs/` nicht bearbeiten.
