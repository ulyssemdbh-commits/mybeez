/**
 * CashMy notifications — événements adressés à un consommateur ou un
 * merchant dans le contexte d'un tenant.
 *
 * Types :
 * - `cashback_earned` : nouveau cashback débloqué.
 * - `cashback_unlocked` : cashback `pending` devenu `available`.
 * - `transfer_sent` / `transfer_received` : transfert cashback.
 * - `gift_card_purchased` / `gift_card_received` : cartes cadeaux.
 * - `billing_generated` / `billing_paid` / `billing_overdue` : facturation.
 * - `promotion_started` / `promotion_ended`.
 *
 * Non scopée par destinataire dans la table (un consumer ou un merchant),
 * c'est le champ `recipientType` qui discrimine. Permet de stocker les
 * notifs des deux côtés sans dupliquer la table.
 */
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyNotifications = pgTable(
  "cashmy_notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** `consumer` ou `merchant`. */
    recipientType: text("recipient_type").notNull(),
    /**
     * Référence vers `cashmy_consumers.id` ou `cashmy_merchants.id`
     * selon `recipientType`.
     */
    recipientId: integer("recipient_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    /** Payload structuré (montants, ids référencés, etc.). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_notifications_recipient_idx").on(table.recipientType, table.recipientId, table.isRead),
    index("cashmy_notifications_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const insertCashMyNotificationSchema = createInsertSchema(cashmyNotifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});
export type InsertCashMyNotification = z.infer<typeof insertCashMyNotificationSchema>;
export type CashMyNotification = typeof cashmyNotifications.$inferSelect;
