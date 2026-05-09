/**
 * Payroll Routes — fiches de paie. Mounted at
 * `/api/management/:slug/payroll`.
 *
 *   GET    /                  list (filters: ?period=YYYY-MM&employeeId=N)
 *   GET    /:id               detail
 *   POST   /                  create (rejects duplicate employee+month)
 *   PATCH  /:id               update
 *   DELETE /:id               hard-delete (history is in audit_log)
 *
 * Hors scope V1 (cf. PR #72) : import-PDF (parse + auto-create employee
 * + archive in files), reparse-all. La FK `pdfFileId` peut être posée
 * manuellement par PATCH si l'archive vit déjà dans `files`.
 */

import type { Express, Request, Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { payroll } from "../../../shared/schema/checklist";
import { recordAudit } from "../../services/auth/auditService";

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, "Période doit être au format YYYY-MM");

const optNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .optional();

const requiredNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) throw new Error("not a number");
    return n;
  });

const payrollBaseFields = {
  employeeId: z.number().int().positive(),
  month: periodSchema,
  grossSalary: requiredNumber,
  netSalary: requiredNumber,
  socialCharges: optNumber,
  employerCharges: optNumber,
  totalEmployerCost: optNumber,
  bonuses: optNumber,
  overtime: optNumber,
  deductions: optNumber,
  status: z.string().trim().max(40).optional(),
  isPaid: z.boolean().optional(),
  paidDate: z.string().trim().max(40).optional(),
  pdfFileId: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).optional(),
};

const createPayrollSchema = z.object(payrollBaseFields);
const updatePayrollSchema = z
  .object(payrollBaseFields)
  .partial()
  .omit({ employeeId: true, month: true });

const listQuerySchema = z.object({
  period: periodSchema.optional(),
  employeeId: z
    .union([z.string(), z.number()])
    .transform((v) => Number.parseInt(String(v), 10))
    .refine((n) => Number.isFinite(n) && n > 0, "employeeId invalide")
    .optional(),
});

export function registerManagementPayrollRoutes(app: Express): void {
  const r = "/api/management/:slug/payroll";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);
      const conds = [eq(payroll.tenantId, tid)];
      if (q.period) conds.push(eq(payroll.month, q.period));
      if (q.employeeId) conds.push(eq(payroll.employeeId, q.employeeId));
      const rows = await db
        .select()
        .from(payroll)
        .where(and(...conds))
        .orderBy(desc(payroll.month), desc(payroll.id));
      res.json({ payroll: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      console.error("[payroll] list error:", error);
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
        .from(payroll)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      res.json({ payroll: row });
    } catch (error) {
      console.error("[payroll] detail error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== create ==============================
  app.post(r, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const data = createPayrollSchema.parse(req.body);

      try {
        const [row] = await db
          .insert(payroll)
          .values({ ...data, tenantId: tid })
          .returning();

        void recordAudit({
          req,
          event: "payroll.created",
          userId,
          metadata: {
            payrollId: row!.id,
            employeeId: row!.employeeId,
            month: row!.month,
            grossSalary: row!.grossSalary,
          },
        });
        res.status(201).json({ payroll: row });
      } catch (dbErr) {
        // Unique constraint on (tenant, employee, month).
        if (dbErr instanceof Error && /unique|duplicate/i.test(dbErr.message)) {
          return res
            .status(409)
            .json({ error: "Une fiche existe déjà pour cet employé et ce mois" });
        }
        throw dbErr;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[payroll] create error:", error);
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
      const data = updatePayrollSchema.parse(req.body);

      const [row] = await db
        .update(payroll)
        .set(data)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      void recordAudit({
        req,
        event: "payroll.updated",
        userId,
        metadata: { payrollId: row.id, fields: Object.keys(data) },
      });
      res.json({ payroll: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      console.error("[payroll] update error:", error);
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
        .delete(payroll)
        .where(and(eq(payroll.tenantId, tid), eq(payroll.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Fiche introuvable" });
      void recordAudit({
        req,
        event: "payroll.deleted",
        userId,
        metadata: { payrollId: row.id, employeeId: row.employeeId, month: row.month },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("[payroll] delete error:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });
}
