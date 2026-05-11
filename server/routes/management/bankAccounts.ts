/**
 * Bank Accounts Routes — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/bank-accounts`.
 *
 *   GET    /                  list (?includeInactive=true to also return archived)
 *   GET    /:id               detail (with current balance computed)
 *   POST   /                  create
 *   PATCH  /:id               update
 *   DELETE /:id               soft-delete (`isActive=false`)
 *
 * RBAC :
 *   - READ : tous les rôles tenant
 *   - WRITE : owner / admin / manager
 *
 * Sprint 5 module métier (PR #83).
 */

import type { Express, Request, Response } from "express";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import { bankAccounts, bankEntries } from "../../../shared/schema/finance";
import { recordAudit } from "../../services/auth/auditService";
import { computeBankAccountBalance } from "../../services/finance/financeSummary";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("BankAccounts");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;

function parseId(param: string): number | null {
  const id = Number.parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const trimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const baseFields = {
  name: z.string().trim().min(1).max(120),
  bankName: trimmed(120),
  iban: trimmed(60),
  openingBalance: z.number().finite().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
};

const createSchema = z.object(baseFields);
const updateSchema = z
  .object({
    ...baseFields,
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Aucun champ à mettre à jour" });

const listQuerySchema = z.object({
  includeInactive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export function registerBankAccountsRoutes(app: Express): void {
  const r = "/api/management/:slug/bank-accounts";

  // ============================== list ==============================
  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const q = listQuerySchema.parse(req.query);
      const conds = [eq(bankAccounts.tenantId, tid)];
      if (!q.includeInactive) conds.push(eq(bankAccounts.isActive, true));
      const rows = await db
        .select()
        .from(bankAccounts)
        .where(and(...conds))
        .orderBy(asc(bankAccounts.name));
      res.json({ accounts: rows });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtres invalides", details: error.errors });
      }
      log.error({ err: error }, "list error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== detail (with balance) ==============================
  app.get(`${r}/:id`, resolveTenant, requireUser, requireRole(...READ_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.tenantId, tid), eq(bankAccounts.id, id)))
        .limit(1);
      if (!account) return res.status(404).json({ error: "Compte introuvable" });

      const entries = await db
        .select({ amount: bankEntries.amount })
        .from(bankEntries)
        .where(and(eq(bankEntries.tenantId, tid), eq(bankEntries.bankAccountId, id)));
      const balance = computeBankAccountBalance(account, entries);
      res.json({ account, balance });
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
        .insert(bankAccounts)
        .values({
          tenantId: tid,
          name: data.name,
          bankName: data.bankName ?? null,
          iban: data.iban ?? null,
          openingBalance: data.openingBalance ?? null,
          notes: data.notes ?? null,
        })
        .returning();

      void recordAudit({
        req,
        event: "bankAccounts.created",
        userId,
        metadata: { accountId: row!.id, name: row!.name, bankName: row!.bankName },
      });
      res.status(201).json({ account: row });
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
        .update(bankAccounts)
        .set(data)
        .where(and(eq(bankAccounts.tenantId, tid), eq(bankAccounts.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Compte introuvable" });

      void recordAudit({
        req,
        event: "bankAccounts.updated",
        userId,
        metadata: { accountId: row.id, fields: Object.keys(data) },
      });
      res.json({ account: row });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Données invalides", details: error.errors });
      }
      log.error({ err: error }, "update error");
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================== delete (soft) ==============================
  app.delete(`${r}/:id`, resolveTenant, requireUser, requireRole(...WRITE_ROLES), async (req: Request, res: Response) => {
    try {
      const tid = req.tenantId!;
      const userId = (req.session as unknown as { userId?: number }).userId ?? null;
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "ID invalide" });

      const [row] = await db
        .update(bankAccounts)
        .set({ isActive: false })
        .where(and(eq(bankAccounts.tenantId, tid), eq(bankAccounts.id, id)))
        .returning();
      if (!row) return res.status(404).json({ error: "Compte introuvable" });

      void recordAudit({
        req,
        event: "bankAccounts.archived",
        userId,
        metadata: { accountId: row.id },
      });
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, "delete error");
      res.status(500).json({ error: "Erreur" });
    }
  });
}
