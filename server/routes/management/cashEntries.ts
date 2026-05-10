/**
 * Cash Entries Routes — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/cash-entries`.
 *
 *   GET    /                  list (filters: from, to, kind, category)
 *   GET    /stats             period totals (in / out / net / count)
 *   GET    /:id               detail
 *   POST   /                  create
 *   PATCH  /:id               update
 *   DELETE /:id               hard-delete (audit_log keeps trace)
 *
 * RBAC :
 *   - READ : tous les rôles tenant
 *   - WRITE : owner / admin / manager
 *
 * Sprint 5 module métier (PR #83). Generic on purpose : no
 * restaurant-specific columns. A vertical-specific Z-ticket parser will
 * land in a dedicated table later.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { cashEntries, CASH_ENTRY_KINDS } from "../../../shared/schema/finance";
import { recordAudit } from "../../services/auth/auditService";
import { computeCashStats } from "../../services/finance/financeSummary";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("CashEntries");

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
  entryDate: ISO_DATE,
  kind: z.enum(CASH_ENTRY_KINDS),
  amount: z.number().finite().nonnegative(),
  label: z.string().trim().min(1).max(300),
  category: trimmed(60),
  reference: trimmed(120),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createSchema = z.object(baseFields);
const updateSchema = z
  .object({
    ...baseFields,
    entryDate: ISO_DATE.optional(),
    kind: z.enum(CASH_ENTRY_KINDS).optional(),
    amount: z.number().finite().nonnegative().optional(),
    label: z.string().trim().min(1).max(300).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucun champ à mettre à jour" });

const listQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  kind: z.enum(CASH_ENTRY_KINDS).optional(),
  category: z.string().trim().max(60).optional(),
});

type ListFilters = z.infer<typeof listQuerySchema>;

function buildConditions(tenantId: number, f: ListFilters) {
  const conds = [eq(cashEntries.tenantId, tenantId)];
  if (f.from) conds.push(gte(cashEntries.entryDate, f.from));
  if (f.to) conds.push(lte(cashEntries.entryDate, f.to));
  if (f.kind) conds.push(eq(cashEntries.kind, f.kind));
  if (f.category) conds.push(eq(cashEntries.category, f.category));
  return conds;
}

export function registerCashEntriesRoutes(app: Express): void {
  const r = "/api/management/:slug/cash-entries";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const f = listQuerySchema.parse(req.query);
      const rows = await db
        .select()
        .from(cashEntries)
        .where(and(...buildConditions(tid, f)))
        .orderBy(desc(cashEntries.entryDate), desc(cashEntries.id));
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
        .select({ kind: cashEntries.kind, amount: cashEntries.amount })
        .from(cashEntries)
        .where(and(...buildConditions(tid, f)));
      res.json(computeCashStats(rows));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "stats error");
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
        .from(cashEntries)
        .where(and(eq(cashEntries.tenantId, tid), eq(cashEntries.id, id)))
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

      const [row] = await db
        .insert(cashEntries)
        .values({
          tenantId: tid,
          entryDate: data.entryDate,
          kind: data.kind,
          amount: data.amount,
          label: data.label,
          category: data.category ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
        })
        .returning();

      void recordAudit({
        req,
        event: "cashEntries.created",
        userId,
        metadata: {
          entryId: row!.id,
          kind: row!.kind,
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

      const [row] = await db
        .update(cashEntries)
        .set(data)
        .where(and(eq(cashEntries.tenantId, tid), eq(cashEntries.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Entrée introuvable" });

      void recordAudit({
        req,
        event: "cashEntries.updated",
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
        .delete(cashEntries)
        .where(and(eq(cashEntries.tenantId, tid), eq(cashEntries.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Entrée introuvable" });

      void recordAudit({
        req,
        event: "cashEntries.deleted",
        userId,
        metadata: {
          entryId: row.id,
          kind: row.kind,
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
