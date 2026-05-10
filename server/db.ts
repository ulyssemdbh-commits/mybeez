import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { moduleLogger } from "./lib/logger";

const { Pool } = pg;
const log = moduleLogger("DB");

if (!process.env.DATABASE_URL) {
  log.warn("DATABASE_URL not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: process.env.NODE_ENV === "production" ? 20 : 10,
  min: 2,
  allowExitOnIdle: false,
  statement_timeout: 30000,
});

pool.on("error", (err: Error) => {
  log.error({ err }, "Pool error");
});

export const db = drizzle(pool, { schema });
