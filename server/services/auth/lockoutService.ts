/**
 * Account-level lockout — derived from `audit_log` failure events.
 *
 * Capitalises on PR #13b (audit log writes): we count
 * `auth.login.failure`, `mfa.challenge.failure`, `mfa.recovery.failure`
 * for a given userId in a sliding window, and lock the account if the
 * failure count crosses the threshold.
 *
 * No new table, no new in-memory state — survives restarts and works
 * across cluster nodes once we scale-out (audit_log is the source of
 * truth).
 *
 * Fail-soft: any DB error returns "not locked" so a Postgres incident
 * cannot turn into a global denial-of-service for legitimate users.
 *
 * Pairs with the IP-level rate-limit on /api/auth/user/* (server/index.ts):
 * - rate-limit blocks password spraying (1 password × 1000 emails from 1 IP)
 * - account lockout blocks brute-force on a single account from many IPs
 */

import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../../db";
import { auditLog } from "../../../shared/schema/users";

export const LOCKOUT_CONSTANTS = {
  /** Failures within the window required to lock the account. */
  threshold: 5,
  /** Sliding window length in milliseconds (15 minutes). */
  windowMs: 15 * 60 * 1000,
  /** Audit events that count toward lockout. */
  failureEvents: [
    "auth.login.failure",
    "mfa.challenge.failure",
    "mfa.recovery.failure",
  ] as const,
} as const;

export interface LockoutCheck {
  locked: boolean;
  failureCount: number;
  /** Seconds until at least one slot frees under the threshold. 0 if not locked. */
  retryAfterSeconds: number;
}

/**
 * Pure helper: given a list of failure timestamps and a "now", decide
 * whether the account is currently locked and for how long.
 *
 * Exported so unit tests don't need a DB.
 */
export function computeLockout(
  failures: ReadonlyArray<Date>,
  now: Date = new Date(),
  threshold: number = LOCKOUT_CONSTANTS.threshold,
  windowMs: number = LOCKOUT_CONSTANTS.windowMs,
): LockoutCheck {
  const cutoff = now.getTime() - windowMs;
  const inWindow = failures
    .map((d) => d.getTime())
    .filter((t) => t >= cutoff)
    .sort((a, b) => a - b);

  const failureCount = inWindow.length;
  if (failureCount < threshold) {
    return { locked: false, failureCount, retryAfterSeconds: 0 };
  }

  const oldest = inWindow[0]!;
  const unlockAt = oldest + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((unlockAt - now.getTime()) / 1000));
  return { locked: true, failureCount, retryAfterSeconds };
}

/**
 * Looks up failure events for `userId` in the recent window and returns
 * the lockout decision. Fail-soft on DB error.
 */
export async function checkLockout(
  userId: number,
  now: Date = new Date(),
): Promise<LockoutCheck> {
  try {
    const since = new Date(now.getTime() - LOCKOUT_CONSTANTS.windowMs);
    const rows = await db
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, userId),
          inArray(auditLog.event, [...LOCKOUT_CONSTANTS.failureEvents]),
          gte(auditLog.createdAt, since),
        ),
      );
    return computeLockout(
      rows.map((r) => r.createdAt),
      now,
    );
  } catch (err) {
    console.error("[lockout] check failed (fail-soft, treating as unlocked):", err);
    return { locked: false, failureCount: 0, retryAfterSeconds: 0 };
  }
}
