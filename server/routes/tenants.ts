/**
 * Tenant Admin Routes — myBeez
 *
 * All endpoints here are gated behind `requireSuperadmin` (Bearer token
 * via SUPERADMIN_TOKEN env). This is a TEMPORARY mechanism that will be
 * replaced by nominative accounts + RBAC in PR #8-10.
 *
 * POST  /api/tenants          — Create a new tenant
 * GET   /api/tenants          — List all tenants
 * PATCH /api/tenants/:id      — Update tenant
 *
 * The previous public `GET /api/tenants/by-code/:code` was removed: it
 * returned the full tenant record including PIN/admin codes, which was
 * brute-forçable through the 8-digit client code.
 */

import type { Express, Request, Response } from "express";
import { tenantService } from "../services/tenantService";
import { insertTenantSchema } from "../../shared/schema/tenants";
import { requireSuperadmin } from "../middleware/auth";
import { z } from "zod";

const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    shortName: z.string().max(50).nullable().optional(),
    templateId: z.number().int().positive().optional(),
    businessType: z.string().max(50).optional(),
    vocabulary: z.record(z.string(), z.string()).optional(),
    modulesEnabled: z.array(z.string()).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    address: z.string().max(255).nullable().optional(),
    timezone: z.string().max(50).optional(),
    isActive: z.boolean().optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    theme: z.record(z.string(), z.unknown()).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export function registerTenantRoutes(app: Express): void {
  app.post("/api/tenants", requireSuperadmin, async (req: Request, res: Response) => {
    try {
      const data = insertTenantSchema.parse(req.body);
      const tenant = await tenantService.create(data);
      res.status(201).json({
        id: tenant.id,
        clientCode: tenant.clientCode,
        slug: tenant.slug,
        name: tenant.name,
        url: `/${tenant.slug}`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      const message = error instanceof Error ? error.message : "";
      if (message.includes("unique")) {
        return res.status(409).json({ error: "Un restaurant avec ce nom ou slug existe déjà" });
      }
      console.error("[Tenants] Create error:", error);
      res.status(500).json({ error: "Erreur de création" });
    }
  });

  app.get("/api/tenants", requireSuperadmin, async (_req: Request, res: Response) => {
    try {
      const list = await tenantService.listAll();
      res.json(
        list.map((t) => ({
          id: t.id,
          clientCode: t.clientCode,
          slug: t.slug,
          name: t.name,
          shortName: t.shortName,
          businessType: t.businessType,
          isActive: t.isActive,
          url: `/${t.slug}`,
          createdAt: t.createdAt,
        })),
      );
    } catch (error) {
      console.error("[Tenants] List error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.patch("/api/tenants/:id", requireSuperadmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const data = updateTenantSchema.parse(req.body);
      const tenant = await tenantService.update(id, data);
      if (!tenant) return res.status(404).json({ error: "Client non trouvé" });
      res.json(tenant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[Tenants] Update error:", error);
      res.status(500).json({ error: "Erreur de mise à jour" });
    }
  });
}
