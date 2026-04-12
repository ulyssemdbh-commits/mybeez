/**
 * Auth Routes — myBeez
 *
 * POST /api/auth/pin-login  — Authenticate with PIN code
 * POST /api/auth/logout     — Destroy session
 * GET  /api/auth/me         — Get current session info
 */

import type { Express, Request, Response } from "express";
import { authService } from "../services/auth";
import { z } from "zod";

const pinSchema = z.object({
  pin: z.string().min(4).max(6),
  tenant: z.string().optional(),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/pin-login", async (req: Request, res: Response) => {
    try {
      const data = pinSchema.parse(req.body);
      const result = await authService.loginWithPin(data.pin, data.tenant);

      if (!result.success) {
        return res.status(401).json({ error: result.error || "Code incorrect" });
      }

      const session = req.session as any;
      session.authenticated = true;
      session.tenantId = result.tenantId;
      session.role = result.role;
      session.restaurantName = result.restaurantName;
      session.authenticatedAt = Date.now();
      session.authToken = `mybeez-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      res.json({
        success: true,
        tenantId: result.tenantId,
        role: result.role,
        restaurantName: result.restaurantName,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Code PIN invalide" });
      }
      console.error("[Auth] Login error:", error);
      res.status(500).json({ error: "Erreur d'authentification" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Erreur de déconnexion" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    const session = req.session as any;
    if (!session?.authenticated) {
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      tenantId: session.tenantId,
      role: session.role,
      restaurantName: session.restaurantName,
    });
  });
}
