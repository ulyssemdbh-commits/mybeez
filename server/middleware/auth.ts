/**
 * Auth Middleware — myBeez
 *
 * PIN-based authentication for restaurant staff tablets.
 * Each restaurant has its own PIN code defined in restaurants.ts config.
 *
 * Sessions are stored server-side via express-session.
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export interface AuthSession {
  authenticated: boolean;
  tenantId: string;
  role: "staff" | "admin";
  authenticatedAt: number;
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
