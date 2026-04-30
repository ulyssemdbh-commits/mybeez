/**
 * Public templates API.
 *
 * Read-only, no auth: this catalog feeds the (future) signup picker
 * and the marketing site, both of which are pre-login surfaces. The
 * data exposed is intentionally non-sensitive (catalog of business
 * archetypes + their default config).
 *
 * Endpoints:
 *   GET /api/templates            -> tree (top-level + children)
 *   GET /api/templates/:slug      -> single template
 */

import type { Express, Request, Response } from "express";
import { templateService } from "../services/templateService";

export function registerTemplateRoutes(app: Express): void {
  app.get("/api/templates", async (_req: Request, res: Response) => {
    try {
      const tree = await templateService.listTree();
      res.json({ templates: tree });
    } catch (error) {
      console.error("[Templates] List error:", error);
      res.status(500).json({ error: "Erreur de chargement" });
    }
  });

  app.get("/api/templates/:slug", async (req: Request, res: Response) => {
    try {
      const t = await templateService.getBySlug(req.params.slug);
      if (!t) return res.status(404).json({ error: "Template inconnu" });
      const children =
        t.parentId === null ? await templateService.listChildren(t.id) : [];
      res.json({ template: t, children });
    } catch (error) {
      console.error("[Templates] Get error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
