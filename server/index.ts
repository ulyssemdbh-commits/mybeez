/**
 * myBeez Standalone — Server Entry Point
 *
 * Multi-tenant SaaS platform.
 * Tenant resolution: by request hostname.
 *   - Subdomain: `<slug>.<root>` (root configured via ROOT_DOMAINS env)
 *   - Custom domain: verified entry in `tenant_domains`
 *   - Path-based `/:slug` is still accepted as legacy fallback (PR #7)
 */
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { pool } from "./db";
import { warnIfMailNotConfigured } from "./services/auth/mailService";

console.log(`[myBeez] Starting — PID=${process.pid}, NODE_ENV=${process.env.NODE_ENV || "development"}`);

if (!process.env.DATABASE_URL) {
  console.error("[myBeez] WARNING: DATABASE_URL is not set");
}

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("[myBeez] FATAL: SESSION_SECRET must be set in production");
  process.exit(1);
}

// APP_BASE_URL is required in production — it backs auth email links
// (verify, reset). Without it, getAppBaseUrl() falls back to the request's
// Host header, which is attacker-controlled (Host-header injection ⇒
// reset/verify links pointing at a domain owned by the attacker).
if (process.env.NODE_ENV === "production" && !process.env.APP_BASE_URL) {
  console.error("[myBeez] FATAL: APP_BASE_URL must be set in production (e.g. https://app.mybeez-ai.com)");
  process.exit(1);
}

if (!process.env.SUPERADMIN_TOKEN || process.env.SUPERADMIN_TOKEN.length < 16) {
  const msg =
    "[myBeez] WARNING: SUPERADMIN_TOKEN is not set (or shorter than 16 chars). " +
    "Admin routes (/api/tenants) will respond 503 until configured.";
  console.warn(msg);
}

// One-shot warning if Resend (auth emails) isn't configured.
warnIfMailNotConfigured();

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message, err.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression({ level: 6, threshold: 1024 }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/**
 * Session store: Postgres-backed via connect-pg-simple (PR #11).
 * Replaces the default in-memory store, which loses sessions on every
 * restart and leaks memory in production.
 *
 * `createTableIfMissing: true` provisions the `user_sessions` table at
 * boot if absent — safe with concurrent boots (CREATE TABLE IF NOT
 * EXISTS). Schema kept stable across deploys; no manual migration.
 */
const PgSessionStore = connectPgSimple(session);
const sessionStore = new PgSessionStore({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 15,
});

/**
 * Cookie scope: in production we need the session cookie to flow across
 * subdomains so a user logged in on `mybeez-ai.com` (signup, /123admin)
 * stays logged in when redirected to `<slug>.mybeez-ai.com`. Setting
 * `domain` to `.<primary-root-domain>` does that. In dev we leave it
 * unset (browsers reject `.localhost` for security).
 */
function sessionCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== "production") return undefined;
  const raw = process.env.ROOT_DOMAINS || "mybeez-ai.com,localhost";
  const root = raw.split(",")[0]!.trim().toLowerCase();
  if (!root || root === "localhost") return undefined;
  return `.${root}`;
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "mybeez-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    domain: sessionCookieDomain(),
  },
}));

const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, message: { error: "Trop de requêtes" } });
app.use("/api/", apiLimiter);

const alfredLimiter = rateLimit({ windowMs: 60_000, max: 20, message: { error: "Alfred a besoin d'un moment" } });
app.use("/api/alfred/", alfredLimiter);

async function registerRoutes() {
  const { registerSSERoutes, getSseStats } = await import("./services/realtimeSync");
  registerSSERoutes(app);

  const { registerAuthRoutes } = await import("./routes/auth");
  registerAuthRoutes(app);

  const { registerUserAuthRoutes } = await import("./routes/userAuth");
  registerUserAuthRoutes(app);

  const { registerTenantRoutes } = await import("./routes/tenants");
  registerTenantRoutes(app);

  const { registerAdminRoutes } = await import("./routes/admin");
  registerAdminRoutes(app);

  const { registerOnboardingRoutes } = await import("./routes/onboarding");
  registerOnboardingRoutes(app);

  const { registerTemplateRoutes } = await import("./routes/templates");
  registerTemplateRoutes(app);

  const { registerAlfredRoutes } = await import("./routes/alfred");
  registerAlfredRoutes(app);

  const { registerChecklistRoutes } = await import("./routes/checklist");
  registerChecklistRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "mybeez",
      version: "2.0.0",
      uptime: Math.round(process.uptime()),
      sse: getSseStats(),
      ai: {
        openai: !!process.env.OPENAI_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        grok: !!process.env.XAI_API_KEY,
      },
    });
  });
}

function serveStatic() {
  // process.cwd() instead of import.meta.dirname: esbuild bundles this file
  // as CJS (`--format=cjs`) and does NOT polyfill `import.meta.dirname`,
  // so it resolves to undefined at runtime → path.resolve crashes. cwd is
  // /app in the Docker container (WORKDIR) and the repo root in dev.
  const distPath = path.resolve(process.cwd(), "dist", "public");
  const indexHtml = path.resolve(distPath, "index.html");

  if (!fs.existsSync(distPath)) {
    console.warn(`[myBeez] Build directory not found: ${distPath}`);
    return;
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), { maxAge: "1y", immutable: true }));
  app.use(express.static(distPath, { maxAge: "1h", index: false }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(indexHtml);
  });
}

const PORT = parseInt(process.env.PORT || "3000", 10);

registerRoutes()
  .then(() => {
    if (process.env.NODE_ENV === "production") serveStatic();
    const server = createServer(app);
    server.listen(PORT, "0.0.0.0", () => {
      const roots = process.env.ROOT_DOMAINS || "mybeez-ai.com,localhost";
      console.log(`[myBeez] Server running on port ${PORT}`);
      console.log(`[myBeez] Tenant root domains: ${roots}`);
      console.log(`[myBeez] AI: OpenAI=${!!process.env.OPENAI_API_KEY} Gemini=${!!process.env.GEMINI_API_KEY} Grok=${!!process.env.XAI_API_KEY}`);
    });
  })
  .catch((err) => {
    console.error("[myBeez] Failed to start:", err);
    process.exit(1);
  });
