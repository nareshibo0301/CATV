#!/usr/bin/env bash
# Postgres backup for the private Ubuntu server.
# Uses DATABASE_URL, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
# BACKUP_DIR defaults to /var/backups/catv. RETENTION_DAYS defaults to 14.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/catv}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/catv-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner --file="${FILE}" "${DATABASE_URL}"
else
  pg_dump --format=custom --no-owner --file="${FILE}"
fi

find "${BACKUP_DIR}" -name 'catv-*.dump' -type f -mtime +"${RETENTION_DAYS}" -delete
echo "Wrote ${FILE}"
