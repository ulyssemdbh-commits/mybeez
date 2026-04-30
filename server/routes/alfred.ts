/**
 * Alfred AI Routes — myBeez
 *
 * POST /api/alfred/chat        — Chat with Alfred
 * POST /api/alfred/analyze     — Analyze today's checklist
 * POST /api/alfred/clear       — Clear conversation history
 */

import type { Express, Request, Response } from "express";
import { alfredService } from "../services/alfred/alfredService";
import { z } from "zod";

/**
 * `tenantId` is preserved as the field name in the API for now to avoid
 * breaking the frontend mid-PR — but it always represents the tenant
 * SLUG (e.g. "valentine"), not a numeric id. The legacy default of
 * "val" was a Valentine-ism and has been removed: callers MUST send a
 * valid slug, the unknown-tenant case returns 404.
 */
const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  tenantId: z.string().min(1),
  context: z
    .object({
      checklist: z.any().optional(),
      stats: z.any().optional(),
    })
    .optional(),
});

const analyzeSchema = z.object({
  tenantId: z.string().min(1),
  categories: z.array(z.any()),
  summary: z.object({
    total: z.number(),
    checked: z.number(),
    unchecked: z.number(),
    uncheckedItems: z.array(z.string()),
  }),
});

const clearSchema = z.object({ tenantId: z.string().min(1) });

function isUnknownTenantError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("Alfred: unknown tenant slug");
}

export function registerAlfredRoutes(app: Express): void {
  app.post("/api/alfred/chat", async (req: Request, res: Response) => {
    try {
      const data = chatSchema.parse(req.body);
      const response = await alfredService.chat(data.tenantId, data.message, data.context);
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

  app.post("/api/alfred/analyze", async (req: Request, res: Response) => {
    try {
      const data = analyzeSchema.parse(req.body);
      const response = await alfredService.analyzeChecklist(
        data.tenantId,
        data.categories,
        data.summary,
      );
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

  app.post("/api/alfred/clear", (req: Request, res: Response) => {
    try {
      const data = clearSchema.parse(req.body);
      alfredService.clearHistory(data.tenantId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("[Alfred] Clear error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
