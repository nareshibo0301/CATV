# Deployment and backups

## Private server

1. Install Docker and Compose on Ubuntu.
2. Copy `deploy/.env.example` to `deploy/.env` and replace every secret. Set `COOKIE_SECURE=true` only behind HTTPS.
3. `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build`
4. Point DNS at the server. For TLS, place `fullchain.pem` and `privkey.pem` in `/etc/catv/certs` and use the Nginx SSL notes in `deploy/nginx/nginx.conf` as the header baseline (`X-Content-Type-Options`, gzip, 10 MB body limit). Certbot or your own certificates both work; the app does not call a cloud CA itself.
5. Open 80 and 443 in ufw. Do not publish Postgres or Redis on the public interface in production (`deploy/docker-compose.prod.yml` already keeps those off the host).

Containers run as the image user where the image allows it. Nginx binds port 80 as root inside its container, which is the image default.

## Updates

`deploy/scripts/update.sh` rebuilds, migrates on API start, and checks `/health`. If the new API does not become healthy, it prints the previous image id so you can `docker tag` it back and `docker compose up -d`.

## Backups

`deploy/scripts/backup-postgres.sh` writes a custom-format dump and deletes dumps older than `RETENTION_DAYS` (14). Redis uses AOF (`appendonly yes`).

Restore onto a clean database:

```bash
createdb catv_restore
pg_restore --no-owner --dbname catv_restore /var/backups/catv/catv-YYYYMMDD.dump
```

`deploy/scripts/restore-postgres.sh` does that against `RESTORE_URL` and checks that `users` is readable. Run it against a scratch database, not the live one.

Log in as admin and open `/api/v1/admin/queues` for the BullMQ board. `/metrics` returns plain counters. Logs are JSON with `requestId`.
