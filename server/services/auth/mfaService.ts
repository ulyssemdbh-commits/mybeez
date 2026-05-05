/**
 * MFA TOTP service — RFC 6238 (Time-based One-Time Password).
 *
 * Two layers in this file:
 *
 * 1. **Pure helpers** (testable without a DB): TOTP secret generation,
 *    otpauth URL building, code verification, recovery code creation
 *    and constant-time hashing/lookup. No imports from `db` here.
 *
 * 2. **`mfaService` singleton** (DB ops on `mfa_secrets`): enrol, confirm,
 *    disable, consume recovery code. Composes the pure helpers above.
 *
 * Algorithm: SHA-1 / 6 digits / 30 s step (Google Authenticator default,
 * required for app compatibility). Verification window = 1 step (±30 s)
 * to absorb client clock skew without weakening the OTP.
 *
 * Recovery codes:
 *   - 10 codes generated at enrol, format `XXXX-XXXX-XXXX` (Crockford
 *     base32, 12 chars + 2 dashes = 14 chars).
 *   - Stored as SHA-256 hashes (one-way). Cleartext shown ONCE at setup.
 *   - Single-use: consumed code is removed from the stored array.
 *   - Verification is constant-time across the array (always iterate
 *     all entries to avoid timing leaks on which slot matched).
 */

import { generateSecret, generateURI, verifySync } from "otplib";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { mfaSecrets, type MfaSecret } from "../../../shared/schema/users";

// ============================== constants ==============================

const TOTP_DIGITS = 6;
const TOTP_STEP_SECONDS = 30;
/** ±30 s of clock drift tolerated (one TOTP step on either side). */
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

const RECOVERY_CODE_COUNT = 10;
/** Crockford-style base32 alphabet (no I/L/O/U) for human readability. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const RECOVERY_GROUP_SIZE = 4;
const RECOVERY_GROUPS = 3; // 4 × 3 = 12 chars + 2 dashes.

export const MFA_CONSTANTS = {
  totpDigits: TOTP_DIGITS,
  totpStepSeconds: TOTP_STEP_SECONDS,
  totpEpochToleranceSeconds: TOTP_EPOCH_TOLERANCE_SECONDS,
  recoveryCodeCount: RECOVERY_CODE_COUNT,
} as const;

// ============================== pure helpers ==============================

/**
 * Generates a fresh TOTP secret (base32, ~32 chars) suitable for storage
 * in `mfa_secrets.secret` and for embedding in an otpauth URL.
 */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * Builds the otpauth URL for QR rendering. `accountName` is shown in the
 * authenticator app under `issuer`. We use the user's email for clarity.
 */
export function buildOtpauthUrl(params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? "myBeez";
  return generateURI({
    issuer,
    label: params.accountName,
    secret: params.secret,
    digits: TOTP_DIGITS,
    period: TOTP_STEP_SECONDS,
  });
}

/**
 * Verifies a 6-digit code against a TOTP secret. Tolerates ±30 s of
 * clock drift. Returns false on any malformed input rather than throwing.
 */
export function verifyTotp(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  const cleaned = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = verifySync({
      secret,
      token: cleaned,
      digits: TOTP_DIGITS,
      period: TOTP_STEP_SECONDS,
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * Generates a single recovery code formatted `XXXX-XXXX-XXXX`. Uses
 * `crypto.randomInt` for unbiased uniform sampling over the alphabet.
 */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    let group = "";
    for (let c = 0; c < RECOVERY_GROUP_SIZE; c++) {
      group += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Generates `RECOVERY_CODE_COUNT` distinct recovery codes. */
export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    codes.add(generateRecoveryCode());
  }
  return Array.from(codes);
}

/**
 * Normalises a user-typed recovery code: strip spaces/dashes, uppercase.
 * Lets users paste with or without dashes, in any case.
 */
export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * SHA-256 hex of the *normalised* recovery code. The hash is what's
 * persisted; the cleartext is shown once at setup and discarded.
 */
export function hashRecoveryCode(plain: string): string {
  const normalised = normalizeRecoveryCode(plain);
  return createHash("sha256").update(normalised).digest("hex");
}

/**
 * Returns the index of the matching hash in `storedHashes`, or -1 if
 * none matches. Always iterates the full array (constant-time across
 * slots) to avoid leaking which slot held the match.
 */
export function findRecoveryCodeIndex(plain: string, storedHashes: string[]): number {
  if (!plain || storedHashes.length === 0) return -1;
  const candidate = hashRecoveryCode(plain);
  const candidateBuf = Buffer.from(candidate, "hex");
  let matchIndex = -1;
  for (let i = 0; i < storedHashes.length; i++) {
    const stored = storedHashes[i]!;
    if (stored.length !== candidate.length) continue;
    let equal = false;
    try {
      equal = timingSafeEqual(candidateBuf, Buffer.from(stored, "hex"));
    } catch {
      equal = false;
    }
    if (equal && matchIndex === -1) matchIndex = i;
  }
  return matchIndex;
}

/**
 * Generates a short opaque `pendingId` to bind a "MFA-pending" session
 * to its login attempt — used to invalidate the pending state on
 * timeout / re-login. Not security-critical (the session cookie itself
 * is the trust boundary), but adds defence-in-depth.
 */
export function generatePendingId(): string {
  return randomBytes(16).toString("base64url");
}

// ============================== service singleton ==============================

class MfaService {
  /** Returns the row for `userId`, or null. */
  async getByUserId(userId: number): Promise<MfaSecret | null> {
    const [row] = await db.select().from(mfaSecrets).where(eq(mfaSecrets.userId, userId)).limit(1);
    return row ?? null;
  }

  /** True iff the user has an active (confirmed) MFA secret. */
  async isEnabled(userId: number): Promise<boolean> {
    const row = await this.getByUserId(userId);
    return Boolean(row?.confirmedAt);
  }

  /**
   * Starts (or restarts) enrolment: writes a fresh secret + recovery
   * codes to `mfa_secrets` with `confirmedAt = null`. If a row already
   * exists for the user, it is overwritten (so a user who lost their
   * authenticator can restart enrolment as long as they're still logged
   * in). Returns the cleartext secret + recovery codes — these MUST be
   * shown to the user once and not persisted anywhere else.
   */
  async startEnrolment(userId: number): Promise<{
    secret: string;
    recoveryCodes: string[];
  }> {
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    const recoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
    const now = new Date();

    const existing = await this.getByUserId(userId);
    if (existing) {
      await db
        .update(mfaSecrets)
        .set({
          secret,
          recoveryCodeHashes,
          confirmedAt: null,
          updatedAt: now,
        })
        .where(eq(mfaSecrets.userId, userId));
    } else {
      await db.insert(mfaSecrets).values({
        userId,
        secret,
        recoveryCodeHashes,
        confirmedAt: null,
      });
    }

    return { secret, recoveryCodes };
  }

  /**
   * Finalises enrolment: verifies a TOTP code against the pending
   * secret and stamps `confirmedAt`. Returns true on success.
   * Idempotent: if already confirmed and code valid, returns true.
   */
  async confirmEnrolment(userId: number, code: string): Promise<boolean> {
    const row = await this.getByUserId(userId);
    if (!row) return false;
    if (!verifyTotp(row.secret, code)) return false;
    if (!row.confirmedAt) {
      await db
        .update(mfaSecrets)
        .set({ confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(mfaSecrets.userId, userId));
    }
    return true;
  }

  /**
   * Verifies a TOTP code at login challenge time. Pure check — does
   * NOT consume anything. Returns false if MFA is not active.
   */
  async verifyChallenge(userId: number, code: string): Promise<boolean> {
    const row = await this.getByUserId(userId);
    if (!row || !row.confirmedAt) return false;
    return verifyTotp(row.secret, code);
  }

  /**
   * Verifies and CONSUMES a recovery code at login challenge time.
   * Single-use: the matching hash is removed from the stored array.
   * Returns the number of recovery codes remaining (or null on no match).
   */
  async consumeRecoveryCode(userId: number, code: string): Promise<number | null> {
    const row = await this.getByUserId(userId);
    if (!row || !row.confirmedAt) return null;
    const idx = findRecoveryCodeIndex(code, row.recoveryCodeHashes);
    if (idx === -1) return null;
    const updated = row.recoveryCodeHashes.filter((_, i) => i !== idx);
    await db
      .update(mfaSecrets)
      .set({ recoveryCodeHashes: updated, updatedAt: new Date() })
      .where(eq(mfaSecrets.userId, userId));
    return updated.length;
  }

  /**
   * Disables MFA for the user (deletes the row). Caller is responsible
   * for re-authenticating the user (password) before calling this — the
   * service does not enforce that gate.
   */
  async disable(userId: number): Promise<void> {
    await db.delete(mfaSecrets).where(eq(mfaSecrets.userId, userId));
  }

  /**
   * Public-safe view of the MFA state for the current user.
   * `enabled` reflects confirmation, not just enrolment-in-progress.
   */
  async statusFor(userId: number): Promise<{
    enabled: boolean;
    confirmedAt: Date | null;
    pendingEnrolment: boolean;
    recoveryCodesRemaining: number;
  }> {
    const row = await this.getByUserId(userId);
    if (!row) {
      return {
        enabled: false,
        confirmedAt: null,
        pendingEnrolment: false,
        recoveryCodesRemaining: 0,
      };
    }
    return {
      enabled: Boolean(row.confirmedAt),
      confirmedAt: row.confirmedAt,
      pendingEnrolment: !row.confirmedAt,
      recoveryCodesRemaining: row.recoveryCodeHashes.length,
    };
  }
}

export const mfaService = new MfaService();
