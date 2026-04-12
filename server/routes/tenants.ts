/**
 * Tenant Admin Routes — myBeez
 *
 * POST /api/tenants          — Create a new tenant
 * GET  /api/tenants          — List all tenants
 * GET  /api/tenants/:code    — Get tenant by client code
 * PATCH /api/tenants/:id     — Update tenant
 */

import type { Express, Request, Response } from "express";
import { tenantService } from "../services/tenantService";
import { insertTenantSchema } from "../../shared/schema/tenants";
import { z } from "zod";

export function registerTenantRoutes(app: Express): void {
  app.post("/api/tenants", async (req: Request, res: Response) => {
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
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      if (error.message?.includes("unique")) {
        return res.status(409).json({ error: "Un restaurant avec ce nom ou slug existe déjà" });
      }
      console.error("[Tenants] Create error:", error);
      res.status(500).json({ error: "Erreur de création" });
    }
  });

  app.get("/api/tenants", async (_req: Request, res: Response) => {
    try {
      const list = await tenantService.listAll();
      res.json(list.map((t) => ({
        id: t.id,
        clientCode: t.clientCode,
        slug: t.slug,
        name: t.name,
        shortName: t.shortName,
        businessType: t.businessType,
        isActive: t.isActive,
        url: `/${t.slug}`,
        createdAt: t.createdAt,
      })));
    } catch (error) {
      console.error("[Tenants] List error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.get("/api/tenants/by-code/:code", async (req: Request, res: Response) => {
    try {
      const tenant = await tenantService.getByClientCode(req.params.code);
      if (!tenant) return res.status(404).json({ error: "Client non trouvé" });
      res.json(tenant);
    } catch (error) {
      console.error("[Tenants] Get error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  app.patch("/api/tenants/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "ID invalide" });

      const tenant = await tenantService.update(id, req.body);
      if (!tenant) return res.status(404).json({ error: "Client non trouvé" });
      res.json(tenant);
    } catch (error) {
      console.error("[Tenants] Update error:", error);
      res.status(500).json({ error: "Erreur de mise à jour" });
    }
  });
}
