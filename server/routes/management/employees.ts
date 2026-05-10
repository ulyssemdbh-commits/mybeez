/**
 * Employees Routes — back-office RH (Management).
 *
 * Mounted at `/api/management/:slug/employees`.
 *
 *   GET    /                  list (filter `?activeOnly=true`)
 *   GET    /summary           aggregated stats for the RH dashboard
 *   GET    /:id               detail
 *   POST   /                  create
 *   PATCH  /:id               update
 *   DELETE /:id               soft-delete (isActive=false)
 *
 * Auth :
 *   - READ : owner | admin | manager | staff | viewer
 *   - WRITE : owner | admin | manager
 *
 * Hors scope V1 : import-PDF bulletin, reparse-all, send-email-bulk
 * (cf. PR #71 / #72 V2).
 */

import type { Express, Request, Response } from "express";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { employees, payroll, absences } from "../../../shared/schema/checklist";
import { recordAudit } from "../../services/auth/auditService";
import {
  computePayrollSummary,
  DEFAULT_EMPLOYER_CHARGE_RATE,
} from "../../services/hr/payrollSummary";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Employees");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

const CONTRACT_TYPES = ["CDI", "CDD", "Interim", "Apprentissage", "Stage", "Extra"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const optTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .optional();

const employeeBaseFields = {
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  position: optTrimmedString(120),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  startDate: optTrimmedString(40),
  endDate: optTrimmedString(40),
  phone: optTrimmedString(40),
  email: z
    .union([z.literal(""), z.string().email().max(200)])
    .optional()
    .transform((v) => (v ? v : undefined)),
  socialSecurityNumber: optTrimmedString(40),
  salary: optNumber,
  hourlyRate: optNumber,
  weeklyHours: optNumber,
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createEmployeeSchema = z.object(employeeBaseFields);
const updateEmployeeSchema = z
  .object({ ...employeeBaseFields, isActive: z.boolean().optional() })
  .partial();

const summaryQuerySchema = z.object({
  /** Optional period filter `YYYY-MM` to restrict the payroll/absence aggregation. */
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  employerChargeRate: optNumber,
});

export function registerManagementEmployeesRoutes(app: Express): void {
  const r = "/api/management/:slug/employees";

  // ============================== summary ==============================
  // Mounted BEFORE /:id so "summary" is not parsed as an id.
  app.get(`${r}/summary`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = summaryQuerySchema.parse(req.query);

      const [emps, prRows, absRows] = await Promise.all([
        db.select().from(employees).where(eq(employees.tenantId, tid)),
        db.select().from(payroll).where(eq(payroll.tenantId, tid)),
        db.select().from(absences).where(eq(absences.tenantId, tid)),
      ]);

      const scopedPayrolls = q.period ? prRows.filter((p) => p.month === q.period) : prRows;
      const summary = computePayrollSummary(
        emps,
        scopedPayrolls,
        absRows,
        q.employerChargeRate ?? DEFAULT_EMPLOYER_CHARGE_RATE,
      );

      res.json(summary);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "summary error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const activeOnly = req.query.activeOnly === "true";
      const conds = [eq(employees.tenantId, tid)];
      if (activeOnly) conds.push(eq(employees.isActive, true));
      const rows = await db
        .select()
        .from(employees)
        .where(and(...conds))
        .orderBy(asc(employees.lastName), asc(employees.firstName));
      res.json({ employees: rows });
    } catch (error) {
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
        .from(employees)
        .where(and(eq(employees.tenantId, tid), eq(employees.id, id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Employé introuvable" });
      res.json({ employee: row });
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
      const data = createEmployeeSchema.parse(req.body);

      const [row] = await db
        .insert(employees)
        .values({ ...data, tenantId: tid })
        .returning();

      void recordAudit({
        req,
        event: "employees.created",
        userId,
        metadata: { employeeId: row!.id, name: `${row!.firstName} ${row!.lastName}` },
      });
      res.status(201).json({ employee: row });
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
      const data = updateEmployeeSchema.parse(req.body);

      const [row] = await db
        .update(employees)
        .set(data)
        .where(and(eq(employees.tenantId, tid), eq(employees.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Employé introuvable" });
      void recordAudit({
        req,
        event: "employees.updated",
        userId,
        metadata: { employeeId: row.id, fields: Object.keys(data) },
      });
      res.json({ employee: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "update error");
      res.status(500).json({ error: "Erreur de mise à jour" });
    }
  });

  // ============================== soft-delete ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .update(employees)
        .set({ isActive: false })
        .where(and(eq(employees.tenantId, tid), eq(employees.id, id)))
        .returning();

      if (!row) return res.status(404).json({ error: "Employé introuvable" });
      void recordAudit({
        req,
        event: "employees.archived",
        userId,
        metadata: { employeeId: row.id, name: `${row.firstName} ${row.lastName}` },
      });
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, "delete error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
