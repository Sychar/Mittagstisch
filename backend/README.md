# Mittagstisch Backend

Minimales, erweiterbares API-Backend. Standardmaessig In-Memory, optional lokal mit PostgreSQL ueber Prisma.

## Lokal mit PostgreSQL (Docker)

1. DB starten

```
docker compose up -d
```

2. `.env` anlegen (basierend auf `.env.example`)

```
DATA_STORE=prisma
DATABASE_URL=postgresql://mittagstisch_user:mittagstisch_pass@localhost:5433/mittagstisch_dev?sslmode=disable
SEED_DEMO=false
PUBLIC_BASE_URL=http://192.168.0.142:4000
```

3. Migration + Client

```
npm install
npm run prisma:generate
npm run prisma:migrate
```

4. Server starten

```
npm run dev
```

Demo-Daten sind optional (wenn gewuenscht):

```
SEED_DEMO=true
```

Demo Login:
```
demo@mittagstisch.de / mittag123
```

## Start (In-Memory)

1. Abhaengigkeiten installieren

```
npm install
```

2. Server starten (Dev)

```
npm run dev
```

3. Health Check

```
GET http://localhost:4000/health
```

## Beispiel Requests

- Angebote in der Naehe

```
GET http://localhost:4000/api/offers?postalCode=88212&radiusKm=10
```

- Restaurant Registrierung

```
POST http://localhost:4000/api/restaurants/register
{
  "name": "Bistro Marktplatz",
  "email": "demo@mittagstisch.de",
  "password": "mittag123",
  "phone": "+49 751 123456",
  "address": "Marienplatz 1, 88212 Ravensburg",
  "postalCode": "88212"
}
```

- Restaurant Login

```
POST http://localhost:4000/api/auth/login
{
  "email": "demo@mittagstisch.de",
  "password": "mittag123"
}
```

## Struktur

- `src/repositories`: Speicher-Implementierungen (In-Memory / Prisma)
- `src/services`: Business-Logik
- `src/routes`: HTTP-Endpunkte
- `prisma/schema.prisma`: DB-Schema

## Hinweise

- Sessions sind aktuell In-Memory (Token verfallen nach Neustart).
- Postleitzahl-Mapping: `src/services/geoService.ts`.

## Digitales Menü (OpenAI)

Für die automatische Menü-Erkennung aus PDF/Bild:

1. OpenAI Key in `.env` setzen

```
OPENAI_API_KEY=...
```

2. Optional Modell wählen

```
OPENAI_MENU_MODEL=gpt-4.1-mini
```

3. Endpoint (authentifiziert):

```
POST /api/restaurants/menu/digitalize
Content-Type: multipart/form-data
file=<pdf|image>
```
