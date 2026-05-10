/**
 * Expenses Routes — back-office gestion (Management).
 *
 * CRUD + stats sur la table `general_expenses`. Mounted at
 * `/api/management/:slug/expenses`.
 *
 * Pattern miroir de `purchases.ts` (les 2 modules vivent côte-à-côte
 * dans la trésorerie : achats fournisseurs vs charges générales).
 *
 * Auth :
 *   - READ : tous les rôles tenant
 *   - WRITE : owner / admin / manager
 *
 * Soft-delete via `isActive` (idem purchases).
 *
 * Filtres GET :
 *   - ?from=YYYY-MM-DD&to=YYYY-MM-DD   bornes `date` (incluses)
 *   - ?supplierId=N                    filtre fournisseur (URSSAF, EDF…)
 *   - ?status=pending|paid|late|cancelled
 *   - ?recurringOnly=true              ne retourne que les dépenses récurrentes
 *   - ?includeInactive=true            inclut les lignes archivées
 */

import type { Express, Request, Response } from "express";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { generalExpenses, suppliers } from "../../../shared/schema/checklist";
import { and, eq, gte, lte, desc, sum, count } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "../../services/auth/auditService";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Expenses");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "late", "cancelled"] as const;
const RECURRING_FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");
const PERIOD_RX = z.string().regex(/^\d{4}(-\d{2})?$/, "Format attendu YYYY ou YYYY-MM");

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const expenseBaseFields = {
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(500),
  amount: z.number().nonnegative(),
  date: ISO_DATE,
  paymentMethod: trimmedString(40),
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(RECURRING_FREQUENCIES).nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  taxAmount: z.number().nonnegative().nullable().optional(),
  dueDate: ISO_DATE.optional().or(z.literal("").transform(() => undefined)),
  invoiceNumber: trimmedString(60),
  period: PERIOD_RX.optional().or(z.literal("").transform(() => undefined)),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paidDate: ISO_DATE.optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createExpenseSchema = z.object(expenseBaseFields);

const updateExpenseSchema = z
  .object({
    ...expenseBaseFields,
    category: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    amount: z.number().nonnegative().optional(),
    date: ISO_DATE.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Aucun champ à mettre à jour" });

const listQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  supplierId: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  recurringOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

void suppliers; // referenced for documentation; supplierId is a logical FK only.

export function registerManagementExpensesRoutes(app: Express): void {
  const r = "/api/management/:slug/expenses";

  // ============================== LIST ==============================
  app.get(
    r,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const filters = listQuerySchema.parse(req.query);

        const conditions = [eq(generalExpenses.tenantId, tid)];
        if (!filters.includeInactive) conditions.push(eq(generalExpenses.isActive, true));
        if (filters.from) conditions.push(gte(generalExpenses.date, filters.from));
        if (filters.to) conditions.push(lte(generalExpenses.date, filters.to));
        if (filters.supplierId) conditions.push(eq(generalExpenses.supplierId, filters.supplierId));
        if (filters.status) conditions.push(eq(generalExpenses.paymentStatus, filters.status));
        if (filters.recurringOnly) conditions.push(eq(generalExpenses.isRecurring, true));

        const rows = await db
          .select()
          .from(generalExpenses)
          .where(and(...conditions))
          .orderBy(desc(generalExpenses.date), desc(generalExpenses.id));

        res.json({ expenses: rows });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        log.error({ err: error }, "List error");
        res.status(500).json({ error: "Erreur de chargement" });
      }
    },
  );

  // ============================== STATS ==============================
  app.get(
    `${r}/stats`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const filters = listQuerySchema.parse(req.query);

        const baseConditions = [eq(generalExpenses.tenantId, tid), eq(generalExpenses.isActive, true)];
        if (filters.from) baseConditions.push(gte(generalExpenses.date, filters.from));
        if (filters.to) baseConditions.push(lte(generalExpenses.date, filters.to));

        const [totalRow] = await db
          .select({
            total: sum(generalExpenses.amount),
            taxTotal: sum(generalExpenses.taxAmount),
            count: count(generalExpenses.id),
          })
          .from(generalExpenses)
          .where(and(...baseConditions));

        const [unpaidRow] = await db
          .select({
            unpaidTotal: sum(generalExpenses.amount),
            unpaidCount: count(generalExpenses.id),
          })
          .from(generalExpenses)
          .where(and(...baseConditions, eq(generalExpenses.paymentStatus, "pending")));

        const [recurringRow] = await db
          .select({
            recurringTotal: sum(generalExpenses.amount),
            recurringCount: count(generalExpenses.id),
          })
          .from(generalExpenses)
          .where(and(...baseConditions, eq(generalExpenses.isRecurring, true)));

        res.json({
          total: Number(totalRow?.total ?? 0),
          taxTotal: Number(totalRow?.taxTotal ?? 0),
          count: Number(totalRow?.count ?? 0),
          unpaidTotal: Number(unpaidRow?.unpaidTotal ?? 0),
          unpaidCount: Number(unpaidRow?.unpaidCount ?? 0),
          recurringTotal: Number(recurringRow?.recurringTotal ?? 0),
          recurringCount: Number(recurringRow?.recurringCount ?? 0),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        log.error({ err: error }, "Stats error");
        res.status(500).json({ error: "Erreur de statistiques" });
      }
    },
  );

  // ============================== GET ONE ==============================
  app.get(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const [row] = await db
          .select()
          .from(generalExpenses)
          .where(and(eq(generalExpenses.id, id), eq(generalExpenses.tenantId, tid)));

        if (!row) return res.status(404).json({ error: "Dépense introuvable" });
        res.json({ expense: row });
      } catch (error) {
        log.error({ err: error }, "Get error");
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

  // ============================== CREATE ==============================
  app.post(
    r,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const data = createExpenseSchema.parse(req.body);

        const [row] = await db
          .insert(generalExpenses)
          .values({
            ...data,
            tenantId: tid,
            supplierId: data.supplierId ?? null,
          })
          .returning();

        void recordAudit({
          req,
          event: "expenses.created",
          metadata: {
            expenseId: row.id,
            amount: row.amount,
            isRecurring: row.isRecurring,
          },
        });
        res.status(201).json({ expense: row });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        log.error({ err: error }, "Create error");
        res.status(500).json({ error: "Erreur de création" });
      }
    },
  );

  // ============================== UPDATE ==============================
  app.patch(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const data = updateExpenseSchema.parse(req.body);

        const [row] = await db
          .update(generalExpenses)
          .set(data)
          .where(and(eq(generalExpenses.id, id), eq(generalExpenses.tenantId, tid)))
          .returning();

        if (!row) return res.status(404).json({ error: "Dépense introuvable" });
        void recordAudit({
          req,
          event: "expenses.updated",
          metadata: { expenseId: row.id, fields: Object.keys(data) },
        });
        res.json({ expense: row });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        log.error({ err: error }, "Update error");
        res.status(500).json({ error: "Erreur de mise à jour" });
      }
    },
  );

  // ============================== DELETE (soft) ==============================
  app.delete(
    `${r}/:id`,
    resolveTenant,
    requireUser,
    requireRole(...WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "ID invalide" });

        const [row] = await db
          .update(generalExpenses)
          .set({ isActive: false })
          .where(and(eq(generalExpenses.id, id), eq(generalExpenses.tenantId, tid)))
          .returning();

        if (!row) return res.status(404).json({ error: "Dépense introuvable" });
        void recordAudit({
          req,
          event: "expenses.archived",
          metadata: { expenseId: row.id },
        });
        res.json({ success: true });
      } catch (error) {
        log.error({ err: error }, "Delete error");
        res.status(500).json({ error: "Erreur de suppression" });
      }
    },
  );
}
