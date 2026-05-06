/**
 * Tenant template — back-office gestion (Management).
 *
 * Routes pour consulter et changer le `business_template` associé au
 * tenant courant. Mounted at `/api/management/:slug/template`.
 *
 * Auth model :
 *   - GET   : tous les rôles tenant (read-only)
 *   - PATCH : owner / admin uniquement (changement structurel)
 *
 * La PATCH ne change que `tenant.templateId` ; les champs custom du
 * tenant (`vocabulary`, `modulesEnabled`) sont préservés. Si l'admin
 * souhaite repartir des défauts du nouveau template, il devra
 * explicitement réinitialiser ces champs (PR ultérieure).
 *
 * Validation : le templateId doit pointer sur un sub-template (un
 * top-level n'est pas un choix valide). Cohérent avec la règle du
 * signup (`onboarding.ts`).
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { tenants } from "../../../shared/schema/tenants";
import { businessTemplates } from "../../../shared/schema/templates";
import { tenantService } from "../../services/tenantService";
import { templateService } from "../../services/templateService";

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin"] as const;

const updateSchema = z.object({
  templateId: z.number().int().positive(),
});

export function registerManagementTemplateRoutes(app: Express): void {
  const r = "/api/management/:slug/template";

  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const tenant = req.tenant!;
      const current = tenant.templateId
        ? await templateService.getById(tenant.templateId)
        : null;
      let parent = null;
      if (current && current.parentId !== null) {
        parent = await templateService.getById(current.parentId);
      }
      void tid;
      res.json({
        current: current ?? null,
        parent: parent ?? null,
      });
    } catch (error) {
      console.error("[Templates] Get tenant template error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.patch(r, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const data = updateSchema.parse(req.body);

      // Validate the target template: must exist AND must be a sub-template.
      const [target] = await db
        .select({
          id: businessTemplates.id,
          parentId: businessTemplates.parentId,
          slug: businessTemplates.slug,
          isActive: businessTemplates.isActive,
        })
        .from(businessTemplates)
        .where(eq(businessTemplates.id, data.templateId));

      if (!target) {
        return res.status(404).json({ error: "Template inconnu" });
      }
      if (!target.isActive) {
        return res.status(400).json({ error: "Template désactivé" });
      }
      if (target.parentId === null) {
        return res.status(400).json({ error: "Choisissez un sous-type d'activité, pas un vertical entier" });
      }

      const [updated] = await db
        .update(tenants)
        .set({ templateId: data.templateId, updatedAt: new Date() })
        .where(eq(tenants.id, tid))
        .returning();

      if (!updated) return res.status(404).json({ error: "Tenant introuvable" });
      tenantService.clearCache();

      const newCurrent = await templateService.getById(data.templateId);
      const newParent = newCurrent?.parentId
        ? await templateService.getById(newCurrent.parentId)
        : null;

      res.json({
        current: newCurrent ?? null,
        parent: newParent ?? null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[Templates] Update tenant template error:", error);
      res.status(500).json({ error: "Erreur de mise à jour" });
    }
  });
}
