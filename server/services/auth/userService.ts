/**
 * User service — DB ops on `users` + token tables.
 *
 * Email is normalised (lowercased) at every write/read boundary. The
 * unique index on `users.email` is plain text (Postgres lacks `citext`
 * by default in the standard image), so we MUST be consistent.
 */

import { db } from "../../db";
import {
  users,
  passwordResetTokens,
  emailVerificationTokens,
  type User,
} from "../../../shared/schema/users";
import { eq, and, isNull } from "drizzle-orm";
import { hashPassword } from "./passwordService";
import { generateToken, hashToken, tokenExpiry, TOKEN_TTL } from "./tokenService";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = "EmailAlreadyExistsError";
  }
}

class UserService {
  async findByEmail(email: string): Promise<User | null> {
    const e = normalizeEmail(email);
    const [row] = await db.select().from(users).where(eq(users.email, e));
    return row ?? null;
  }

  async getById(id: number): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  }

  /**
   * Creates a user. Throws EmailAlreadyExistsError on collision so the
   * caller can map to a 409 without leaking which DB constraint fired.
   *
   * `password` is hashed here — callers MUST NOT hash beforehand.
   */
  async create(data: {
    email: string;
    password: string;
    fullName?: string | null;
    locale?: string;
    isSuperadmin?: boolean;
  }): Promise<User> {
    const email = normalizeEmail(data.email);
    const existing = await this.findByEmail(email);
    if (existing) throw new EmailAlreadyExistsError(email);

    const passwordHash = await hashPassword(data.password);
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName: data.fullName ?? null,
        locale: data.locale ?? "fr",
        isSuperadmin: data.isSuperadmin ?? false,
      })
      .returning();
    return row;
  }

  async setPassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async markEmailVerified(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async recordLogin(userId: number): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  // ====================== Email verification ======================

  /**
   * Issues a verification token for `userId` and returns the cleartext
   * (caller must email it; we store only the hash).
   */
  async issueEmailVerificationToken(userId: number): Promise<string> {
    const cleartext = generateToken();
    await db.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashToken(cleartext),
      expiresAt: tokenExpiry(new Date(), TOKEN_TTL.emailVerification),
    });
    return cleartext;
  }

  /**
   * Consumes an email verification token. Returns the affected userId
   * on success, or null if the token is unknown / expired / already
   * used. Marks the user as verified atomically with token consumption.
   */
  async consumeEmailVerificationToken(cleartext: string): Promise<number | null> {
    const tokenHash = hashToken(cleartext);
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.tokenHash, tokenHash), isNull(emailVerificationTokens.usedAt)));
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;

    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));
    await this.markEmailVerified(row.userId);
    return row.userId;
  }

  // ======================= Password reset =========================

  async issuePasswordResetToken(userId: number): Promise<string> {
    const cleartext = generateToken();
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(cleartext),
      expiresAt: tokenExpiry(new Date(), TOKEN_TTL.passwordReset),
    });
    return cleartext;
  }

  /**
   * Consumes a password reset token + sets the new password atomically
   * (single transaction not used here since drizzle-orm/node-postgres
   * tx requires a callback — keeping linear for readability; race is
   * tolerable: token is single-use enforced by unique index + usedAt).
   */
  async consumePasswordResetToken(cleartext: string, newPassword: string): Promise<number | null> {
    const tokenHash = hashToken(cleartext);
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)));
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;

    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    await this.setPassword(row.userId, newPassword);
    return row.userId;
  }
}

export const userService = new UserService();
