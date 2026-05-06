/**
 * Auth Middleware — myBeez
 *
 * Nominative auth model (PR #11+) :
 *   - `requireUser` : full nominative session (`session.userId`)
 *   - `requireRole(...)` : nominative session + a tenant role from the
 *     allowed list (must run after `resolveTenant`)
 *   - `requireSuperadminUser` : nominative session + `users.isSuperadmin`
 *   - `requireMfaPending` : half-baked session between password and TOTP
 *   - `requireSuperadmin` : Bearer-token gate for the temporary `/api/tenants`
 *     admin routes (deprecated, will go away with the admin UI rewrite)
 *
 * Sessions are stored server-side via express-session (Postgres-backed).
 *
 * The legacy PIN auth (`requireAuth`, `requireAdmin`, `requireTenantAuth`)
 * was removed alongside the route, service and front-end hook in the PIN
 * purge (chore/purge-pin-auth).
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { userTenantService } from "../services/auth/userTenantService";
import { userService } from "../services/auth/userService";
import { TENANT_ROLES, type TenantRole } from "../../shared/schema/users";

/** Shape of the nominative session payload. */
export interface UserSession {
  userId: number;
  currentTenantId?: number;
}

/** Half-baked session created right after password but before MFA. */
export interface MfaPendingSession {
  userId: number;
  /** ms epoch when the pending state was created (for TTL). */
  at: number;
  /** Opaque token tying this pending state to the originating login attempt. */
  id: string;
}

/** TTL for an MFA-pending session: 5 min. After that, /challenge replies 410. */
export const MFA_PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * requireSuperadmin — temporary admin gate for /api/tenants CRUD.
 *
 * Reads `Authorization: Bearer <token>` and constant-time compares it
 * against `process.env.SUPERADMIN_TOKEN`. Will be replaced by full
 * nominative auth + RBAC once the admin UI is rewritten on top of
 * `requireSuperadminUser`.
 *
 * - 503 if SUPERADMIN_TOKEN is not configured (fail-closed)
 * - 401 if no Bearer header
 * - 403 on token mismatch
 */
export function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SUPERADMIN_TOKEN;
  if (!expected || expected.length < 16) {
    console.error("[Auth] SUPERADMIN_TOKEN not configured (or too short); admin routes are locked.");
    return res.status(503).json({ error: "Admin not configured" });
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Bearer token required" });
  }

  const provided = header.slice("Bearer ".length).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

// ====================== Nominative auth ======================

/** Reads the nominative session payload, if any. */
export function getUserSession(req: Request): UserSession | null {
  const session = req.session as unknown as { userId?: number; currentTenantId?: number } | undefined;
  if (!session?.userId) return null;
  return { userId: session.userId, currentTenantId: session.currentTenantId };
}

/**
 * `requireUser` — gates a route on a logged-in nominative user.
 * Returns 401 with a stable message if no nominative session is present.
 */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = getUserSession(req);
  if (!u) return res.status(401).json({ error: "Connexion requise" });
  return next();
}

/**
 * `requireSuperadminUser` — gates a route on a logged-in user with
 * `users.isSuperadmin = true`. Distinct from the legacy `requireSuperadmin`
 * (Bearer token), which exists only for the temporary /api/tenants gate.
 *
 * - 401 if no nominative session
 * - 401 if the session points at a deleted/disabled user (clears the session)
 * - 403 if the user is not a superadmin
 */
export async function requireSuperadminUser(req: Request, res: Response, next: NextFunction) {
  const u = getUserSession(req);
  if (!u) return res.status(401).json({ error: "Connexion requise" });
  const user = await userService.getById(u.userId);
  if (!user || !user.isActive) {
    const session = req.session as unknown as { userId?: number };
    delete session.userId;
    return res.status(401).json({ error: "Session invalide" });
  }
  if (!user.isSuperadmin) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  return next();
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireRole` for downstream handlers. */
      userTenantRole?: TenantRole;
    }
  }
}

// ====================== MFA-pending session ======================

interface MfaPendingShape {
  mfaPendingUserId?: number;
  mfaPendingAt?: number;
  mfaPendingId?: string;
}

/** Reads the half-baked (post-password, pre-MFA) session, if any. */
export function getMfaPending(req: Request): MfaPendingSession | null {
  const session = req.session as unknown as MfaPendingShape | undefined;
  if (!session?.mfaPendingUserId || !session.mfaPendingAt || !session.mfaPendingId) {
    return null;
  }
  return {
    userId: session.mfaPendingUserId,
    at: session.mfaPendingAt,
    id: session.mfaPendingId,
  };
}

/** Removes any MFA-pending state from the session. */
export function clearMfaPending(req: Request): void {
  const session = req.session as unknown as MfaPendingShape;
  delete session.mfaPendingUserId;
  delete session.mfaPendingAt;
  delete session.mfaPendingId;
}

/**
 * `requireMfaPending` — gates a route on a half-baked session created
 * by the password-only login step. Distinct from `requireUser` which
 * requires a full nominative session.
 *
 * - 401 if no pending session
 * - 410 (Gone) if the pending state has expired (>MFA_PENDING_TTL_MS)
 *
 * Sets `req.mfaPending` for downstream handlers.
 */
export function requireMfaPending(req: Request, res: Response, next: NextFunction) {
  const pending = getMfaPending(req);
  if (!pending) {
    return res.status(401).json({ error: "Aucune authentification en attente" });
  }
  if (Date.now() - pending.at > MFA_PENDING_TTL_MS) {
    clearMfaPending(req);
    return res.status(410).json({ error: "Session expirée, reconnectez-vous" });
  }
  req.mfaPending = pending;
  return next();
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireMfaPending`. */
      mfaPending?: MfaPendingSession;
    }
  }
}

/**
 * `requireRole(...allowed)` — gates a route on the current user holding
 * one of the listed roles for the current tenant (`req.tenantId`, set
 * by `resolveTenant`). Must run AFTER `resolveTenant` AND `requireUser`.
 *
 * Behaviour:
 *   - 401 if no nominative session (defensive — `requireUser` should
 *     have run already)
 *   - 500 if `req.tenantId` is missing (programming error — middleware
 *     ordering wrong)
 *   - 403 if the user has no role on this tenant, or has a role not in
 *     the allowed list
 *   - calls next() and sets `req.userTenantRole` on success
 */
export function requireRole(...allowed: TenantRole[]) {
  // Validate allowed list at module load (catch typos early).
  for (const r of allowed) {
    if (!TENANT_ROLES.includes(r)) {
      throw new Error(`requireRole: unknown role "${r}"`);
    }
  }
  return async function (req: Request, res: Response, next: NextFunction) {
    const u = getUserSession(req);
    if (!u) return res.status(401).json({ error: "Connexion requise" });
    if (typeof req.tenantId !== "number") {
      console.error("[Auth] requireRole called without resolved tenantId — middleware order bug");
      return res.status(500).json({ error: "Configuration serveur" });
    }
    const role = await userTenantService.getRole(u.userId, req.tenantId);
    if (!role) return res.status(403).json({ error: "Accès interdit à ce tenant" });
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: "Permissions insuffisantes" });
    }
    req.userTenantRole = role;
    return next();
  };
}
