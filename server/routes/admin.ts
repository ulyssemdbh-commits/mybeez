/**
 * Master admin routes — gated on `users.isSuperadmin = true`.
 *
 * All endpoints require a NOMINATIVE session belonging to a superadmin.
 * Powering the `/123admin` page on the SPA. Read-only for now; mutating
 * actions (toggle active, promote, delete tenant) land in a follow-up.
 *
 * Endpoints:
 *   GET /api/admin/me       — current superadmin's profile
 *   GET /api/admin/stats    — counts (users, tenants, etc.)
 *   GET /api/admin/users    — full user list with tenant counts
 *   GET /api/admin/tenants  — full tenant list with template + member count
 */

import type { Express, Request, Response } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { users, userTenants } from "../../shared/schema/users";
import { tenants } from "../../shared/schema/tenants";
import { businessTemplates } from "../../shared/schema/templates";
import { requireSuperadminUser, getUserSession } from "../middleware/auth";
import { userService } from "../services/auth/userService";

export function registerAdminRoutes(app: Express): void {
  // ============================== me ==============================
  app.get("/api/admin/me", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const u = getUserSession(req)!;
      const user = await userService.getById(u.userId);
      if (!user) return res.status(401).json({ error: "Session invalide" });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isSuperadmin: user.isSuperadmin,
        },
      });
    } catch (error) {
      console.error("[admin] me error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== stats ==============================
  app.get("/api/admin/stats", requireSuperadminUser, async (_req: Request, res: Response) => {
    try {
      const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
      const [activeUserCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.isActive, true));
      const [verifiedUserCount] = await db
        .select({ c: sql<number>`count(*) filter (where ${users.emailVerifiedAt} is not null)::int` })
        .from(users);
      const [tenantCount] = await db.select({ c: sql<number>`count(*)::int` }).from(tenants);
      const [activeTenantCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tenants)
        .where(eq(tenants.isActive, true));
      const [templateCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(businessTemplates);
      res.json({
        users: { total: userCount.c, active: activeUserCount.c, verified: verifiedUserCount.c },
        tenants: { total: tenantCount.c, active: activeTenantCount.c },
        templates: { total: templateCount.c },
      });
    } catch (error) {
      console.error("[admin] stats error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== users ==============================
  app.get("/api/admin/users", requireSuperadminUser, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          isSuperadmin: users.isSuperadmin,
          isActive: users.isActive,
          emailVerifiedAt: users.emailVerifiedAt,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          tenantCount: sql<number>`(select count(*)::int from ${userTenants} ut where ut.user_id = ${users.id})`,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      res.json({ users: rows });
    } catch (error) {
      console.error("[admin] users error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== tenants ==============================
  app.get("/api/admin/tenants", requireSuperadminUser, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          isActive: tenants.isActive,
          businessType: tenants.businessType,
          templateId: tenants.templateId,
          templateName: businessTemplates.name,
          createdAt: tenants.createdAt,
          memberCount: sql<number>`(select count(*)::int from ${userTenants} ut where ut.tenant_id = ${tenants.id})`,
        })
        .from(tenants)
        .leftJoin(businessTemplates, eq(tenants.templateId, businessTemplates.id))
        .orderBy(desc(tenants.createdAt));
      res.json({ tenants: rows });
    } catch (error) {
      console.error("[admin] tenants error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
