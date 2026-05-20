/**
 * REV notifications — événements adressés à un consommateur ou un
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

export const revNotifications = pgTable(
  "rev_notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** `consumer` ou `merchant`. */
    recipientType: text("recipient_type").notNull(),
    /**
     * Référence vers `rev_consumers.id` ou `rev_merchants.id`
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
    index("rev_notifications_recipient_idx").on(table.recipientType, table.recipientId, table.isRead),
    index("rev_notifications_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const insertRevNotificationSchema = createInsertSchema(revNotifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});
export type InsertRevNotification = z.infer<typeof insertRevNotificationSchema>;
export type RevNotification = typeof revNotifications.$inferSelect;
