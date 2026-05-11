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
import { randomUUID, timingSafeEqual } from "crypto";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import { pool } from "./db";
import { warnIfMailNotConfigured } from "./services/auth/mailService";
import { rootLogger, moduleLogger } from "./lib/logger";
import {
  registry as metricsRegistry,
  httpRequestDuration,
  httpRequestsTotal,
  refreshPointInTimeGauges,
  routeLabel,
  metricsBearerToken,
} from "./services/observability/metrics";

const log = moduleLogger("Bootstrap");

log.info({ pid: process.pid, nodeEnv: process.env.NODE_ENV ?? "development" }, "myBeez starting");

if (!process.env.DATABASE_URL) {
  log.warn("DATABASE_URL is not set");
}

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  log.fatal("SESSION_SECRET must be set in production");
  process.exit(1);
}

// APP_BASE_URL is required in production — it backs auth email links
// (verify, reset). Without it, getAppBaseUrl() falls back to the request's
// Host header, which is attacker-controlled (Host-header injection ⇒
// reset/verify links pointing at a domain owned by the attacker).
if (process.env.NODE_ENV === "production" && !process.env.APP_BASE_URL) {
  log.fatal("APP_BASE_URL must be set in production (e.g. https://app.mybeez-ai.com)");
  process.exit(1);
}

if (!process.env.SUPERADMIN_TOKEN || process.env.SUPERADMIN_TOKEN.length < 16) {
  log.warn(
    "SUPERADMIN_TOKEN is not set (or shorter than 16 chars). Admin routes (/api/tenants) will respond 503 until configured.",
  );
}

// One-shot warning if Resend (auth emails) isn't configured.
warnIfMailNotConfigured();

process.on("uncaughtException", (err) => {
  rootLogger.fatal({ err }, "uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  rootLogger.fatal({ err: reason }, "unhandledRejection");
});

const app = express();
app.set("trust proxy", 1);

/**
 * pino-http : auto-logs every HTTP request with a generated requestId
 * (UUID v4) and attaches `req.log` (a child logger) for handlers that
 * want to add structured context. Mounted FIRST so even errors thrown
 * by helmet/session land in a structured log line.
 *
 * `serializers.req` keeps just method/url/headers (already redacted by
 * the root logger via `req.headers.cookie` and `req.headers.authorization`
 * paths), discarding the noisy connection-level fields. Custom log level
 * downgrades 4xx to warn and 5xx to error so the prod default `info`
 * level still surfaces them but routine 200s stay below the threshold
 * if we later raise it.
 */
app.use(
  pinoHttp({
    logger: rootLogger,
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      if (typeof incoming === "string" && incoming.length > 0 && incoming.length < 200) return incoming;
      return randomUUID();
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} ${res.statusCode} — ${err?.message ?? "error"}`,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/**
 * Prometheus metrics middleware (PR #87) — observes every request's
 * duration + outcome. Mounted after pino-http so a request that throws
 * inside an earlier middleware (helmet, session) still appears in the
 * log, but observe `res.on("finish")` so we capture the final status
 * code even when the response went through error handlers.
 *
 * `routeLabel` reads `req.route?.path` (Express-matched pattern, e.g.
 * `/api/checklist/:slug/items/:id`) so tenant slugs don't explode the
 * metric cardinality with one series per tenant. On 404 / early
 * middleware paths the matcher hasn't run ; we fall back to `unknown`
 * so the label set stays bounded.
 */
app.use((req, res, next) => {
  const endTimer = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    };
    endTimer(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
});

/**
 * GET /metrics — Prometheus scrape endpoint. Bearer-token gated via
 * `METRICS_TOKEN` env (≥16 chars). Without a token, replies 503 so a
 * misconfig is loud rather than silent (same convention as
 * `SUPERADMIN_TOKEN` on `/api/tenants/*`). The compare uses
 * `timingSafeEqual` to avoid leaking the token via response timing.
 *
 * Refresh point-in-time gauges (DB pool, AI providers) right before
 * serialisation so the scrape sees current values rather than stale
 * snapshots from the previous tick.
 */
app.get("/metrics", async (req, res) => {
  const expected = metricsBearerToken();
  if (!expected) {
    return res.status(503).json({ error: "METRICS_TOKEN not configured" });
  }
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(presented);
  if (
    presentedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(presentedBuf, expectedBuf)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    refreshPointInTimeGauges(pool);
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (err) {
    log.error({ err }, "metrics endpoint error");
    res.status(500).json({ error: "Erreur" });
  }
});

/**
 * Helmet — security headers (PR #84 reactivates CSP + HSTS).
 *
 * `contentSecurityPolicy` :
 *   - prod : strict policy. `script-src 'self'` (no inline) — Vite bundles
 *     the front into ./dist/public/assets/*.js so no inline JS at runtime.
 *     `style-src 'self' 'unsafe-inline'` — required by Tailwind/Shadcn
 *     which set styles via the `style` attribute (acceptable trade-off,
 *     CSS injection risks are minimal compared to JS).
 *     `connect-src 'self'` — apps' own API only ; SSE on the same origin
 *     fits.
 *   - dev : disabled. Vite's HMR injects inline scripts and an eval-ish
 *     module loader that no realistic CSP can whitelist without opening
 *     the door wide. We accept this in dev only.
 *
 * `hsts` :
 *   - prod : 1-year max-age, includeSubDomains, preload. Belt-and-braces
 *     with the same header set by nginx — a misconfigured nginx in front
 *     of this app should not silently weaken HSTS.
 *   - dev : helmet's default disables HSTS over HTTP, no override needed.
 *
 * `crossOriginEmbedderPolicy` stays disabled — myBeez has no SharedArray-
 * Buffer dependency, COEP would block third-party assets without benefit.
 */
const isProd = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https:"],
            "font-src": ["'self'", "data:"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
            "object-src": ["'none'"],
            "upgrade-insecure-requests": [],
          },
        }
      : false,
    hsts: isProd
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    crossOriginEmbedderPolicy: false,
  }),
);

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

/**
 * Stricter limiter on pre-auth routes (PR #13c) — defends against
 * password-spraying from a single IP. Account-level lockout (per-userId)
 * lives in services/auth/lockoutService.ts and complements this.
 *
 * Mounted explicitly on the pre-auth surface; routes that legitimate
 * clients poll (e.g. /me, /mfa/status) keep the global apiLimiter only.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes, réessayez plus tard" },
});
const AUTH_RATE_LIMITED_PATHS = [
  "/api/auth/user/login",
  "/api/auth/user/signup",
  "/api/auth/user/forgot-password",
  "/api/auth/user/reset-password",
  "/api/auth/user/verify-email",
  "/api/auth/user/mfa/challenge",
  "/api/auth/user/mfa/recovery",
];
for (const p of AUTH_RATE_LIMITED_PATHS) app.use(p, authLimiter);

async function registerRoutes() {
  const { registerSSERoutes, getSseStats } = await import("./services/realtimeSync");
  registerSSERoutes(app);

  const { registerUserAuthRoutes } = await import("./routes/userAuth");
  registerUserAuthRoutes(app);

  const { registerUserAuthMfaRoutes } = await import("./routes/userAuthMfa");
  registerUserAuthMfaRoutes(app);

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

  const { registerManagementSupplierRoutes } = await import("./routes/management/suppliers");
  registerManagementSupplierRoutes(app);

  const { registerManagementTemplateRoutes } = await import("./routes/management/template");
  registerManagementTemplateRoutes(app);

  const { registerManagementSettingsRoutes } = await import("./routes/management/settings");
  registerManagementSettingsRoutes(app);

  const { registerManagementPurchasesRoutes } = await import("./routes/management/purchases");
  registerManagementPurchasesRoutes(app);

  const { registerManagementExpensesRoutes } = await import("./routes/management/expenses");
  registerManagementExpensesRoutes(app);

  const { registerManagementFilesRoutes } = await import("./routes/management/files");
  registerManagementFilesRoutes(app);

  const { scheduleTrashPurge } = await import("./services/files/trashService");
  scheduleTrashPurge();

  const { registerManagementEmployeesRoutes } = await import("./routes/management/employees");
  registerManagementEmployeesRoutes(app);

  const { registerManagementPayrollRoutes } = await import("./routes/management/payroll");
  registerManagementPayrollRoutes(app);

  const { registerManagementAbsencesRoutes } = await import("./routes/management/absences");
  registerManagementAbsencesRoutes(app);

  const { registerBankAccountsRoutes } = await import("./routes/management/bankAccounts");
  registerBankAccountsRoutes(app);

  const { registerBankEntriesRoutes } = await import("./routes/management/bankEntries");
  registerBankEntriesRoutes(app);

  const { registerCashEntriesRoutes } = await import("./routes/management/cashEntries");
  registerCashEntriesRoutes(app);

  const { registerManagementAnalyticsRoutes } = await import("./routes/management/analytics");
  registerManagementAnalyticsRoutes(app);

  const { registerManagementHistoryRoutes } = await import("./routes/management/history");
  registerManagementHistoryRoutes(app);

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
    log.warn({ distPath }, "Build directory not found");
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
  .then(async () => {
    if (process.env.NODE_ENV === "production") serveStatic();
    const server = createServer(app);
    server.listen(PORT, "0.0.0.0", () => {
      const roots = process.env.ROOT_DOMAINS || "mybeez-ai.com,localhost";
      log.info(
        {
          port: PORT,
          rootDomains: roots,
          ai: {
            openai: !!process.env.OPENAI_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            grok: !!process.env.XAI_API_KEY,
          },
        },
        `Server listening on port ${PORT}`,
      );
    });
  })
  .catch((err) => {
    log.fatal({ err }, "Failed to start");
    process.exit(1);
  });
