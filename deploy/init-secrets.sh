#!/usr/bin/env bash
set -euo pipefail

# myBeez — Initialize random secrets in .env.production.
# Generates POSTGRES_PASSWORD, SESSION_SECRET, SUPERADMIN_TOKEN and
# rebuilds DATABASE_URL with the new POSTGRES_PASSWORD.
#
# Idempotent: re-running OVERWRITES these four keys (and would invalidate
# every active session). External secrets (RESEND, R2, AI) are NOT touched.
#
# Usage:
#   cd /opt/mybeez && bash deploy/init-secrets.sh

cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production missing. Copy .env.production.example first." >&2
  exit 1
fi

PG_PASS=$(openssl rand -base64 48 | tr -d '/+=' | head -c 32)
SESSION=$(openssl rand -base64 32)
SUPERADMIN=$(openssl rand -base64 32)

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" .env.production
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION}|" .env.production
sed -i "s|^SUPERADMIN_TOKEN=.*|SUPERADMIN_TOKEN=${SUPERADMIN}|" .env.production
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://mybeez:${PG_PASS}@db:5432/mybeez|" .env.production

chmod 600 .env.production

echo "=== Internal secrets written to .env.production ==="
grep -E "^(POSTGRES_PASSWORD|SESSION_SECRET|SUPERADMIN_TOKEN|DATABASE_URL)=" .env.production | sed 's/=.*/=***SET***/'
echo
echo "=== External secrets still to fill manually (nano .env.production) ==="
grep -E "^(RESEND_API_KEY|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|OPENAI_API_KEY|GEMINI_API_KEY|XAI_API_KEY)=" .env.production
