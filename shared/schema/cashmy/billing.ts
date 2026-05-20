/**
 * CashMy merchant billing — facturation périodique des merchants.
 *
 * Cycles :
 * - 2 facturations par mois : période 1-15 et période 16-fin du mois
 *   (`due_date` = 5 jours après période_end).
 * - Calcul :
 *   - `totalSales` = somme des `cashmy_transactions.amount` complétées
 *     sur la période.
 *   - `cashbackAmount` = somme des `cashback_amount` (10% par défaut,
 *     versé aux consommateurs par CashMy → coût pour le merchant).
 *   - `platformFeeAmount` = `totalSales * 0.03` (3% de commission CashMy).
 *   - `tvaAmount` = `platformFeeAmount * 0.20` (TVA 20% sur la fee CashMy).
 *   - `promotionCharges` = `promotionWeeks * 19` (19€/semaine).
 *   - `totalBilled` = `platformFeeAmount + tvaAmount + promotionCharges`.
 *
 * Génération automatique : cron systemd timer le 16 et le 1er de chaque
 * mois (cf. Sprint 2). Pour relancer manuellement :
 * `scripts/cashmy-billing-generate.ts -- --tenant=<slug> --period=YYYY-MM-A|B`.
 */
import { pgTable, text, serial, integer, timestamp, decimal, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyMerchantBillings = pgTable(
  "cashmy_merchant_billings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    totalSales: decimal("total_sales", { precision: 10, scale: 2 }).notNull().default("0.00"),
    cashbackAmount: decimal("cashback_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    tvaAmount: decimal("tva_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    promotionCharges: decimal("promotion_charges", { precision: 10, scale: 2 }).notNull().default("0.00"),
    /** Nombre de promotion-weeks facturées sur la période. */
    promotionWeeks: integer("promotion_weeks").notNull().default(0),
    totalBilled: decimal("total_billed", { precision: 10, scale: 2 }).notNull().default("0.00"),
    /** `pending`, `paid`, `overdue`, `disputed`, `cancelled`. */
    status: text("status").notNull().default("pending"),
    dueDate: timestamp("due_date").notNull(),
    paidAt: timestamp("paid_at"),
    /** Référence Stripe (PaymentIntent) du paiement. */
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    invoiceUrl: text("invoice_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cashmy_merchant_billings_period_idx").on(table.merchantId, table.periodStart, table.periodEnd),
    index("cashmy_merchant_billings_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

/**
 * Objectif mensuel de CA fixé par le merchant pour son propre suivi.
 * Sert au composant "barre de progression" du dashboard merchant.
 */
export const cashmyMerchantGoals = pgTable(
  "cashmy_merchant_goals",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    salesGoal: decimal("sales_goal", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cashmy_merchant_goals_merchant_month_idx").on(table.merchantId, table.month, table.year),
    index("cashmy_merchant_goals_tenant_idx").on(table.tenantId),
  ],
);

export const insertCashMyMerchantBillingSchema = createInsertSchema(cashmyMerchantBillings).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});
export type InsertCashMyMerchantBilling = z.infer<typeof insertCashMyMerchantBillingSchema>;
export type CashMyMerchantBilling = typeof cashmyMerchantBillings.$inferSelect;

export const insertCashMyMerchantGoalSchema = createInsertSchema(cashmyMerchantGoals).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMyMerchantGoal = z.infer<typeof insertCashMyMerchantGoalSchema>;
export type CashMyMerchantGoal = typeof cashmyMerchantGoals.$inferSelect;
