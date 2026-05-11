/**
 * Analytics Routes — back-office gestion (Management).
 *
 * Mounted at `/api/management/:slug/analytics`.
 *
 *   GET /dashboard       snapshot période (defaults : mois courant)
 *   GET /monthly         séries mensuelles N mois (default 12)
 *   GET /tva             TVA déductible sur la période (collectée = null V1)
 *
 * RBAC : tous les rôles tenant en READ. Pas d'écriture (compute pur).
 *
 * Sprint 6 module métier (PR #85). Compute on-demand depuis purchases,
 * generalExpenses, payroll, bankEntries, cashEntries. Helpers purs dans
 * `services/analytics/analyticsSummary.ts`.
 *
 * Pourquoi pas de stockage / cache : volumes attendus < 12 mois × few
 * thousand rows ⇒ <100ms en compute direct. La table `analytics` reste
 * un emplacement libre pour Phase 2 si on a besoin d'un cache snapshot.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { resolveTenant } from "../../middleware/tenant";
import { requireUser, requireRole } from "../../middleware/auth";
import { db } from "../../db";
import {
  purchases,
  generalExpenses,
  payroll,
} from "../../../shared/schema/checklist";
import { bankEntries, cashEntries } from "../../../shared/schema/finance";
import {
  monthsInRange,
  sumField,
  bucketSumByMonth,
  topByGroup,
  countByGroup,
  round2,
} from "../../services/analytics/analyticsSummary";
import { moduleLogger } from "../../lib/logger";

const log = moduleLogger("Analytics");

const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");
const ISO_MONTH = z.string().regex(/^\d{4}-\d{2}$/, "Format attendu YYYY-MM");

/** Defaults the period to the current month if neither `from` nor `to` is set. */
function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0..11
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear().toString().padStart(4, "0")}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

const dashboardQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
  topSuppliersLimit: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(50))
    .optional(),
});

const monthlyQuerySchema = z.object({
  from: ISO_MONTH.optional(),
  to: ISO_MONTH.optional(),
  months: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(36))
    .optional(),
});

const tvaQuerySchema = z.object({
  from: ISO_DATE.optional(),
  to: ISO_DATE.optional(),
});

/** Default monthly window : last 12 months (inclusive of the current one). */
function defaultMonthlyWindow(months: number): { from: string; to: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const fmt = (d: Date) =>
    `${d.getFullYear().toString().padStart(4, "0")}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}

/** Convert YYYY-MM to YYYY-MM-DD bounds for date-of-month columns. */
function monthBounds(yearMonth: string, end: "start" | "end"): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (end === "start") return `${y}-${m!.toString().padStart(2, "0")}-01`;
  // Last day of month: day 0 of the next month.
  const last = new Date(y!, m!, 0).getDate();
  return `${y}-${m!.toString().padStart(2, "0")}-${last.toString().padStart(2, "0")}`;
}

export function registerManagementAnalyticsRoutes(app: Express): void {
  const r = "/api/management/:slug/analytics";

  // ============================== dashboard ==============================
  app.get(
    `${r}/dashboard`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const q = dashboardQuerySchema.parse(req.query);
        const period = q.from && q.to ? { from: q.from, to: q.to } : defaultPeriod();
        const topLimit = q.topSuppliersLimit ?? 5;

        // Fetch all rows in parallel — period filter only, tenant filter
        // ALWAYS, the helper functions run pure on the result set.
        const [
          purchaseRows,
          expenseRows,
          payrollRows,
          bankRows,
          cashRows,
        ] = await Promise.all([
          db
            .select({
              id: purchases.id,
              supplierId: purchases.supplierId,
              supplierName: purchases.supplierName,
              totalTtc: purchases.totalTtc,
              totalHt: purchases.totalHt,
              tvaAmount: purchases.tvaAmount,
              invoiceDate: purchases.invoiceDate,
              paymentStatus: purchases.paymentStatus,
              isActive: purchases.isActive,
            })
            .from(purchases)
            .where(
              and(
                eq(purchases.tenantId, tid),
                eq(purchases.isActive, true),
                gte(purchases.invoiceDate, period.from),
                lte(purchases.invoiceDate, period.to),
              ),
            ),
          db
            .select({
              id: generalExpenses.id,
              amount: generalExpenses.amount,
              taxAmount: generalExpenses.taxAmount,
              date: generalExpenses.date,
              paymentStatus: generalExpenses.paymentStatus,
              isActive: generalExpenses.isActive,
            })
            .from(generalExpenses)
            .where(
              and(
                eq(generalExpenses.tenantId, tid),
                eq(generalExpenses.isActive, true),
                gte(generalExpenses.date, period.from),
                lte(generalExpenses.date, period.to),
              ),
            ),
          // payroll.month is YYYY-MM ; we filter overlap by month bounds.
          db
            .select({
              id: payroll.id,
              employeeId: payroll.employeeId,
              month: payroll.month,
              grossSalary: payroll.grossSalary,
              netSalary: payroll.netSalary,
              employerCharges: payroll.employerCharges,
              totalEmployerCost: payroll.totalEmployerCost,
            })
            .from(payroll)
            .where(
              and(
                eq(payroll.tenantId, tid),
                gte(payroll.month, period.from.slice(0, 7)),
                lte(payroll.month, period.to.slice(0, 7)),
              ),
            ),
          db
            .select({
              id: bankEntries.id,
              entryDate: bankEntries.entryDate,
              amount: bankEntries.amount,
              isReconciled: bankEntries.isReconciled,
            })
            .from(bankEntries)
            .where(
              and(
                eq(bankEntries.tenantId, tid),
                gte(bankEntries.entryDate, period.from),
                lte(bankEntries.entryDate, period.to),
              ),
            ),
          db
            .select({
              id: cashEntries.id,
              entryDate: cashEntries.entryDate,
              kind: cashEntries.kind,
              amount: cashEntries.amount,
            })
            .from(cashEntries)
            .where(
              and(
                eq(cashEntries.tenantId, tid),
                gte(cashEntries.entryDate, period.from),
                lte(cashEntries.entryDate, period.to),
              ),
            ),
        ]);

        // Purchases summary
        const purchasesTotalTtc = sumField(purchaseRows, (r) => r.totalTtc);
        const purchasesTotalHt = sumField(purchaseRows, (r) => r.totalHt);
        const purchasesByStatus = countByGroup(purchaseRows, (r) => r.paymentStatus);
        const topSuppliers = topByGroup(
          purchaseRows,
          (r) => r.supplierName ?? (r.supplierId ? `#${r.supplierId}` : null),
          (r) => r.totalTtc,
          topLimit,
        );

        // Expenses summary
        const expensesTotal = sumField(expenseRows, (r) => r.amount);
        const expensesByStatus = countByGroup(expenseRows, (r) => r.paymentStatus);

        // Payroll summary — `totalEmployerCost` if present else gross+employerCharges
        const payrollGross = sumField(payrollRows, (r) => r.grossSalary);
        const payrollNet = sumField(payrollRows, (r) => r.netSalary);
        const payrollEmployerCost = sumField(payrollRows, (r) =>
          r.totalEmployerCost ?? (r.grossSalary !== null ? r.grossSalary + (r.employerCharges ?? 0) : 0),
        );

        // Bank — net delta (signed sum). Positive = net inflow.
        const bankNetDelta = sumField(bankRows, (r) => r.amount);
        const bankCredits = sumField(
          bankRows.filter((r) => r.amount > 0),
          (r) => r.amount,
        );
        const bankDebits = round2(
          -sumField(
            bankRows.filter((r) => r.amount < 0),
            (r) => r.amount,
          ),
        );

        // Cash — in / out / net via `kind`.
        const cashIn = sumField(
          cashRows.filter((r) => r.kind === "in"),
          (r) => r.amount,
        );
        const cashOut = sumField(
          cashRows.filter((r) => r.kind === "out"),
          (r) => r.amount,
        );

        res.json({
          period,
          purchases: {
            totalTtc: purchasesTotalTtc,
            totalHt: purchasesTotalHt,
            count: purchaseRows.length,
            byStatus: purchasesByStatus,
            topSuppliers,
          },
          expenses: {
            total: expensesTotal,
            count: expenseRows.length,
            byStatus: expensesByStatus,
          },
          payroll: {
            gross: payrollGross,
            net: payrollNet,
            employerCost: payrollEmployerCost,
            entryCount: payrollRows.length,
          },
          bank: {
            credits: bankCredits,
            debits: bankDebits,
            netDelta: bankNetDelta,
            entryCount: bankRows.length,
          },
          cash: {
            totalIn: cashIn,
            totalOut: cashOut,
            net: round2(cashIn - cashOut),
            entryCount: cashRows.length,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        log.error({ err: error }, "dashboard error");
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

  // ============================== monthly ==============================
  app.get(
    `${r}/monthly`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const q = monthlyQuerySchema.parse(req.query);
        const window = q.from && q.to ? { from: q.from, to: q.to } : defaultMonthlyWindow(q.months ?? 12);

        const months = monthsInRange(window.from, window.to);
        if (months.length === 0) {
          return res.status(400).json({ error: "Plage temporelle invalide" });
        }

        const fromDate = monthBounds(months[0]!, "start");
        const toDate = monthBounds(months[months.length - 1]!, "end");

        const [purchaseRows, expenseRows, payrollRows, bankRows, cashRows] = await Promise.all([
          db
            .select({
              invoiceDate: purchases.invoiceDate,
              totalTtc: purchases.totalTtc,
            })
            .from(purchases)
            .where(
              and(
                eq(purchases.tenantId, tid),
                eq(purchases.isActive, true),
                gte(purchases.invoiceDate, fromDate),
                lte(purchases.invoiceDate, toDate),
              ),
            ),
          db
            .select({
              date: generalExpenses.date,
              amount: generalExpenses.amount,
            })
            .from(generalExpenses)
            .where(
              and(
                eq(generalExpenses.tenantId, tid),
                eq(generalExpenses.isActive, true),
                gte(generalExpenses.date, fromDate),
                lte(generalExpenses.date, toDate),
              ),
            ),
          db
            .select({
              month: payroll.month,
              grossSalary: payroll.grossSalary,
              employerCharges: payroll.employerCharges,
              totalEmployerCost: payroll.totalEmployerCost,
            })
            .from(payroll)
            .where(
              and(
                eq(payroll.tenantId, tid),
                gte(payroll.month, months[0]!),
                lte(payroll.month, months[months.length - 1]!),
              ),
            ),
          db
            .select({
              entryDate: bankEntries.entryDate,
              amount: bankEntries.amount,
            })
            .from(bankEntries)
            .where(
              and(
                eq(bankEntries.tenantId, tid),
                gte(bankEntries.entryDate, fromDate),
                lte(bankEntries.entryDate, toDate),
              ),
            ),
          db
            .select({
              entryDate: cashEntries.entryDate,
              kind: cashEntries.kind,
              amount: cashEntries.amount,
            })
            .from(cashEntries)
            .where(
              and(
                eq(cashEntries.tenantId, tid),
                gte(cashEntries.entryDate, fromDate),
                lte(cashEntries.entryDate, toDate),
              ),
            ),
        ]);

        const purchasesByMonth = bucketSumByMonth(purchaseRows, (r) => r.invoiceDate, (r) => r.totalTtc);
        const expensesByMonth = bucketSumByMonth(expenseRows, (r) => r.date, (r) => r.amount);
        const payrollByMonth = bucketSumByMonth(
          payrollRows,
          (r) => r.month,
          (r) => r.totalEmployerCost ?? (r.grossSalary !== null ? r.grossSalary + (r.employerCharges ?? 0) : 0),
        );

        // Bank : split crédits / débits par mois pour rendre une bar chart
        // signée propre côté UI.
        const bankCreditsByMonth = bucketSumByMonth(
          bankRows.filter((r) => r.amount > 0),
          (r) => r.entryDate,
          (r) => r.amount,
        );
        const bankDebitsByMonth = bucketSumByMonth(
          bankRows.filter((r) => r.amount < 0),
          (r) => r.entryDate,
          (r) => -r.amount,
        );

        const cashInByMonth = bucketSumByMonth(
          cashRows.filter((r) => r.kind === "in"),
          (r) => r.entryDate,
          (r) => r.amount,
        );
        const cashOutByMonth = bucketSumByMonth(
          cashRows.filter((r) => r.kind === "out"),
          (r) => r.entryDate,
          (r) => r.amount,
        );

        const series = months.map((m) => ({
          month: m,
          purchases: purchasesByMonth.get(m) ?? 0,
          expenses: expensesByMonth.get(m) ?? 0,
          payrollEmployerCost: payrollByMonth.get(m) ?? 0,
          bankCredits: bankCreditsByMonth.get(m) ?? 0,
          bankDebits: bankDebitsByMonth.get(m) ?? 0,
          cashIn: cashInByMonth.get(m) ?? 0,
          cashOut: cashOutByMonth.get(m) ?? 0,
        }));

        res.json({ window, series });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        log.error({ err: error }, "monthly error");
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

  // ============================== tva ==============================
  app.get(
    `${r}/tva`,
    resolveTenant,
    requireUser,
    requireRole(...READ_ROLES),
    async (req: Request, res: Response) => {
      try {
        const tid = req.tenantId!;
        const q = tvaQuerySchema.parse(req.query);
        const period = q.from && q.to ? { from: q.from, to: q.to } : defaultPeriod();

        const [purchaseRows, expenseRows] = await Promise.all([
          db
            .select({ tvaAmount: purchases.tvaAmount })
            .from(purchases)
            .where(
              and(
                eq(purchases.tenantId, tid),
                eq(purchases.isActive, true),
                gte(purchases.invoiceDate, period.from),
                lte(purchases.invoiceDate, period.to),
              ),
            ),
          db
            .select({ taxAmount: generalExpenses.taxAmount })
            .from(generalExpenses)
            .where(
              and(
                eq(generalExpenses.tenantId, tid),
                eq(generalExpenses.isActive, true),
                gte(generalExpenses.date, period.from),
                lte(generalExpenses.date, period.to),
              ),
            ),
        ]);

        const tvaPurchases = sumField(purchaseRows, (r) => r.tvaAmount);
        const tvaExpenses = sumField(expenseRows, (r) => r.taxAmount);
        const deductible = round2(tvaPurchases + tvaExpenses);

        res.json({
          period,
          deductible: {
            total: deductible,
            purchases: tvaPurchases,
            expenses: tvaExpenses,
          },
          // Collected VAT requires a generic revenue table that myBeez
          // doesn't ship in V1 (cash_entries is generic, no per-entry VAT
          // breakdown). Returning null so the UI can show a "à venir"
          // stub rather than a misleading zero.
          collected: null,
          collectedReason:
            "TVA collectée non disponible : la saisie de revenus avec ventilation TVA arrive Phase 2.",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: "Filtres invalides", details: error.errors });
        }
        log.error({ err: error }, "tva error");
        res.status(500).json({ error: "Erreur" });
      }
    },
  );

}
