/**
 * Single-use security tokens (email verify, password reset).
 *
 * Design:
 *   - Cleartext token = 32 random bytes, base64url-encoded (~43 chars).
 *     Sent ONCE in the user's email and never persisted server-side.
 *   - Storage = SHA-256 hex of the cleartext. A DB read alone is
 *     insufficient to forge a valid link.
 *   - Comparison = constant-time on the hash bytes (avoid timing
 *     leaks on the hex string).
 *
 * SHA-256 is appropriate here because the token has full 256 bits of
 * entropy (random) — no need for argon2-style stretching (which is for
 * low-entropy human passwords).
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

/**
 * Generates a cleartext token suitable for inclusion in a URL.
 * Returns base64url (no padding, no `+` or `/`).
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * SHA-256 hex of the cleartext token. This is what gets persisted.
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Constant-time comparison of a cleartext token against a stored hash.
 * Returns false on length mismatch / invalid input rather than throwing.
 */
export function verifyToken(plain: string, storedHash: string): boolean {
  if (!plain || !storedHash) return false;
  const candidate = hashToken(plain);
  if (candidate.length !== storedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Default expiration windows (ms). Exported so callers / tests use the
 * same constants and so they're trivially auditable.
 */
export const TOKEN_TTL = {
  emailVerification: 24 * 60 * 60 * 1000, // 24h
  passwordReset: 60 * 60 * 1000, // 1h — short by design (NIST)
} as const;

export function tokenExpiry(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
