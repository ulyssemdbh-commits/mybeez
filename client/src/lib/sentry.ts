/**
 * Sentry — frontend error tracking (Sprint 7 sécu/ops, PR #87).
 *
 * No-op when `VITE_SENTRY_DSN` is unset. That covers local dev (no
 * paid Sentry seat needed) and the smoke testing flow without
 * polluting the org's issues dashboard with synthetic errors.
 *
 * Lightweight init :
 *   - `environment` and `release` derived from Vite env so a prod
 *     release and a dev session don't get conflated.
 *   - `tracesSampleRate: 0.1` so we get a slice of performance data
 *     without paying for 100% of page loads. Adjustable via
 *     `VITE_SENTRY_TRACES_SAMPLE_RATE`.
 *   - `beforeSend` strips obvious credential-shaped fields from
 *     extra context — defense in depth on top of Sentry's own data
 *     scrubbers.
 *
 * `captureError(error, info)` is the helper called by `ErrorBoundary`
 * when a React tree throws. Falls through silently when Sentry is
 * not initialised, so the boundary works the same with or without
 * the DSN configured.
 */

import * as Sentry from "@sentry/react";

const REDACT_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "apikey",
  "secret",
  "authorization",
  "cookie",
  "totpcode",
  "totpsecret",
  "recoverycode",
]);

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (REDACT_KEYS.has(key.toLowerCase())) {
        event.extra[key] = "[REDACTED]";
      }
    }
  }
  // Drop request cookies / authorization headers if Sentry attached
  // a `request` shape (server-side scenarios). On the browser SDK
  // these fields are rarely populated but cheap to defend.
  const req = event.request;
  if (req?.headers && typeof req.headers === "object") {
    const headers = req.headers as Record<string, string>;
    if (headers.cookie) headers.cookie = "[REDACTED]";
    if (headers.authorization) headers.authorization = "[REDACTED]";
  }
  return event;
}

/**
 * Initialise Sentry iff `VITE_SENTRY_DSN` is set. Idempotent : calling
 * twice does not double-initialise (Sentry's own client guards that).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (typeof dsn !== "string" || dsn.length === 0) {
    return;
  }
  const tracesRaw = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE;
  const tracesSampleRate =
    typeof tracesRaw === "string" && tracesRaw.length > 0 ? Number.parseFloat(tracesRaw) : 0.1;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE ?? undefined,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    // Browser tracing for page loads + navigation. Cheap on a SPA.
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend: scrubEvent,
  });
}

/**
 * Manually report an error caught by an `ErrorBoundary`. Includes the
 * React component stack as extra context. No-op if Sentry isn't
 * initialised (DSN unset).
 */
export function captureBoundaryError(error: Error, componentStack: string | null | undefined): void {
  Sentry.captureException(error, {
    contexts: {
      react: { componentStack: componentStack ?? "" },
    },
  });
}
