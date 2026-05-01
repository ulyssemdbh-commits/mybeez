/**
 * Password hashing — argon2id with OWASP 2024 recommended parameters.
 *
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *
 *   - argon2id (hybrid: side-channel + GPU resistance)
 *   - memoryCost = 19 MiB (19456 KiB)
 *   - timeCost   = 2 iterations
 *   - parallelism = 1
 *
 * The PHC-formatted output is self-describing: the verifier reads the
 * params from the stored hash, so we can rotate parameters server-side
 * without invalidating existing passwords (next login re-hashes if
 * params changed — feature reserved for a later PR).
 */

import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

export class PasswordTooShortError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    this.name = "PasswordTooShortError";
  }
}

export class PasswordTooLongError extends Error {
  constructor() {
    super(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
    this.name = "PasswordTooLongError";
  }
}

/**
 * Validates length bounds before hashing. We do NOT enforce a complexity
 * pattern (NIST SP 800-63B explicitly recommends against it for human
 * usability). The lower bound mirrors NIST's "long passphrase" guidance.
 */
export function assertPasswordBounds(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new PasswordTooShortError();
  if (password.length > MAX_PASSWORD_LENGTH) throw new PasswordTooLongError();
}

export async function hashPassword(plain: string): Promise<string> {
  assertPasswordBounds(plain);
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Constant-time comparison via the underlying argon2 binding.
 * Returns false (never throws) if the hash is malformed — treat any
 * non-true result as "wrong password".
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || !plain) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export const PASSWORD_LIMITS = {
  min: MIN_PASSWORD_LENGTH,
  max: MAX_PASSWORD_LENGTH,
} as const;
