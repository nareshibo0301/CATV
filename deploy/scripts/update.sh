#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
previous="$(docker inspect --format '{{.Image}}' catv-api-1 2>/dev/null || true)"
docker compose up -d --build
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:8080/health >/dev/null; then
    echo "Update healthy."
    exit 0
  fi
  sleep 3
done
echo "API did not become healthy. Previous image: ${previous:-unknown}"
echo "Rollback: docker tag ${previous:-<image>} catv-api:latest && docker compose up -d"
exit 1
