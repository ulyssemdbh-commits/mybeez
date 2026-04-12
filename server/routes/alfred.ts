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

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  tenantId: z.string().default("val"),
  context: z
    .object({
      checklist: z.any().optional(),
      stats: z.any().optional(),
    })
    .optional(),
});

const analyzeSchema = z.object({
  tenantId: z.string().default("val"),
  categories: z.array(z.any()),
  summary: z.object({
    total: z.number(),
    checked: z.number(),
    unchecked: z.number(),
    uncheckedItems: z.array(z.string()),
  }),
});

export function registerAlfredRoutes(app: Express): void {
  app.post("/api/alfred/chat", async (req: Request, res: Response) => {
    try {
      const data = chatSchema.parse(req.body);
      const response = await alfredService.chat(data.tenantId, data.message, data.context);
      res.json(response);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("[Alfred] Chat error:", error);
      res.status(500).json({ error: "Alfred est temporairement indisponible" });
    }
  });

  app.post("/api/alfred/analyze", async (req: Request, res: Response) => {
    try {
      const data = analyzeSchema.parse(req.body);
      const response = await alfredService.analyzeChecklist(data.tenantId, data.categories, data.summary);
      res.json(response);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error("[Alfred] Analyze error:", error);
      res.status(500).json({ error: "Analyse indisponible" });
    }
  });

  app.post("/api/alfred/clear", (req: Request, res: Response) => {
    const tenantId = req.body?.tenantId || "val";
    alfredService.clearHistory(tenantId);
    res.json({ success: true });
  });
}
