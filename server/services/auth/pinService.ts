/**
 * PIN hashing — argon2id used to protect 4-8 digit tenant PIN/admin codes.
 *
 * Same algorithm as passwordService but exposed under a dedicated module
 * so the call sites (tenantService.create / update / loginWithPin) read
 * naturally as "PIN" rather than "password".
 *
 * Rationale: a 4-digit PIN only has 10 000 possible values, so a DB leak
 * with cleartext PINs would let an attacker walk into every tenant
 * checklist instantly. Hashing turns that into an offline argon2 crack
 * per PIN — still feasible for short PINs, but not free, and combined
 * with the global rate-limit it raises the bar meaningfully.
 *
 * Online brute-force is mitigated by the express-rate-limit on /api/.
 */

import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const HASH_PREFIX = "$argon2";

/** True if the value already looks like a PHC argon2 hash. */
export function isPinHashed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(HASH_PREFIX);
}

/** Hash a 4-8 digit PIN. Idempotent if already hashed (returns as-is). */
export async function hashPin(plain: string): Promise<string> {
  if (isPinHashed(plain)) return plain;
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a candidate PIN against a stored value.
 *
 * Accepts both a hashed PIN (post-migration) and — defensively — a
 * cleartext PIN (pre-migration window). The cleartext branch SHOULD be
 * unreachable once `migrateLegacyPins()` has run at boot, but keeping
 * it ensures the boot ordering bug doesn't lock everyone out.
 */
export async function verifyPin(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!plain || !stored) return false;
  if (!isPinHashed(stored)) {
    return plain === stored;
  }
  try {
    return await argon2.verify(stored, plain);
  } catch {
    return false;
  }
}
