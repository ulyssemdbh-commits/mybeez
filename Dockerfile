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

EXPOSE 3000
CMD ["node", "dist/index.cjs"]
