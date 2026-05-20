/**
 * REV gift cards — cartes cadeaux émises par un merchant.
 *
 * Modèle :
 * - `rev_gift_cards` : catalogue (face value + cashback rate, default 15%).
 * - `rev_gift_card_purchases` : achat par un consommateur (paie face_value,
 *   reçoit la carte + cashback `face_value * 15%`). Verrouillage 7 jours
 *   ouvrés via `unlocks_at`.
 * - `rev_gift_card_balances` : solde courant détenu par un consommateur
 *   (peut diminuer en utilisation ou être transféré).
 * - `rev_gift_card_transfers` : historique des transferts entre consommateurs.
 *
 * **Décision absorption** : les gift cards sont scopées par tenant
 * (un tenant émet ses propres cartes — pas de gift cards globales
 * cross-tenant comme dans REV original). Cohérent avec la philosophie
 * multi-tenant mybeez.
 */
import { pgTable, text, serial, integer, boolean, timestamp, decimal, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const revGiftCards = pgTable(
  "rev_gift_cards",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** Merchant qui émet la carte. */
    merchantId: integer("merchant_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** Valeur faciale de la carte (ex. 50€, 100€). */
    faceValue: decimal("face_value", { precision: 10, scale: 2 }).notNull(),
    /** Cashback à l'achat (default 15%, ajustable par le merchant). */
    cashbackRate: decimal("cashback_rate", { precision: 5, scale: 2 }).notNull().default("15.00"),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rev_gift_cards_tenant_active_idx").on(table.tenantId, table.isActive),
    index("rev_gift_cards_merchant_idx").on(table.merchantId),
  ],
);

export const revGiftCardPurchases = pgTable(
  "rev_gift_card_purchases",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    buyerConsumerId: integer("buyer_consumer_id").notNull(),
    giftCardId: integer("gift_card_id").notNull(),
    /** Montant effectivement payé (face value au moment de l'achat). */
    purchaseAmount: decimal("purchase_amount", { precision: 10, scale: 2 }).notNull(),
    /** Cashback associé (= purchase_amount * cashbackRate). */
    cashbackAmount: decimal("cashback_amount", { precision: 10, scale: 2 }).notNull(),
    /** Référence Stripe ou PayPal du paiement. */
    paymentProvider: text("payment_provider").notNull(),
    paymentReference: text("payment_reference"),
    /** `active`, `used`, `cancelled`, `transferred`. */
    status: text("status").notNull().default("active"),
    /** 7 jours ouvrés après purchase, début de l'utilisation possible. */
    unlocksAt: timestamp("unlocks_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rev_gift_card_purchases_buyer_idx").on(table.buyerConsumerId),
    index("rev_gift_card_purchases_tenant_idx").on(table.tenantId),
  ],
);

export const revGiftCardBalances = pgTable(
  "rev_gift_card_balances",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    ownerConsumerId: integer("owner_consumer_id").notNull(),
    giftCardId: integer("gift_card_id").notNull(),
    purchaseId: integer("purchase_id").notNull(),
    /** Solde restant utilisable. */
    remainingValue: decimal("remaining_value", { precision: 10, scale: 2 }).notNull(),
    /** `active`, `used`, `expired`. */
    status: text("status").notNull().default("active"),
    /** Si reçue par transfert, l'expéditeur. */
    receivedFromConsumerId: integer("received_from_consumer_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rev_gift_card_balances_owner_idx").on(table.ownerConsumerId, table.status),
    index("rev_gift_card_balances_tenant_idx").on(table.tenantId),
  ],
);

export const revGiftCardTransfers = pgTable(
  "rev_gift_card_transfers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    balanceId: integer("balance_id").notNull(),
    fromConsumerId: integer("from_consumer_id").notNull(),
    toConsumerId: integer("to_consumer_id").notNull(),
    /** `completed`, `cancelled`. */
    status: text("status").notNull().default("completed"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rev_gift_card_transfers_tenant_idx").on(table.tenantId),
    index("rev_gift_card_transfers_from_idx").on(table.fromConsumerId),
    index("rev_gift_card_transfers_to_idx").on(table.toConsumerId),
  ],
);

export const insertRevGiftCardSchema = createInsertSchema(revGiftCards).omit({
  id: true,
  createdAt: true,
});
export type InsertRevGiftCard = z.infer<typeof insertRevGiftCardSchema>;
export type RevGiftCard = typeof revGiftCards.$inferSelect;

export const insertRevGiftCardPurchaseSchema = createInsertSchema(revGiftCardPurchases).omit({
  id: true,
  createdAt: true,
});
export type InsertRevGiftCardPurchase = z.infer<typeof insertRevGiftCardPurchaseSchema>;
export type RevGiftCardPurchase = typeof revGiftCardPurchases.$inferSelect;

export const insertRevGiftCardBalanceSchema = createInsertSchema(revGiftCardBalances).omit({
  id: true,
  createdAt: true,
});
export type InsertRevGiftCardBalance = z.infer<typeof insertRevGiftCardBalanceSchema>;
export type RevGiftCardBalance = typeof revGiftCardBalances.$inferSelect;

export const insertRevGiftCardTransferSchema = createInsertSchema(revGiftCardTransfers).omit({
  id: true,
  createdAt: true,
});
export type InsertRevGiftCardTransfer = z.infer<typeof insertRevGiftCardTransferSchema>;
export type RevGiftCardTransfer = typeof revGiftCardTransfers.$inferSelect;
