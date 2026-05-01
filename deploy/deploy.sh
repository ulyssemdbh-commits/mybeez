#!/usr/bin/env bash
set -euo pipefail

# myBeez deploy script — run on the Hetzner host.
#
# Usage:
#   cd /opt/mybeez && bash deploy/deploy.sh [--no-pull]
#
# Steps:
#   1. Pull latest main (skip with --no-pull)
#   2. Build & start containers (docker compose)
#   3. Apply DB schema with drizzle-kit
#   4. Reload nginx
#
# Prerequisites on the host (one-time setup):
#   - /opt/mybeez/.env.production filled with real secrets
#     (template: .env.production.example)
#   - /etc/ssl/cloudflare/mybeez-ai.com.{pem,key} present (CF Origin Cert)
#   - /etc/nginx/sites-enabled/mybeez-ai.com.conf symlinked from
#     /opt/mybeez/deploy/nginx/mybeez-ai.com.conf

NO_PULL=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) NO_PULL=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

if [[ "$NO_PULL" -eq 0 ]]; then
  echo "==> Pulling latest main"
  git fetch --quiet origin main
  git reset --hard origin/main
fi

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production missing. Copy .env.production.example and fill it in." >&2
  exit 1
fi

echo "==> Building & starting containers"
docker compose up -d --build

echo "==> Waiting for app container to come up"
for _ in $(seq 1 30); do
  if [[ "$(docker compose ps -q app | xargs -r docker inspect -f '{{.State.Running}}' 2>/dev/null)" == "true" ]]; then
    break
  fi
  sleep 1
done

echo "==> Applying DB schema (drizzle-kit push)"
docker compose exec -T app npm run db:push

echo "==> Reloading nginx"
nginx -t && systemctl reload nginx

echo "==> Done. Tail logs with: docker compose logs -f app"
