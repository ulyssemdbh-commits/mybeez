/**
 * Auth schema — myBeez (PR #11)
 *
 * This PR introduces the data layer ONLY. No routes, no middleware
 * changes — those land in PR #12 (email/password + RBAC) and PR #13
 * (MFA + audit).
 *
 * Design decisions:
 *
 * - **`users` is cross-tenant**: a real human can be Owner of one
 *   tenant and Manager of another. No `tenantId` column on users —
 *   the link lives in `user_tenants` (many-to-many with role).
 *
 * - **Email is the primary identifier**, stored lowercased and
 *   case-folded at the application layer (Postgres lacks `citext`
 *   in default extensions; we normalise on write). Unique constraint
 *   guarantees no two users share an email.
 *
 * - **Password hash is `text`**, large enough for argon2id encoded
 *   strings (~96+ chars). We do NOT store plaintext, length-only
 *   hints, or anything reversible.
 *
 * - **Tokens** (`password_reset_tokens`, `email_verification_tokens`)
 *   store the **SHA-256 hash** of the token, never the token itself.
 *   The cleartext is sent once by email and immediately discarded.
 *   Verification compares hashes.
 *
 * - **MFA secrets** are stored as-issued (TOTP secret = base32 string).
 *   Encryption-at-rest is the DB / disk layer's job (KMS, full-disk
 *   crypto). Recovery codes are hashed (one-way) before storage so a
 *   DB read alone cannot derive them.
 *
 * - **Audit log**: append-only conceptually; no UPDATE/DELETE in code.
 *   Nullable userId/tenantId so we can record events that happen
 *   pre-auth (failed login attempts) or out-of-tenant (superadmin
 *   actions).
 */

import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  json,
  varchar,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

/** Roles a user can hold within a tenant. Order matters: lower index = more powerful. */
export const TENANT_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    /** Set when the user clicks the verification link in their welcome email. */
    emailVerifiedAt: timestamp("email_verified_at"),
    /** argon2id encoded string (PHC format). Never plaintext. */
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"),
    locale: text("locale").notNull().default("fr"),
    /** Cross-tenant superadmin (myBeez staff). Distinct from any tenant role. */
    isSuperadmin: boolean("is_superadmin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at"),
    /** Soft-disable a user without deleting their audit trail. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    /** Unique on lowercased email — enforced at the app layer (writes lowercase before insert). */
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const userTenants = pgTable(
  "user_tenants",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Validated against TENANT_ROLES at the application layer (no DB enum to keep additive). */
    role: text("role").notNull(),
    /** When the invite was issued (for pending invites this is set, acceptedAt null). */
    invitedAt: timestamp("invited_at").notNull().defaultNow(),
    /** Set when the invitee actually joined. Null = pending invite. */
    acceptedAt: timestamp("accepted_at"),
    invitedByUserId: integer("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.tenantId] }),
    tenantIdx: index("user_tenants_tenant_id_idx").on(table.tenantId),
  }),
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the cleartext token. Cleartext is in the user's email and nowhere else. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    /** Set the first time the token is consumed; subsequent uses must fail. */
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("password_reset_tokens_token_hash_idx").on(table.tokenHash),
    userIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  }),
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("email_verification_tokens_token_hash_idx").on(table.tokenHash),
    userIdx: index("email_verification_tokens_user_id_idx").on(table.userId),
  }),
);

export const mfaSecrets = pgTable(
  "mfa_secrets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** TOTP base32 secret. Disk-level encryption is the deployment's job. */
    secret: text("secret").notNull(),
    /** Set when the user has confirmed setup with a valid TOTP code. */
    confirmedAt: timestamp("confirmed_at"),
    /** Hashed (sha256) one-time recovery codes. Original cleartext shown once at setup. */
    recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("mfa_secrets_user_id_idx").on(table.userId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    /** Nullable: pre-auth events (failed login on unknown email) have no userId. */
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Nullable: superadmin actions or pre-tenant-scope events. */
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    /**
     * Stable event identifier (e.g. `auth.login.success`, `tenant.created`,
     * `user.role.changed`). Convention: `domain.action.outcome`.
     */
    event: text("event").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: index("audit_log_event_idx").on(table.event),
    userIdx: index("audit_log_user_id_idx").on(table.userId),
    tenantIdx: index("audit_log_tenant_id_idx").on(table.tenantId),
    createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
  }),
);

// Insert schemas for runtime validation.
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserTenantSchema = createInsertSchema(userTenants).omit({
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserTenant = typeof userTenants.$inferSelect;
export type InsertUserTenant = z.infer<typeof insertUserTenantSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type MfaSecret = typeof mfaSecrets.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;

/**
 * `user_sessions` is the express-session store provisioned by
 * `connect-pg-simple` with `createTableIfMissing: true` (see
 * server/index.ts). The schema is owned by that library, NOT by the app.
 *
 * We declare it here so drizzle-kit recognises it during `db:push` and
 * stops trying to drop it (which would log every active user out, and
 * kills non-interactive `db:push -T` because the prompt cannot be
 * answered). The columns mirror connect-pg-simple's table.sql exactly.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);
