#!/usr/bin/env bash
# Restore a custom-format dump into RESTORE_URL and prove users can be counted.
# Example: RESTORE_URL=postgresql://catv:change-me@localhost:5432/catv_restore DUMP=backup.dump ./restore-postgres.sh
set -euo pipefail
: "${RESTORE_URL:?RESTORE_URL is required}"
: "${DUMP:?DUMP is required}"
pg_restore --no-owner --clean --if-exists --dbname="${RESTORE_URL}" "${DUMP}"
count="$(psql "${RESTORE_URL}" -tAc 'SELECT count(*) FROM users')"
echo "Restored users=${count}"
