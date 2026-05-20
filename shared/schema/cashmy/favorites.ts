/**
 * CashMy consumer favorites — merchants favoris d'un consommateur.
 *
 * Sert au front consumer pour afficher rapidement les merchants
 * suivis (raccourcis dans l'UI, notifs prioritaires sur leurs
 * nouvelles promotions, etc.).
 */
import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyUserFavorites = pgTable(
  "cashmy_user_favorites",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consumerId: integer("consumer_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cashmy_user_favorites_consumer_merchant_idx").on(table.consumerId, table.merchantId),
    index("cashmy_user_favorites_tenant_idx").on(table.tenantId),
  ],
);

export const insertCashMyUserFavoriteSchema = createInsertSchema(cashmyUserFavorites).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMyUserFavorite = z.infer<typeof insertCashMyUserFavoriteSchema>;
export type CashMyUserFavorite = typeof cashmyUserFavorites.$inferSelect;
