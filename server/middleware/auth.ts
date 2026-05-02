/**
 * Auth Middleware — myBeez
 *
 * Two auth models coexist during the migration window (PR #12):
 *   - PIN session (legacy):    { authenticated, tenantId, role: "staff"|"admin" }
 *   - User session (new):      { userId, currentTenantId? }
 *
 * Both keys can be present at the same time on a single session — they
 * don't conflict. PIN auth will be removed in a cleanup PR once all
 * tenants have nominative Owners.
 *
 * Sessions are stored server-side via express-session (Postgres-backed
 * since PR #11).
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { userTenantService } from "../services/auth/userTenantService";
import { userService } from "../services/auth/userService";
import { TENANT_ROLES, type TenantRole } from "../../shared/schema/users";

export interface AuthSession {
  authenticated: boolean;
  tenantId: string;
  role: "staff" | "admin";
  authenticatedAt: number;
}

/** Shape of the new nominative session payload. */
export interface UserSession {
  userId: number;
  currentTenantId?: number;
}

export function getSessionToken(req: Request): string | null {
  const session = req.session as any;
  return session?.authToken || null;
}

export function getAuthSession(req: Request): AuthSession | null {
  const session = req.session as any;
  if (!session?.authenticated) return null;
  return {
    authenticated: session.authenticated,
    tenantId: session.tenantId || "val",
    role: session.role || "staff",
    authenticatedAt: session.authenticatedAt || 0,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.authenticated) {
    return next();
  }
  return res.status(401).json({ error: "Authentification requise" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.authenticated && session?.role === "admin") {
    return next();
  }
  return res.status(403).json({ error: "Accès administrateur requis" });
}

/**
 * requireSuperadmin — temporary admin gate for /api/tenants CRUD.
 *
 * Reads `Authorization: Bearer <token>` and constant-time compares it
 * against `process.env.SUPERADMIN_TOKEN`. Will be replaced by full
 * nominative auth + RBAC in PR #8-10.
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

/**
 * requireTenantAuth — gate mutating tenant-scoped routes.
 *
 * Requires:
 *   1. an authenticated session (`session.authenticated === true`)
 *   2. that the session's `tenantId` matches the resolved `req.tenantId`
 *      set by `resolveTenant`, unless the session role is `superadmin`.
 *
 * Must run AFTER `resolveTenant` so `req.tenantId` is populated.
 *
 * - 401 if not authenticated
 * - 403 if authenticated for a different tenant
 */
interface TenantSessionLike {
  authenticated?: boolean;
  tenantId?: number;
  role?: string;
}

export function requireTenantAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as unknown as TenantSessionLike | undefined;
  if (!session?.authenticated) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  if (req.tenantId && session.tenantId !== req.tenantId && session.role !== "superadmin") {
    return res.status(403).json({ error: "Accès interdit à ce restaurant" });
  }
  return next();
}

// ====================== Nominative auth (PR #12) ======================

/** Reads the nominative session payload, if any. */
export function getUserSession(req: Request): UserSession | null {
  const session = req.session as unknown as { userId?: number; currentTenantId?: number } | undefined;
  if (!session?.userId) return null;
  return { userId: session.userId, currentTenantId: session.currentTenantId };
}

/**
 * `requireUser` — gates a route on a logged-in nominative user.
 * Distinct from `requireAuth` (PIN session). Returns 401 with a stable
 * message if no nominative session is present.
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
 *
 * `superadmin` users (cross-tenant) bypass the role check (but still
 * require a session — they MUST log in nominatively, the SUPERADMIN_TOKEN
 * Bearer is a separate, deprecated mechanism).
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
