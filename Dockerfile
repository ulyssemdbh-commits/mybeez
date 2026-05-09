FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# pg_dump / psql for `npm run backup` and `npm run restore`. Major version
# pinned to match the postgres:16 service in docker-compose.yml — pg_dump
# must be >= server major or it refuses to run.
RUN apk add --no-cache postgresql16-client

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# drizzle-kit reads these at runtime when `npm run db:push` runs in the container.
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared

# tsx ops scripts (grant-superadmin, backup, restore, seed:templates) are
# invoked via `docker compose exec app npx tsx scripts/...` — need the source.
COPY --from=builder /app/scripts ./scripts

# scripts/seed-templates.ts imports the catalog from server/seed/templates.ts.
COPY --from=builder /app/server/seed ./server/seed

EXPOSE 3000

# Healthcheck pings /api/health via the embedded Node runtime (no curl/wget
# in the alpine image). 200 = healthy, anything else = unhealthy.
# `start-period` covers cold boot (DB pool warmup, route registration).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.cjs"]
