/**
 * Tenant settings — back-office gestion (Management).
 *
 * Routes pour customiser un tenant au-delà du template choisi :
 *   - PATCH /api/management/:slug/vocabulary — overrides UI labels
 *   - PATCH /api/management/:slug/modules — toggle des modules métier
 *
 * Les deux ne touchent QUE le tenant courant (zéro effet sur le
 * template parent). Les valeurs « à blanc » (vocabulary clé vide ou
 * undefined) reviennent au défaut hérité du template / au fallback
 * neutre côté Alfred.
 *
 * Auth : owner / admin uniquement (changement structurel).
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { tenants } from "../../../shared/schema/tenants";
import { tenantService } from "../../services/tenantService";
import { recordAudit } from "../../services/auth/auditService";
import {
  MODULE_SLUGS,
  MODULE_CATALOG,
  VOCABULARY_KEYS,
} from "../../../shared/modules";

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin"] as const;

const VOCABULARY_VALUE = z
  .string()
  .trim()
  .min(0)
  .max(40)
  .transform((v) => (v.length === 0 ? undefined : v));

const vocabularySchema = z.object({
  vocabulary: z.object(
    Object.fromEntries(VOCABULARY_KEYS.map((k) => [k, VOCABULARY_VALUE.optional()])) as Record<
      (typeof VOCABULARY_KEYS)[number],
      z.ZodOptional<typeof VOCABULARY_VALUE>
    >,
  ),
});

const modulesSchema = z.object({
  modulesEnabled: z
    .array(z.enum(MODULE_SLUGS as [string, ...string[]]))
    .max(MODULE_SLUGS.length),
});

export function registerManagementSettingsRoutes(app: Express): void {
  app.get(
    "/api/management/:slug/settings",
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tenant = req.tenant!;
        res.json({
          vocabulary: tenant.vocabulary ?? {},
          modulesEnabled: tenant.modulesEnabled ?? [],
        });
      } catch (error) {
        console.error("[Settings] Get error:", error);
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

  app.patch(
    "/api/management/:slug/vocabulary",
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const { vocabulary } = vocabularySchema.parse(req.body);

        // Build a clean record dropping undefined → keep jsonb minimal.
        const clean: Record<string, string> = {};
        for (const k of VOCABULARY_KEYS) {
          const v = (vocabulary as Record<string, string | undefined>)[k];
          if (v !== undefined) clean[k] = v;
        }

        const [updated] = await db
          .update(tenants)
          .set({ vocabulary: clean, updatedAt: new Date() })
          .where(eq(tenants.id, tid))
          .returning();

        if (!updated) return res.status(404).json({ error: "Tenant introuvable" });
        tenantService.clearCache();
        void recordAudit({
          req,
          event: "tenant.vocabulary.changed",
          metadata: { keys: Object.keys(clean) },
        });
        res.json({ vocabulary: updated.vocabulary });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        console.error("[Settings] Update vocabulary error:", error);
        res.status(500).json({ error: "Erreur de mise à jour" });
      }
    },
  );

  app.patch(
    "/api/management/:slug/modules",
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const { modulesEnabled } = modulesSchema.parse(req.body);

        // Required modules MUST stay enabled — defensive even if the UI
        // hides their checkbox.
        const required = MODULE_CATALOG.filter((m) => m.required).map((m) => m.slug);
        const final = Array.from(
          new Set([...modulesEnabled, ...required]),
        ).sort();

        // Implemented = false modules can be enabled (the UI gates this
        // visually) but we don't reject — gives the admin space to
        // pre-enable a module before its code lands.
        const [updated] = await db
          .update(tenants)
          .set({ modulesEnabled: final, updatedAt: new Date() })
          .where(eq(tenants.id, tid))
          .returning();

        if (!updated) return res.status(404).json({ error: "Tenant introuvable" });
        tenantService.clearCache();
        void recordAudit({
          req,
          event: "tenant.modules.changed",
          metadata: { modulesEnabled: final },
        });
        res.json({ modulesEnabled: updated.modulesEnabled });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        console.error("[Settings] Update modules error:", error);
        res.status(500).json({ error: "Erreur de mise à jour" });
      }
    },
  );
}
