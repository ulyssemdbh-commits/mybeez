/**
 * CashMy promotions — bons plans ponctuels et récurrents.
 *
 * Types supportés :
 * - `cashback_boost` : taux de cashback majoré pendant la période
 *   (ex. 15% au lieu des 10% nominaux). Champ `cashbackBoostRate`.
 * - `free_article` : article offert listé en libellé. Champ
 *   `freeArticle`.
 * - `discount_percent` : remise immédiate en caisse. Champ
 *   `discountPercent`.
 *
 * Facturation : chaque semaine d'activité d'une promo = 1
 * promotion-week (19€). Compté dans `merchant_billings.promotionWeeks`.
 */
import { pgTable, text, serial, integer, boolean, timestamp, decimal, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyPromotions = pgTable(
  "cashmy_promotions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    /** `cashback_boost`, `free_article`, `discount_percent`. */
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    cashbackBoostRate: decimal("cashback_boost_rate", { precision: 5, scale: 2 }),
    freeArticle: text("free_article"),
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_promotions_tenant_active_idx").on(table.tenantId, table.isActive),
    index("cashmy_promotions_merchant_idx").on(table.merchantId),
    index("cashmy_promotions_window_idx").on(table.startDate, table.endDate),
  ],
);

/**
 * Promotion récurrente automatique (ex. happy hour le mercredi).
 * `daysOfWeek` est un string CSV (`"1,3,5"` = lundi, mercredi, vendredi),
 * conservé pour simplicité — décodé côté service `promotionScheduler`.
 */
export const cashmyRecurringPromotions = pgTable(
  "cashmy_recurring_promotions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    cashbackBoostRate: decimal("cashback_boost_rate", { precision: 5, scale: 2 }),
    freeArticle: text("free_article"),
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
    /** CSV des jours actifs : `"0,1,2,3,4,5,6"` (dimanche=0). */
    daysOfWeek: text("days_of_week").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_recurring_promotions_tenant_active_idx").on(table.tenantId, table.isActive),
    index("cashmy_recurring_promotions_merchant_idx").on(table.merchantId),
  ],
);

export const insertCashMyPromotionSchema = createInsertSchema(cashmyPromotions).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMyPromotion = z.infer<typeof insertCashMyPromotionSchema>;
export type CashMyPromotion = typeof cashmyPromotions.$inferSelect;

export const insertCashMyRecurringPromotionSchema = createInsertSchema(cashmyRecurringPromotions).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMyRecurringPromotion = z.infer<typeof insertCashMyRecurringPromotionSchema>;
export type CashMyRecurringPromotion = typeof cashmyRecurringPromotions.$inferSelect;
