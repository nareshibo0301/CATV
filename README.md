# CATV

Cable network management platform. Phase 1 is the foundation: monorepo, Compose, auth, RBAC, data scope, and the golden app shell.

## Admin types

Every admin account has one tier: **Developer**, **Super Admin**, or **Admin**. All three have full admin access. The seed account is a Super Admin.

## Run with Docker

Docker Compose v2 is required. From the repo root, copy the env file and start the dev stack:

```bash
cp deploy/.env.example deploy/.env
docker compose up --build
```

Open `http://localhost:8080`. Sign in with `admin@catv.local` / `ChangeMeNow!123`, then change that password outside this phase by replacing the seed user.

Production (HTTP on port 80, seed skipped, database ports unpublished):

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

Set `COOKIE_SECURE=true` only when the site is served over HTTPS.

## Local apps

```bash
pnpm install
pnpm db:generate
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app is on port 3000 and proxies `/api` to the API on port 3001.

## Backup

On the Ubuntu server:

```bash
DATABASE_URL=postgresql://catv:change-me@127.0.0.1:5432/catv \
  BACKUP_DIR=/var/backups/catv \
  RETENTION_DAYS=14 \
  bash deploy/scripts/backup-postgres.sh
```

## Checks

- `GET /health` is liveness. `GET /ready` checks Postgres and Redis.
- Swagger is at `/api/docs`.
- `GET /api/v1/admin/ping` is admin-only. Distributor, Operator, and Customer receive 403.
