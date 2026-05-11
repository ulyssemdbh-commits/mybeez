/**
 * Nominative auth routes — PR #12.
 *
 * Mounted alongside the legacy PIN auth (`/api/auth/{pin-login,me,logout}`)
 * which stays operational during the migration. To avoid path collision
 * with `/api/auth/me` (PIN), the new routes live under `/api/auth/user/*`.
 *
 * Endpoints:
 *   POST /api/auth/user/signup             create a new user account
 *   POST /api/auth/user/login              start a nominative session
 *   POST /api/auth/user/logout             clear the nominative session
 *   GET  /api/auth/user/me                 current user (or 401)
 *   POST /api/auth/user/verify-email       consume an email-verify token
 *   POST /api/auth/user/forgot-password    issue a reset link (always 202)
 *   POST /api/auth/user/reset-password     consume a reset token + set new password
 *
 * Security posture:
 *   - Email is normalised lowercase at the service layer.
 *   - Login always returns a generic error to avoid email enumeration.
 *   - Forgot-password ALWAYS responds 202 regardless of whether the
 *     email exists — same reason. The user gets the email iff the
 *     account exists; otherwise nothing happens server-side.
 *   - Rate limiting will be tightened in PR #13. The global /api/
 *     limiter already applies (120 req/min).
 *   - Audit log writes (PR #13b) en place sur signup / login / logout /
 *     verify-email / forgot-password / reset-password.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { userTenants } from "../../shared/schema/users";
import { tenants } from "../../shared/schema/tenants";
import { userService, EmailAlreadyExistsError, normalizeEmail } from "../services/auth/userService";
import { verifyPassword, PasswordPwnedError } from "../services/auth/passwordService";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/auth/mailService";
import { requireUser, getUserSession, clearMfaPending } from "../middleware/auth";
import { PASSWORD_LIMITS } from "../services/auth/passwordService";
import { mfaService, generatePendingId } from "../services/auth/mfaService";
import { recordAudit } from "../services/auth/auditService";
import { checkLockout } from "../services/auth/lockoutService";
import { moduleLogger } from "../lib/logger";

const log = moduleLogger("AuthRoutes");

function getPrimaryRootDomain(): string {
  const raw = process.env.ROOT_DOMAINS || "mybeez-ai.com,localhost";
  return raw.split(",")[0]!.trim().toLowerCase();
}

function tenantUrlFor(slug: string): string {
  const root = getPrimaryRootDomain();
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${slug}.${root}`;
}

const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(PASSWORD_LIMITS.min).max(PASSWORD_LIMITS.max);

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(1).max(120).optional(),
  locale: z.enum(["fr", "en"]).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const verifyEmailSchema = z.object({ token: z.string().min(1).max(200) });

const forgotPasswordSchema = z.object({ email: emailSchema });

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  // Fallback derived from the request — fine for dev. In prod, set APP_BASE_URL.
  const proto = req.protocol;
  const host = req.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

function publicUserShape(u: {
  id: number;
  email: string;
  fullName: string | null;
  locale: string;
  emailVerifiedAt: Date | null;
  isSuperadmin: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    locale: u.locale,
    emailVerified: u.emailVerifiedAt !== null,
    isSuperadmin: u.isSuperadmin,
  };
}

export function registerUserAuthRoutes(app: Express): void {
  // ============================== signup ==============================
  app.post("/api/auth/user/signup", async (req: Request, res: Response) => {
    try {
      const data = signupSchema.parse(req.body);
      const user = await userService.create({
        email: data.email,
        password: data.password,
        fullName: data.fullName ?? null,
        locale: data.locale ?? "fr",
        checkPwned: true,
      });

      const token = await userService.issueEmailVerificationToken(user.id);
      const verifyUrl = `${getAppBaseUrl(req)}/auth/verify?token=${encodeURIComponent(token)}`;
      try {
        await sendVerificationEmail({ email: user.email, fullName: user.fullName }, verifyUrl);
      } catch (mailErr) {
        log.error({ err: mailErr }, "verification email failed");
        // Don't fail the signup just because the email failed — the
        // user can request a re-send later.
      }

      void recordAudit({ req, event: "auth.signup.success", userId: user.id });
      res.status(201).json({ user: publicUserShape(user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      if (error instanceof EmailAlreadyExistsError) {
        void recordAudit({
          req,
          event: "auth.signup.failure",
          metadata: { reason: "email_already_exists" },
        });
        return res.status(409).json({ error: "Cet email est déjà utilisé" });
      }
      if (error instanceof PasswordPwnedError) {
        void recordAudit({
          req,
          event: "auth.signup.failure",
          metadata: { reason: "password_pwned" },
        });
        return res.status(400).json({
          error:
            "Ce mot de passe a été compromis dans une fuite connue. Choisissez-en un autre.",
          field: "password",
          code: "PASSWORD_PWNED",
        });
      }
      log.error({ err: error }, "signup error");
      res.status(500).json({ error: "Erreur de création du compte" });
    }
  });

  // ============================== login ==============================
  // If the user has confirmed MFA, the password step alone is NOT enough:
  // we set a half-baked "pending" session and reply { mfaRequired: true }.
  // The client must call /api/auth/user/mfa/{challenge,recovery} within
  // MFA_PENDING_TTL_MS to promote the session to a full nominative one.
  app.post("/api/auth/user/login", async (req: Request, res: Response) => {
    try {
      const data = loginSchema.parse(req.body);
      const email = normalizeEmail(data.email);
      const user = await userService.findByEmail(email);

      // Account lockout check happens BEFORE the (expensive) password
      // verification so a locked account cannot be used to amplify
      // argon2id work into a DoS vector.
      if (user) {
        const lock = await checkLockout(user.id);
        if (lock.locked) {
          void recordAudit({
            req,
            event: "auth.lockout.triggered",
            userId: user.id,
            metadata: {
              source: "login",
              failureCount: lock.failureCount,
              retryAfterSeconds: lock.retryAfterSeconds,
            },
          });
          res.setHeader("Retry-After", String(lock.retryAfterSeconds));
          return res.status(429).json({
            error: "Trop de tentatives, réessayez plus tard",
            retryAfterSeconds: lock.retryAfterSeconds,
          });
        }
      }

      const ok = user && user.isActive ? await verifyPassword(data.password, user.passwordHash) : false;
      if (!user || !ok) {
        // Generic message — avoid leaking which case applies. L'audit
        // capture le `reason` interne (utile pour le SIEM) sans le renvoyer
        // au client.
        const reason = !user
          ? "unknown_email"
          : !user.isActive
            ? "user_disabled"
            : "wrong_password";
        void recordAudit({
          req,
          event: "auth.login.failure",
          userId: user?.id ?? null,
          metadata: { reason, email: email.slice(0, 100) },
        });
        return res.status(401).json({ error: "Email ou mot de passe invalide" });
      }

      const session = req.session as unknown as {
        userId?: number;
        mfaPendingUserId?: number;
        mfaPendingAt?: number;
        mfaPendingId?: string;
      };

      const mfaEnabled = await mfaService.isEnabled(user.id);
      if (mfaEnabled) {
        // Drop any half-session from an older login and start a fresh one.
        clearMfaPending(req);
        delete session.userId;
        session.mfaPendingUserId = user.id;
        session.mfaPendingAt = Date.now();
        session.mfaPendingId = generatePendingId();
        void recordAudit({
          req,
          event: "auth.login.mfa_pending",
          userId: user.id,
        });
        return res.json({ mfaRequired: true });
      }

      // No MFA → standard nominative session.
      session.userId = user.id;
      await userService.recordLogin(user.id);
      void recordAudit({ req, event: "auth.login.success", userId: user.id });
      res.json({ user: publicUserShape(user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "login error");
      res.status(500).json({ error: "Erreur de connexion" });
    }
  });

  // ============================== logout ==============================
  app.post("/api/auth/user/logout", (req: Request, res: Response) => {
    // Clear ONLY the nominative session keys; keep PIN session intact
    // so a checklist tablet doesn't get logged out by an admin's logout.
    const session = req.session as unknown as { userId?: number; currentTenantId?: number };
    const userId = session.userId ?? null;
    delete session.userId;
    delete session.currentTenantId;
    clearMfaPending(req);
    if (userId !== null) {
      void recordAudit({ req, event: "auth.logout", userId });
    }
    res.json({ success: true });
  });

  // ============================== me ==============================
  app.get("/api/auth/user/me", requireUser, async (req: Request, res: Response) => {
    try {
      const u = getUserSession(req)!;
      const user = await userService.getById(u.userId);
      if (!user) {
        // Session refers to a deleted user — clear and 401.
        const session = req.session as unknown as { userId?: number };
        delete session.userId;
        return res.status(401).json({ error: "Session invalide" });
      }
      const memberships = await db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          isActive: tenants.isActive,
          role: userTenants.role,
        })
        .from(userTenants)
        .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
        .where(eq(userTenants.userId, user.id))
        .orderBy(tenants.name);

      res.json({
        user: publicUserShape(user),
        tenants: memberships.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          isActive: m.isActive,
          role: m.role,
          url: tenantUrlFor(m.slug),
        })),
      });
    } catch (error) {
      log.error({ err: error }, "me error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== verify-email ==============================
  app.post("/api/auth/user/verify-email", async (req: Request, res: Response) => {
    try {
      const data = verifyEmailSchema.parse(req.body);
      const userId = await userService.consumeEmailVerificationToken(data.token);
      if (!userId) {
        void recordAudit({
          req,
          event: "auth.email_verify.failure",
          metadata: { reason: "invalid_or_expired" },
        });
        return res.status(400).json({ error: "Lien invalide ou expiré" });
      }
      void recordAudit({ req, event: "auth.email_verify.success", userId });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "verify-email error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== forgot-password ==============================
  app.post("/api/auth/user/forgot-password", async (req: Request, res: Response) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      const user = await userService.findByEmail(data.email);
      // Always 202 to avoid email enumeration. Side effect (token issue
      // + email send) only happens when the user exists.
      if (user && user.isActive) {
        try {
          const token = await userService.issuePasswordResetToken(user.id);
          const resetUrl = `${getAppBaseUrl(req)}/auth/reset?token=${encodeURIComponent(token)}`;
          await sendPasswordResetEmail({ email: user.email, fullName: user.fullName }, resetUrl);
          void recordAudit({
            req,
            event: "auth.password_reset.requested",
            userId: user.id,
          });
        } catch (mailErr) {
          log.error({ err: mailErr }, "password reset email failed");
        }
      } else {
        void recordAudit({
          req,
          event: "auth.password_reset.requested.unknown_email",
          metadata: { email: data.email.slice(0, 100) },
        });
      }
      res.status(202).json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "forgot-password error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== reset-password ==============================
  app.post("/api/auth/user/reset-password", async (req: Request, res: Response) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      const userId = await userService.consumePasswordResetToken(data.token, data.password);
      if (!userId) {
        void recordAudit({
          req,
          event: "auth.password_reset.failure",
          metadata: { reason: "invalid_or_expired" },
        });
        return res.status(400).json({ error: "Lien invalide ou expiré" });
      }
      void recordAudit({ req, event: "auth.password_reset.success", userId });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      if (error instanceof PasswordPwnedError) {
        void recordAudit({
          req,
          event: "auth.password_reset.failure",
          metadata: { reason: "password_pwned" },
        });
        return res.status(400).json({
          error:
            "Ce mot de passe a été compromis dans une fuite connue. Choisissez-en un autre.",
          field: "password",
          code: "PASSWORD_PWNED",
        });
      }
      log.error({ err: error }, "reset-password error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
