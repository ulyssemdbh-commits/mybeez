/**
 * CashMy transactions, balances, entries et transfers de cashback.
 *
 * Flow nominal :
 * 1. Le client paie en caisse, le merchant scanne le QR du client.
 * 2. Une `cashmy_transaction` est créée (montant, cashback calculé).
 * 3. Une `cashmy_cashback_entries` est créée en `pending` avec
 *    `unlocks_at = now() + N jours` (configurable, default 7 jours).
 * 4. Quand `unlocks_at` est atteint, un cron déplace l'entry en
 *    `unlocked` et augmente `cashmy_cashback_balances.available_balance`
 *    en baissant `pending_balance`.
 * 5. Le client peut alors transférer ce cashback (`cashmy_cashback_transfers`)
 *    ou l'utiliser comme paiement chez le même merchant.
 */
import { pgTable, text, serial, integer, timestamp, decimal, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cashmyTransactions = pgTable(
  "cashmy_transactions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consumerId: integer("consumer_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    /** Montant TTC payé en caisse. */
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    /** Cashback offert (= amount * cashbackRate / 100). */
    cashbackAmount: decimal("cashback_amount", { precision: 10, scale: 2 }).notNull(),
    /** Commission plateforme CashMy due par le merchant (= amount * 3 / 100). */
    commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull(),
    /** `completed`, `cancelled`, `refunded`. */
    status: text("status").notNull().default("completed"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_transactions_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("cashmy_transactions_consumer_idx").on(table.consumerId),
    index("cashmy_transactions_merchant_idx").on(table.merchantId),
  ],
);

/**
 * Solde de cashback d'un consommateur chez un merchant.
 * Une seule row par (consumer, merchant). Mis à jour par les
 * services backend lors des transitions de status d'entries
 * (pending → unlocked) et des transferts.
 */
export const cashmyCashbackBalances = pgTable(
  "cashmy_cashback_balances",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    consumerId: integer("consumer_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    /** Cashback déverrouillé, utilisable comme paiement. */
    availableBalance: decimal("available_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
    /** Cashback verrouillé en attente du `unlocks_at`. */
    pendingBalance: decimal("pending_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cashmy_cashback_balances_consumer_merchant_idx").on(table.consumerId, table.merchantId),
    index("cashmy_cashback_balances_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Entry de cashback : 1 par transaction, en `pending` jusqu'à
 * `unlocks_at`, puis `unlocked` quand le cron tourne. Peut aussi
 * passer en `cancelled` si la transaction d'origine est annulée.
 */
export const cashmyCashbackEntries = pgTable(
  "cashmy_cashback_entries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    transactionId: integer("transaction_id").notNull(),
    consumerId: integer("consumer_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    /** `pending`, `unlocked`, `cancelled`. */
    status: text("status").notNull().default("pending"),
    unlocksAt: timestamp("unlocks_at").notNull(),
    unlockedAt: timestamp("unlocked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_cashback_entries_unlocks_status_idx").on(table.unlocksAt, table.status),
    index("cashmy_cashback_entries_consumer_merchant_idx").on(table.consumerId, table.merchantId),
    index("cashmy_cashback_entries_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Transfert de cashback entre deux consommateurs, **scopé par merchant**
 * (le cashback est lié à un merchant donné, on ne peut pas transférer
 * du cashback "Boulangerie X" vers un solde "Coiffeur Y").
 */
export const cashmyCashbackTransfers = pgTable(
  "cashmy_cashback_transfers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    fromConsumerId: integer("from_consumer_id").notNull(),
    toConsumerId: integer("to_consumer_id").notNull(),
    merchantId: integer("merchant_id").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    /** `completed`, `cancelled`. */
    status: text("status").notNull().default("completed"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cashmy_cashback_transfers_tenant_idx").on(table.tenantId),
    index("cashmy_cashback_transfers_from_idx").on(table.fromConsumerId),
    index("cashmy_cashback_transfers_to_idx").on(table.toConsumerId),
  ],
);

export const insertCashMyTransactionSchema = createInsertSchema(cashmyTransactions).omit({
  id: true,
  createdAt: true,
  cancelledAt: true,
});
export type InsertCashMyTransaction = z.infer<typeof insertCashMyTransactionSchema>;
export type CashMyTransaction = typeof cashmyTransactions.$inferSelect;

export const insertCashMyCashbackBalanceSchema = createInsertSchema(cashmyCashbackBalances).omit({
  id: true,
  updatedAt: true,
});
export type InsertCashMyCashbackBalance = z.infer<typeof insertCashMyCashbackBalanceSchema>;
export type CashMyCashbackBalance = typeof cashmyCashbackBalances.$inferSelect;

export const insertCashMyCashbackEntrySchema = createInsertSchema(cashmyCashbackEntries).omit({
  id: true,
  createdAt: true,
  unlockedAt: true,
});
export type InsertCashMyCashbackEntry = z.infer<typeof insertCashMyCashbackEntrySchema>;
export type CashMyCashbackEntry = typeof cashmyCashbackEntries.$inferSelect;

export const insertCashMyCashbackTransferSchema = createInsertSchema(cashmyCashbackTransfers).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMyCashbackTransfer = z.infer<typeof insertCashMyCashbackTransferSchema>;
export type CashMyCashbackTransfer = typeof cashmyCashbackTransfers.$inferSelect;
