/**
 * Alfred AI Routes — myBeez
 *
 * POST /api/alfred/:slug/chat     — Chat with Alfred
 * POST /api/alfred/:slug/analyze  — Analyze today's checklist
 * POST /api/alfred/:slug/clear    — Clear conversation history
 *
 * Tenant resolved by :slug (or host) via `resolveTenant`. Auth gates :
 *   - `requireUser` : nominative session
 *   - `requireRole` : any tenant role (read-side feature ; even a viewer
 *     can talk to Alfred about their own data)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { alfredService } from "../services/alfred/alfredService";
import { resolveTenant } from "../middleware/tenant";
import { requireUser, requireRole } from "../middleware/auth";

const ALFRED_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z
    .object({
      checklist: z.any().optional(),
      stats: z.any().optional(),
    })
    .optional(),
});

const analyzeSchema = z.object({
  categories: z.array(z.any()),
  summary: z.object({
    total: z.number(),
    checked: z.number(),
    unchecked: z.number(),
    uncheckedItems: z.array(z.string()),
  }),
});

function isUnknownTenantError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("Alfred: unknown tenant slug");
}

export function registerAlfredRoutes(app: Express): void {
  const r = "/api/alfred/:slug";

  app.post(`${r}/chat`, resolveTenant, requireUser, requireRole(...ALFRED_ROLES), async (req: Request, res: Response) => {
    try {
      const data = chatSchema.parse(req.body);
      const slug = req.tenant!.slug;
      const response = await alfredService.chat(slug, data.message, data.context);
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      if (isUnknownTenantError(error)) {
        return res.status(404).json({ error: "Tenant inconnu" });
      }
      console.error("[Alfred] Chat error:", error);
      res.status(500).json({ error: "Alfred est temporairement indisponible" });
    }
  });

  app.post(`${r}/analyze`, resolveTenant, requireUser, requireRole(...ALFRED_ROLES), async (req: Request, res: Response) => {
    try {
      const data = analyzeSchema.parse(req.body);
      const slug = req.tenant!.slug;
      const response = await alfredService.analyzeChecklist(slug, data.categories, data.summary);
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      if (isUnknownTenantError(error)) {
        return res.status(404).json({ error: "Tenant inconnu" });
      }
      console.error("[Alfred] Analyze error:", error);
      res.status(500).json({ error: "Analyse indisponible" });
    }
  });

  app.post(`${r}/clear`, resolveTenant, requireUser, requireRole(...ALFRED_ROLES), (req: Request, res: Response) => {
    try {
      alfredService.clearHistory(req.tenant!.slug);
      res.json({ success: true });
    } catch (error) {
      console.error("[Alfred] Clear error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
