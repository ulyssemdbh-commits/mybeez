/**
 * Auth Middleware — myBeez
 *
 * PIN-based authentication for restaurant staff tablets.
 * Each restaurant has its own PIN code defined in restaurants.ts config.
 *
 * Sessions are stored server-side via express-session.
 */

import type { Request, Response, NextFunction } from "express";

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
