/**
 * Prometheus metrics — Sprint 7 sécu/ops (PR #87).
 *
 * Single in-process registry. The default Node.js collectors are
 * enabled (process_cpu_seconds_total, nodejs_heap_size_total,
 * process_resident_memory_bytes, event loop lag, …) so the operator
 * has the standard Node.js fleet view without us re-instrumenting it.
 *
 * Custom collectors :
 *   - `http_request_duration_seconds` : histogram of request latency,
 *     labelled `{method, route, status_code}`. Route uses Express'
 *     matched path pattern (`req.route?.path`) so a tenant /admin/...
 *     burst doesn't pollute the cardinality with 1 series per slug.
 *   - `http_requests_total` : counter, same labels. Redundant with the
 *     histogram's `_count` but lets ops do per-status rate alerts
 *     without unpacking histogram buckets.
 *   - `db_pool_total / idle / waiting` : gauges scraped at collect-time
 *     via the `pg` Pool's getters.
 *   - `ai_provider_configured{provider}` : 0/1 gauge mirroring the
 *     /health response. Drift between expected providers and the live
 *     env shows up in dashboards.
 *
 * Auth model :
 *   - Endpoint `GET /metrics` gated by Bearer `METRICS_TOKEN` env.
 *     Choice of token (not session) so Prometheus' scrape config can
 *     authenticate without a cookie jar.
 *   - If `METRICS_TOKEN` is missing OR shorter than 16 chars, the
 *     endpoint replies `503` (same pattern as `/api/tenants/*` legacy
 *     Bearer in `tenants.ts`). No security through obscurity.
 *
 * Cluster note :
 *   - prom-client is process-local. When we scale to multi-noeud, each
 *     node exposes its own /metrics and Prometheus aggregates. The
 *     existing process-local caches (`tenantService`, `alfredService`,
 *     …) have the same per-process model, so we keep alignment.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";
import type { Pool } from "pg";

/** Buckets in seconds — covers single-digit ms up to slow OCR calls (10s). */
const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds, by method/route/status.",
  labelNames: ["method", "route", "status_code"],
  buckets: HTTP_DURATION_BUCKETS_SECONDS,
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests, by method/route/status.",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const dbPoolTotal = new Gauge({
  name: "db_pool_total",
  help: "Current size of the Postgres connection pool (acquired + idle).",
  registers: [registry],
});

export const dbPoolIdle = new Gauge({
  name: "db_pool_idle",
  help: "Number of idle Postgres connections in the pool.",
  registers: [registry],
});

export const dbPoolWaiting = new Gauge({
  name: "db_pool_waiting",
  help: "Number of clients waiting for an available Postgres connection.",
  registers: [registry],
});

export const aiProviderConfigured = new Gauge({
  name: "ai_provider_configured",
  help: "Whether an AI provider is configured (1) or not (0).",
  labelNames: ["provider"],
  registers: [registry],
});

/**
 * Refresh the gauges that are read on-demand from in-process state
 * (DB pool stats, AI provider config). Call this right before scrape
 * serialisation. Cheap (no IO) — pool getters read counters, env reads
 * are constant-time.
 */
export function refreshPointInTimeGauges(pool: Pool): void {
  dbPoolTotal.set(pool.totalCount);
  dbPoolIdle.set(pool.idleCount);
  dbPoolWaiting.set(pool.waitingCount);
  aiProviderConfigured.labels("openai").set(process.env.OPENAI_API_KEY ? 1 : 0);
  aiProviderConfigured.labels("gemini").set(process.env.GEMINI_API_KEY ? 1 : 0);
  aiProviderConfigured.labels("grok").set(process.env.XAI_API_KEY ? 1 : 0);
}

/**
 * Resolve the route label for an Express request. Prefers the matched
 * route pattern (`/api/checklist/:slug/items/:id`) over `req.path` so
 * a `:slug` burst doesn't generate one time series per tenant. Falls
 * back to `req.path` if the matcher didn't run (404, early middleware).
 */
export function routeLabel(req: { route?: { path?: string }; path: string }): string {
  return req.route?.path ?? req.path ?? "unknown";
}

/**
 * Drop all collectors from the registry — used by tests to reset state
 * between assertions (`registry.clear()` wipes both the registry and
 * the metric objects above, so re-instantiating after a test is the
 * caller's responsibility).
 */
export function _resetRegistryForTests(): void {
  registry.resetMetrics();
}

/**
 * Bearer token gate for `GET /metrics`. Returns the configured token
 * iff present and >= 16 chars. Otherwise `null` and the endpoint
 * responds 503 (same convention as `SUPERADMIN_TOKEN`).
 */
export function metricsBearerToken(): string | null {
  const raw = process.env.METRICS_TOKEN;
  if (!raw || raw.length < 16) return null;
  return raw;
}
