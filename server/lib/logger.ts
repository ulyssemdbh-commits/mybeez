/**
 * Structured logger (pino) — Sprint 5 sécu/ops.
 *
 * Replaces ad-hoc `console.log("[Module] …", err)` calls with a
 * structured JSON logger that ships to stdout and is collected by
 * Docker. Two-tier API:
 *
 *   - `rootLogger` : process-wide, used by the bootstrap and the
 *     `uncaughtException` / `unhandledRejection` handlers.
 *   - `moduleLogger(name)` : returns a child logger pre-bound with
 *     `{ name }`, replacing the legacy `[Module]` prefix convention.
 *     A failure on a route or service logs as
 *     `{ "name": "Purchases", "msg": "create failed", "err": {…} }`
 *     instead of an unstructured string.
 *
 * Format
 *   - Production : raw JSON, one log per line. Docker captures stdout
 *     as-is. No file transport, no rotation here — that's an agent
 *     concern (Sprint 7 obs).
 *   - Development : `pino-pretty` colorised output (single line per
 *     entry, level icon, timestamp). Activated via the `transport`
 *     option only when NODE_ENV !== "production".
 *
 * Level
 *   - `LOG_LEVEL` env var, default `info` in prod, `debug` in dev.
 *   - Standard pino levels: trace, debug, info, warn, error, fatal.
 *
 * Redact
 *   - Strings that contain secrets (password, token, secret, apiKey,
 *     authorization, cookie, totpSecret, mfaSecret, recoveryCode,
 *     imageBase64, pdfBase64) are scrubbed with `[REDACTED]`. Same
 *     denylist as `auditService.ts`, kept in sync intentionally — both
 *     surfaces share the goal of "never log a credential".
 *   - Redaction uses pino's path-based redact, so it applies to keys
 *     anywhere in the log object's first level (extend wildcards if
 *     deeper structures need scrubbing — the audit log helper handles
 *     deep recursion separately).
 */

import pino from "pino";
import type { LoggerOptions } from "pino";

const isProd = process.env.NODE_ENV === "production";
const defaultLevel = isProd ? "info" : "debug";
const level = (process.env.LOG_LEVEL ?? defaultLevel).toLowerCase();

const REDACT_PATHS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
  "totpSecret",
  "mfaSecret",
  "recoveryCode",
  "imageBase64",
  "pdfBase64",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.authorization",
  "*.cookie",
  "*.imageBase64",
  "*.pdfBase64",
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers['set-cookie']",
];

const baseOptions: LoggerOptions = {
  level,
  base: { pid: process.pid, hostname: undefined },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

const devTransport = isProd
  ? undefined
  : {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: true,
      },
    };

export const rootLogger = pino({
  ...baseOptions,
  ...(devTransport ? { transport: devTransport } : {}),
});

/**
 * Returns a child logger pre-bound with `{ name }`. Use one per module
 * file (route, service) at top-level :
 *
 *   const log = moduleLogger("Purchases");
 *   …
 *   log.error({ err, purchaseId }, "create failed");
 */
export function moduleLogger(name: string): pino.Logger {
  return rootLogger.child({ name });
}

export type Logger = pino.Logger;
