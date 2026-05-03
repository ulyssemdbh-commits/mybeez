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
import { z } from "zod";
import { sql, desc, eq, and, ne } from "drizzle-orm";
import { db } from "../db";
import { users, userTenants, TENANT_ROLES, type TenantRole } from "../../shared/schema/users";
import { tenants } from "../../shared/schema/tenants";
import { businessTemplates } from "../../shared/schema/templates";
import { requireSuperadminUser, getUserSession } from "../middleware/auth";
import { userService, EmailAlreadyExistsError } from "../services/auth/userService";
import { userTenantService } from "../services/auth/userTenantService";
import { sendPasswordResetEmail } from "../services/auth/mailService";
import { PASSWORD_LIMITS } from "../services/auth/passwordService";

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/** Count active superadmins, optionally excluding one user id. */
async function countActiveSuperadmins(excludeUserId?: number): Promise<number> {
  const where = excludeUserId
    ? and(eq(users.isSuperadmin, true), eq(users.isActive, true), ne(users.id, excludeUserId))
    : and(eq(users.isSuperadmin, true), eq(users.isActive, true));
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(where);
  return row.c;
}

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

  // ====================== users — create ======================
  const userCreateSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(PASSWORD_LIMITS.min).max(PASSWORD_LIMITS.max),
    fullName: z.string().min(1).max(120).optional(),
    isSuperadmin: z.boolean().optional(),
  });

  app.post("/api/admin/users", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const data = userCreateSchema.parse(req.body);
      const user = await userService.create({
        email: data.email,
        password: data.password,
        fullName: data.fullName ?? null,
        locale: "fr",
        isSuperadmin: data.isSuperadmin ?? false,
      });
      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isSuperadmin: user.isSuperadmin,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      if (error instanceof EmailAlreadyExistsError) {
        return res.status(409).json({ error: "Cet email est déjà utilisé", field: "email" });
      }
      console.error("[admin] create user error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ====================== users — mutations ======================
  const userPatchSchema = z
    .object({
      isActive: z.boolean().optional(),
      isSuperadmin: z.boolean().optional(),
    })
    .refine((d) => d.isActive !== undefined || d.isSuperadmin !== undefined, {
      message: "Au moins un champ à mettre à jour",
    });

  app.patch("/api/admin/users/:id", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const data = userPatchSchema.parse(req.body);
      const me = getUserSession(req)!;

      const target = await userService.getById(id);
      if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });

      // Self-protection: forbid demoting/disabling yourself.
      if (id === me.userId) {
        if (data.isActive === false || data.isSuperadmin === false) {
          return res.status(400).json({
            error: "Vous ne pouvez pas vous démoter ou vous désactiver vous-même",
          });
        }
      }

      // Last-superadmin guard: refuse if the change would leave 0 active superadmins.
      const wouldRemoveLastSuperadmin =
        target.isSuperadmin &&
        target.isActive &&
        ((data.isSuperadmin === false) || (data.isActive === false));
      if (wouldRemoveLastSuperadmin) {
        const others = await countActiveSuperadmins(id);
        if (others === 0) {
          return res.status(400).json({
            error: "Au moins un super-administrateur actif doit exister",
          });
        }
      }

      await db
        .update(users)
        .set({
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.isSuperadmin !== undefined ? { isSuperadmin: data.isSuperadmin } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[admin] patch user error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.delete("/api/admin/users/:id", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const me = getUserSession(req)!;
      if (id === me.userId) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous supprimer vous-même" });
      }
      const target = await userService.getById(id);
      if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });

      if (target.isSuperadmin && target.isActive) {
        const others = await countActiveSuperadmins(id);
        if (others === 0) {
          return res.status(400).json({
            error: "Au moins un super-administrateur actif doit exister",
          });
        }
      }

      // Cascade FKs handle user_tenants + tokens. user_sessions are pruned naturally.
      await db.delete(users).where(eq(users.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("[admin] delete user error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.post("/api/admin/users/:id/send-reset", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const target = await userService.getById(id);
      if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });
      if (!target.isActive) {
        return res.status(400).json({ error: "Utilisateur désactivé" });
      }

      const token = await userService.issuePasswordResetToken(target.id);
      const resetUrl = `${getAppBaseUrl(req)}/auth/reset?token=${encodeURIComponent(token)}`;
      try {
        await sendPasswordResetEmail({ email: target.email, fullName: target.fullName }, resetUrl);
      } catch (mailErr) {
        console.error("[admin] send-reset email failed:", mailErr);
        return res.status(502).json({ error: "Lien généré mais l'email n'a pas pu être envoyé" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[admin] send-reset error:", error);
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

  // ====================== tenants — mutations ======================
  const tenantPatchSchema = z
    .object({
      isActive: z.boolean().optional(),
      name: z.string().min(1).max(120).optional(),
      templateId: z.number().int().positive().nullable().optional(),
    })
    .refine(
      (d) => d.isActive !== undefined || d.name !== undefined || d.templateId !== undefined,
      { message: "Au moins un champ à mettre à jour" },
    );

  app.patch("/api/admin/tenants/:id", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const data = tenantPatchSchema.parse(req.body);

      const [target] = await db.select().from(tenants).where(eq(tenants.id, id));
      if (!target) return res.status(404).json({ error: "Tenant introuvable" });

      // Validate templateId points to an existing template (when not null).
      if (data.templateId !== undefined && data.templateId !== null) {
        const [tpl] = await db
          .select({ id: businessTemplates.id })
          .from(businessTemplates)
          .where(eq(businessTemplates.id, data.templateId));
        if (!tpl) return res.status(400).json({ error: "Template inconnu" });
      }

      await db
        .update(tenants)
        .set({
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.templateId !== undefined ? { templateId: data.templateId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id));
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[admin] patch tenant error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.delete("/api/admin/tenants/:id", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const [target] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id));
      if (!target) return res.status(404).json({ error: "Tenant introuvable" });

      // Cascade FKs: user_tenants (cascade), tenant_domains, etc.
      await db.delete(tenants).where(eq(tenants.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("[admin] delete tenant error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ====================== tenant detail + members ======================

  app.get("/api/admin/tenants/:id/detail", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const [t] = await db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          shortName: tenants.shortName,
          isActive: tenants.isActive,
          businessType: tenants.businessType,
          templateId: tenants.templateId,
          templateName: businessTemplates.name,
          modulesEnabled: tenants.modulesEnabled,
          email: tenants.email,
          phone: tenants.phone,
          address: tenants.address,
          timezone: tenants.timezone,
          createdAt: tenants.createdAt,
          updatedAt: tenants.updatedAt,
        })
        .from(tenants)
        .leftJoin(businessTemplates, eq(tenants.templateId, businessTemplates.id))
        .where(eq(tenants.id, id));
      if (!t) return res.status(404).json({ error: "Tenant introuvable" });

      const members = await db
        .select({
          userId: users.id,
          email: users.email,
          fullName: users.fullName,
          isActive: users.isActive,
          isSuperadmin: users.isSuperadmin,
          role: userTenants.role,
          invitedAt: userTenants.invitedAt,
          acceptedAt: userTenants.acceptedAt,
        })
        .from(userTenants)
        .innerJoin(users, eq(userTenants.userId, users.id))
        .where(eq(userTenants.tenantId, id))
        .orderBy(users.email);

      res.json({ tenant: t, members });
    } catch (error) {
      console.error("[admin] tenant detail error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  const memberAddSchema = z.object({
    email: z.string().email().max(254),
    role: z.enum(TENANT_ROLES as readonly [TenantRole, ...TenantRole[]]),
  });

  app.post("/api/admin/tenants/:id/members", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const tenantId = Number(req.params.id);
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const data = memberAddSchema.parse(req.body);
      const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
      if (!tenant) return res.status(404).json({ error: "Tenant introuvable" });

      const user = await userService.findByEmail(data.email);
      if (!user) {
        return res.status(404).json({
          error: "Aucun utilisateur avec cet email. Demandez-lui de s'inscrire d'abord, puis réessayez.",
        });
      }
      const me = getUserSession(req)!;
      await userTenantService.upsert(user.id, tenantId, data.role, me.userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[admin] add member error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  const memberPatchSchema = z.object({
    role: z.enum(TENANT_ROLES as readonly [TenantRole, ...TenantRole[]]),
  });

  app.patch("/api/admin/tenants/:id/members/:userId", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const tenantId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(tenantId) || tenantId <= 0 || !Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const data = memberPatchSchema.parse(req.body);
      const existing = await userTenantService.getRole(userId, tenantId);
      if (!existing) return res.status(404).json({ error: "Membre introuvable" });
      await userTenantService.upsert(userId, tenantId, data.role);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[admin] patch member error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.delete("/api/admin/tenants/:id/members/:userId", requireSuperadminUser, async (req: Request, res: Response) => {
    try {
      const tenantId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(tenantId) || tenantId <= 0 || !Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "id invalide" });
      }
      const existing = await userTenantService.getRole(userId, tenantId);
      if (!existing) return res.status(404).json({ error: "Membre introuvable" });
      await userTenantService.remove(userId, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("[admin] delete member error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
