/**
 * MFA TOTP routes — PR #13.
 *
 * Lifecycle:
 *
 *   /api/auth/user/mfa/status      GET  (requireUser) — current MFA state
 *   /api/auth/user/mfa/setup       POST (requireUser) — start enrolment, returns
 *                                  cleartext secret + recovery codes ONCE
 *   /api/auth/user/mfa/confirm     POST (requireUser) — verify TOTP, mark active
 *   /api/auth/user/mfa/disable     POST (requireUser) — re-auth + delete row
 *   /api/auth/user/mfa/challenge   POST (requireMfaPending) — TOTP at login,
 *                                  promotes pending session to full session
 *   /api/auth/user/mfa/recovery    POST (requireMfaPending) — recovery code at
 *                                  login (single-use), promotes session
 *   /api/auth/user/mfa/cancel      POST — clears pending state
 *
 * Security posture:
 *   - /setup, /disable demand the user's password to make a stolen cookie
 *     useless against the MFA controls themselves.
 *   - /challenge and /recovery deliberately accept the same opaque error to
 *     avoid leaking which secret store matched.
 *   - Pending-session TTL (5 min) is enforced by `requireMfaPending`.
 */

import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { mfaService, buildOtpauthUrl, MFA_CONSTANTS } from "../services/auth/mfaService";
import { userService } from "../services/auth/userService";
import { verifyPassword, PASSWORD_LIMITS } from "../services/auth/passwordService";
import {
  requireUser,
  getUserSession,
  requireMfaPending,
  clearMfaPending,
} from "../middleware/auth";

const codeSchema = z.string().min(6).max(20);
const passwordSchema = z.string().min(PASSWORD_LIMITS.min).max(PASSWORD_LIMITS.max);

const setupSchema = z.object({ password: passwordSchema });
const confirmSchema = z.object({ code: codeSchema });
const disableSchema = z.object({ password: passwordSchema });
const challengeSchema = z.object({ code: codeSchema });
const recoverySchema = z.object({ code: z.string().min(8).max(40) });

/** Re-auth with password, used by /setup and /disable. Returns user or null. */
async function reauthenticate(userId: number, password: string) {
  const user = await userService.getById(userId);
  if (!user || !user.isActive) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

export function registerUserAuthMfaRoutes(app: Express): void {
  // ============================== status ==============================
  app.get("/api/auth/user/mfa/status", requireUser, async (req: Request, res: Response) => {
    try {
      const u = getUserSession(req)!;
      const status = await mfaService.statusFor(u.userId);
      res.json(status);
    } catch (error) {
      console.error("[mfa] status error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== setup ==============================
  // Re-authenticates with password, then (re)generates secret + recovery
  // codes. Returns the cleartext data ONCE — the client must show it to
  // the user immediately; we will not surface them again afterwards.
  app.post("/api/auth/user/mfa/setup", requireUser, async (req: Request, res: Response) => {
    try {
      const data = setupSchema.parse(req.body);
      const u = getUserSession(req)!;
      const user = await reauthenticate(u.userId, data.password);
      if (!user) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
      }

      const { secret, recoveryCodes } = await mfaService.startEnrolment(user.id);
      const otpauthUrl = buildOtpauthUrl({ secret, accountName: user.email });
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M" });

      res.json({
        secret,
        otpauthUrl,
        qrDataUrl,
        recoveryCodes,
        digits: MFA_CONSTANTS.totpDigits,
        period: MFA_CONSTANTS.totpStepSeconds,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[mfa] setup error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== confirm ==============================
  // First valid TOTP code locks enrolment in (sets confirmedAt).
  app.post("/api/auth/user/mfa/confirm", requireUser, async (req: Request, res: Response) => {
    try {
      const data = confirmSchema.parse(req.body);
      const u = getUserSession(req)!;
      const ok = await mfaService.confirmEnrolment(u.userId, data.code);
      if (!ok) {
        return res.status(400).json({ error: "Code invalide" });
      }
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[mfa] confirm error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== disable ==============================
  // Re-authenticates with password to defeat a cookie-only attacker.
  app.post("/api/auth/user/mfa/disable", requireUser, async (req: Request, res: Response) => {
    try {
      const data = disableSchema.parse(req.body);
      const u = getUserSession(req)!;
      const user = await reauthenticate(u.userId, data.password);
      if (!user) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
      }
      await mfaService.disable(user.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[mfa] disable error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== challenge ==============================
  // Second login factor. Verifies TOTP and PROMOTES the pending session
  // to a full nominative session.
  app.post("/api/auth/user/mfa/challenge", requireMfaPending, async (req: Request, res: Response) => {
    try {
      const data = challengeSchema.parse(req.body);
      const pending = req.mfaPending!;
      const ok = await mfaService.verifyChallenge(pending.userId, data.code);
      if (!ok) {
        return res.status(401).json({ error: "Code invalide" });
      }
      promoteToFullSession(req, pending.userId);
      const user = await userService.getById(pending.userId);
      if (!user) {
        return res.status(401).json({ error: "Compte introuvable" });
      }
      await userService.recordLogin(user.id);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          locale: user.locale,
          emailVerified: user.emailVerifiedAt !== null,
          isSuperadmin: user.isSuperadmin,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[mfa] challenge error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== recovery ==============================
  // Single-use recovery code path. Same promotion semantics as /challenge.
  app.post("/api/auth/user/mfa/recovery", requireMfaPending, async (req: Request, res: Response) => {
    try {
      const data = recoverySchema.parse(req.body);
      const pending = req.mfaPending!;
      const remaining = await mfaService.consumeRecoveryCode(pending.userId, data.code);
      if (remaining === null) {
        return res.status(401).json({ error: "Code de récupération invalide" });
      }
      promoteToFullSession(req, pending.userId);
      const user = await userService.getById(pending.userId);
      if (!user) {
        return res.status(401).json({ error: "Compte introuvable" });
      }
      await userService.recordLogin(user.id);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          locale: user.locale,
          emailVerified: user.emailVerifiedAt !== null,
          isSuperadmin: user.isSuperadmin,
        },
        recoveryCodesRemaining: remaining,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[mfa] recovery error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== cancel ==============================
  // User backs out of the challenge screen. Cleans the pending state.
  app.post("/api/auth/user/mfa/cancel", (req: Request, res: Response) => {
    clearMfaPending(req);
    res.json({ success: true });
  });
}

/** Replaces the half-baked session with a full nominative one. */
function promoteToFullSession(req: Request, userId: number): void {
  const session = req.session as unknown as { userId?: number };
  session.userId = userId;
  clearMfaPending(req);
}
