/**
 * Bank Entries Routes — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/bank-entries`.
 *
 *   GET    /                  list (filters: from, to, accountId, category, reconciled)
 *   GET    /stats             period totals over the same filter set
 *   GET    /unreconciled      shortcut for `?reconciled=false`
 *   GET    /:id               detail
 *   POST   /                  create
 *   PATCH  /:id               update
 *   DELETE /:id               hard-delete (audit trail in audit_log)
 *
 * Hard-delete (no soft) : an erroneous bank entry should disappear; the
 * audit_log keeps the trace. Differs from purchases / suppliers which
 * are soft-deleted because they're referenced from many other surfaces.
 *
 * Sprint 5 module métier (PR #83).
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { bankEntries, bankAccounts } from "../../../shared/schema/finance";
import { recordAudit } from "../../services/auth/auditService";
import { computeBankStats } from "../../services/finance/financeSummary";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("BankEntries");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");
const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const baseFields = {
  bankAccountId: z.number().int().positive(),
  entryDate: ISO_DATE,
  label: z.string().trim().min(1).max(300),
  amount: z.number().finite(),
  balance: z.number().finite().nullable().optional(),
  category: trimmed(60),
  reference: trimmed(120),
  isReconciled: z.boolean().optional(),
  purchaseId: z.number().int().positive().nullable().optional(),
  expenseId: z.number().int().positive().nullable().optional(),
  payrollId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createSchema = z.object(baseFields);
const updateSchema = z
  .object({
    ...baseFields,
    bankAccountId: z.number().int().positive().optional(),
    entryDate: ISO_DATE.optional(),
    label: z.string().trim().min(1).max(300).optional(),
    amount: z.number().finite().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucun champ à mettre à jour" });

const listQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  accountId: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .optional(),
  category: z.string().trim().max(60).optional(),
  reconciled: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

type ListFilters = z.infer<typeof listQuerySchema>;

function buildEntryConditions(tenantId: number, f: ListFilters) {
  const conds = [eq(bankEntries.tenantId, tenantId)];
  if (f.from) conds.push(gte(bankEntries.entryDate, f.from));
  if (f.to) conds.push(lte(bankEntries.entryDate, f.to));
  if (f.accountId !== undefined) conds.push(eq(bankEntries.bankAccountId, f.accountId));
  if (f.category) conds.push(eq(bankEntries.category, f.category));
  if (f.reconciled !== undefined) conds.push(eq(bankEntries.isReconciled, f.reconciled));
  return conds;
}

/** Verifies the bank account belongs to the tenant. Returns the row or null. */
async function findAccount(tenantId: number, accountId: number) {
  const [row] = await db
    .select({ id: bankAccounts.id, isActive: bankAccounts.isActive })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.tenantId, tenantId), eq(bankAccounts.id, accountId)))
    .limit(1);
  return row ?? null;
}

export function registerBankEntriesRoutes(app: Express): void {
  const r = "/api/management/:slug/bank-entries";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const f = listQuerySchema.parse(req.query);
      const rows = await db
        .select()
        .from(bankEntries)
        .where(and(...buildEntryConditions(tid, f)))
        .orderBy(desc(bankEntries.entryDate), desc(bankEntries.id));
      res.json({ entries: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "list error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== stats ==============================
  app.get(`${r}/stats`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const f = listQuerySchema.parse(req.query);
      const rows = await db
        .select({ amount: bankEntries.amount, isReconciled: bankEntries.isReconciled })
        .from(bankEntries)
        .where(and(...buildEntryConditions(tid, f)));
      res.json(computeBankStats(rows));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "stats error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== unreconciled (shortcut) ==============================
  app.get(`${r}/unreconciled`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const rows = await db
        .select()
        .from(bankEntries)
        .where(and(eq(bankEntries.tenantId, tid), eq(bankEntries.isReconciled, false)))
        .orderBy(desc(bankEntries.entryDate), desc(bankEntries.id));
      res.json({ entries: rows });
    } catch (error) {
      log.error({ err: error }, "unreconciled error");
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
        .from(bankEntries)
        .where(and(eq(bankEntries.tenantId, tid), eq(bankEntries.id, id)))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Entrée introuvable" });
      res.json({ entry: row });
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
      const data = createSchema.parse(req.body);

      // Cross-tenant guard : the bank account must belong to this tenant.
      const account = await findAccount(tid, data.bankAccountId);
      if (!account) {
        return res.status(400).json({ error: "Compte bancaire introuvable" });
      }

      const [row] = await db
        .insert(bankEntries)
        .values({
          tenantId: tid,
          bankAccountId: data.bankAccountId,
          entryDate: data.entryDate,
          label: data.label,
          amount: data.amount,
          balance: data.balance ?? null,
          category: data.category ?? null,
          reference: data.reference ?? null,
          isReconciled: data.isReconciled ?? false,
          purchaseId: data.purchaseId ?? null,
          expenseId: data.expenseId ?? null,
          payrollId: data.payrollId ?? null,
          notes: data.notes ?? null,
        })
        .returning();

      void recordAudit({
        req,
        event: "bankEntries.created",
        userId,
        metadata: {
          entryId: row!.id,
          accountId: row!.bankAccountId,
          amount: row!.amount,
          entryDate: row!.entryDate,
        },
      });
      res.status(201).json({ entry: row });
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
      const data = updateSchema.parse(req.body);

      // If the user is moving the entry to another account, verify the
      // target also belongs to this tenant.
      if (data.bankAccountId !== undefined) {
        const account = await findAccount(tid, data.bankAccountId);
        if (!account) {
          return res.status(400).json({ error: "Compte bancaire introuvable" });
        }
      }

      const [row] = await db
        .update(bankEntries)
        .set(data)
        .where(and(eq(bankEntries.tenantId, tid), eq(bankEntries.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Entrée introuvable" });

      void recordAudit({
        req,
        event: "bankEntries.updated",
        userId,
        metadata: { entryId: row.id, fields: Object.keys(data) },
      });
      res.json({ entry: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "update error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== delete (hard) ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .delete(bankEntries)
        .where(and(eq(bankEntries.tenantId, tid), eq(bankEntries.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Entrée introuvable" });

      void recordAudit({
        req,
        event: "bankEntries.deleted",
        userId,
        metadata: {
          entryId: row.id,
          accountId: row.bankAccountId,
          amount: row.amount,
          entryDate: row.entryDate,
        },
      });
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, "delete error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
