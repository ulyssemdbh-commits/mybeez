FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

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
CMD ["node", "dist/index.cjs"]
