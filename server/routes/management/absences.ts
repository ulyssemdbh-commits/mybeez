/**
 * Absences Routes — congés/maladie/retards. Mounted at
 * `/api/management/:slug/absences`.
 *
 *   GET    /                  list (filters: ?employeeId=N&from=YYYY-MM-DD&to=...)
 *   GET    /:id               detail
 *   POST   /                  create
 *   PATCH  /:id               update (notamment isApproved)
 *   DELETE /:id               hard-delete
 *
 * `isApproved=false` rows are the "Alertes" counter on the RH dashboard
 * (cf. `computePayrollSummary.pendingAbsenceAlerts`).
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { absences } from "../../../shared/schema/checklist";
import { recordAudit } from "../../services/auth/auditService";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Absences");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

const ABSENCE_TYPES = ["conge", "maladie", "retard", "absence", "formation"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const optNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .optional();

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date doit être YYYY-MM-DD");

const absenceBaseFields = {
  employeeId: z.number().int().positive(),
  type: z.enum(ABSENCE_TYPES),
  startDate: dateString,
  endDate: dateString.optional(),
  duration: optNumber,
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.string().trim().max(40).optional(),
  isApproved: z.boolean().optional(),
};

const createAbsenceSchema = z.object(absenceBaseFields);
const updateAbsenceSchema = z
  .object(absenceBaseFields)
  .partial()
  .omit({ employeeId: true });

const listQuerySchema = z.object({
  employeeId: z
    .union([z.string(), z.number()])
    .transform((v) => Number.parseInt(String(v), 10))
    .refine((n) => Number.isFinite(n) && n > 0)
    .optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export function registerManagementAbsencesRoutes(app: Express): void {
  const r = "/api/management/:slug/absences";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);
      const conds = [eq(absences.tenantId, tid)];
      if (q.employeeId) conds.push(eq(absences.employeeId, q.employeeId));
      if (q.from) conds.push(gte(absences.startDate, q.from));
      if (q.to) conds.push(lte(absences.startDate, q.to));
      const rows = await db
        .select()
        .from(absences)
        .where(and(...conds))
        .orderBy(desc(absences.startDate));
      res.json({ absences: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "list error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== detail ==============================
  app.get(`${r}/:id`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });
      const [row] = await db
        .select()
        .from(absences)
        .where(and(eq(absences.tenantId, tid), eq(absences.id, id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Absence introuvable" });
      res.json({ absence: row });
    } catch (error) {
      log.error({ err: error }, "detail error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== create ==============================
  app.post(r, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const data = createAbsenceSchema.parse(req.body);

      const [row] = await db
        .insert(absences)
        .values({ ...data, tenantId: tid })
        .returning();

      void recordAudit({
        req,
        event: "absences.created",
        userId,
        metadata: {
          absenceId: row!.id,
          employeeId: row!.employeeId,
          type: row!.type,
          startDate: row!.startDate,
        },
      });
      res.status(201).json({ absence: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "create error");
      res.status(500).json({ error: "Erreur de création" });
    }
  });

  // ============================== update ==============================
  app.patch(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });
      const data = updateAbsenceSchema.parse(req.body);

      const [row] = await db
        .update(absences)
        .set(data)
        .where(and(eq(absences.tenantId, tid), eq(absences.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Absence introuvable" });
      void recordAudit({
        req,
        event: "absences.updated",
        userId,
        metadata: { absenceId: row.id, fields: Object.keys(data) },
      });
      res.json({ absence: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "update error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== delete ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .delete(absences)
        .where(and(eq(absences.tenantId, tid), eq(absences.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Absence introuvable" });
      void recordAudit({
        req,
        event: "absences.deleted",
        userId,
        metadata: { absenceId: row.id, employeeId: row.employeeId, type: row.type },
      });
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, "delete error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
