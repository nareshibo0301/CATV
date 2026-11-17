#!/bin/sh
set -eu
cd /app/apps/api
export PATH="/app/apps/api/node_modules/.bin:/app/node_modules/.bin:${PATH}"
prisma migrate deploy
if [ "${RUN_SEED:-false}" = "true" ]; then
  prisma db seed
fi
exec node dist/main.js
