# Store Ratings

Express + PostgreSQL API with a React (Vite) frontend. One login for three roles: System Administrator, Normal User and Store Owner.

## Setup
1. Create a database: `createdb store_ratings`
2. Backend:
   ```bash
   cd backend
   cp .env.example .env     # set DATABASE_URL and JWT_SECRET
   npm install
   npm run db:init          # creates tables + first admin from ADMIN_EMAIL / ADMIN_PASSWORD
   npm run dev              # http://localhost:4000
   ```
3. Frontend (second terminal):
   ```bash
   cd frontend
   npm install
   npm run dev              # http://localhost:5173 (proxies /api to :4000)
   ```
4. Tests: `cd backend && npm test`

## Notes
- Name 20-60 chars, address max 400, password 8-16 chars with one uppercase and one special character, standard email check. Enforced in the browser and again on the API.
- Admin creates stores and users (any role). Link a store to a Store Owner when adding the store.
- All lists sort by clicking a column header; filters and search run on the server.
- Store names are limited to 60 characters; the 20-character minimum applies to user names only, as the brief lists it under user fields.

## Docker
```bash
cp .env.example .env                              # fill in DB_PASSWORD, JWT_SECRET (32+ chars), ADMIN_PASSWORD
docker compose up --build -d
docker compose run --rm backend npm run db:init   # once: tables + first admin
```
Open http://localhost:8080. Only the frontend port is published; Postgres and the API stay on internal networks. Put HTTPS (Caddy, Cloudflare or a load balancer) in front before exposing it publicly.

**Backup / restore**
```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" store_ratings' | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" store_ratings'
```

## Security notes
Helmet headers, rate limits (nginx on login, Express globally and on auth routes), 10 KB body cap, same-origin CORS by default (`CORS_ORIGIN` to allow others), JWT secret must be 32+ characters, constant-time login responses, non-root read-only containers.
