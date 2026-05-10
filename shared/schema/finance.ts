/**
 * Finance — bank accounts, bank entries, cash entries.
 *
 * Sprint 5 module métier (PR #83). Replaces the legacy `bank_entries` and
 * `cash_entries` tables defined in `checklist.ts`, which were left as
 * empty schema stubs from the early prototype and never wired to a route.
 *
 * Design rationale (cf. booksystem 07.7.x — to be added in this PR) :
 *   - **Two tables** (bank vs cash) rather than a unified `payments` :
 *     suguval ulysseclaude maintains the separation and runs that way in
 *     production. Bank transactions are tracked-by-third-party and
 *     reconcilable ; cash entries are manual flows that never hit the
 *     bank. Different semantics ⇒ different tables.
 *   - **`bank_accounts`** is new compared to suguval (which used a free
 *     `bankName` text column). Modelled per-tenant so a client can have
 *     multiple accounts (Compte Pro CIC + Compte Perso BNP + Livret),
 *     each with its own iban, opening balance and entries.
 *   - **`cash_entries`** is *generic* — no hardcoded restaurant columns
 *     (cb, ticketResto, deliveroo, …). A vertical-specific Z-ticket
 *     parser can land later as a separate `cash_register_z` table.
 *   - **Optional FKs to purchases / expenses / payroll** on bank entries
 *     so the user can reconcile a debit with the source invoice. Not
 *     enforced at SQL level (Drizzle FK logiques pattern), filled
 *     opportunistically by the user or future auto-matching.
 */

import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  real,
  index,
} from "drizzle-orm/pg-core";

/**
 * Bank accounts — one row per tracked account (current, savings, etc.).
 * Soft-delete via `isActive` so an archived account keeps its history.
 *
 * `openingBalance` lets the UI compute a running balance even when the
 * tenant only enters partial historical data.
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** Display label — "Compte Pro CIC", "Livret A", etc. */
    name: text("name").notNull(),
    /** Bank name — kept distinct from `name` so multiple accounts at the
     *  same bank are still readable in lists. */
    bankName: text("bank_name"),
    /** IBAN for export / matching. Not validated server-side beyond
     *  trimmed length — let the UI guide entry. */
    iban: text("iban"),
    /** Optional opening balance (€) recorded the day the account is
     *  added to myBeez. Drives the UI's running balance computation. */
    openingBalance: real("opening_balance"),
    /** Free-form notes (account holder details, agency, etc.). */
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("bank_accounts_tenant_id_idx").on(table.tenantId),
  }),
);

/**
 * Bank entries — one row per transaction visible on a bank statement.
 * Amount is **signed** : negative for debits, positive for credits.
 * That convention matches what banks export and lets `SUM(amount)` give
 * the period delta directly.
 *
 * `isReconciled` flips when the entry has been matched against the
 * corresponding metier event (a purchase paid, an expense settled).
 * The optional FK columns (`purchaseId`, `expenseId`, `payrollId`) are
 * filled at reconciliation time — they are nullable and not enforced at
 * SQL level (drizzle FK logiques pattern, same as elsewhere in the
 * schema).
 */
export const bankEntries = pgTable(
  "bank_entries_v2",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** FK logique vers `bank_accounts.id`. Required — every bank entry
     *  belongs to exactly one tracked account. */
    bankAccountId: integer("bank_account_id").notNull(),
    /** ISO date `YYYY-MM-DD` of the operation. Text for cross-DB compat. */
    entryDate: text("entry_date").notNull(),
    /** Bank's label / wording for the operation. */
    label: text("label").notNull(),
    /** Signed amount in EUR. Negative = debit, positive = credit. */
    amount: real("amount").notNull(),
    /** Running balance after this entry, if known (typically extracted
     *  from the imported statement). Nullable when entered manually. */
    balance: real("balance"),
    /** Free-form category (loyer, urssaf, …) — vocabulary per tenant. */
    category: text("category"),
    /** Reference number (cheque number, transfer reference, …). */
    reference: text("reference"),
    /** True once matched to a metier event. */
    isReconciled: boolean("is_reconciled").notNull().default(false),
    /** Optional links to the matched metier row. Nullable. */
    purchaseId: integer("purchase_id"),
    expenseId: integer("expense_id"),
    payrollId: integer("payroll_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("bank_entries_v2_tenant_id_idx").on(table.tenantId),
    accountIdx: index("bank_entries_v2_account_id_idx").on(table.bankAccountId),
    dateIdx: index("bank_entries_v2_entry_date_idx").on(table.entryDate),
  }),
);

/**
 * Cash entries — manual recording of cash-only flows that never hit the
 * bank. Generic on purpose : no `cbAmount` / `ticketResto` / restaurant-
 * specific columns. A vertical that needs Z-ticket parsing should land
 * a dedicated table (`cash_register_z`) rather than bloat this one.
 *
 * Amount is always **positive** ; the direction is carried by `kind`.
 * `kind = "in"` = encaissement (cash received), `"out"` = décaissement.
 */
export const cashEntries = pgTable(
  "cash_entries_v2",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** ISO date `YYYY-MM-DD`. */
    entryDate: text("entry_date").notNull(),
    /** "in" or "out" — application-validated, not a DB enum. */
    kind: text("kind").notNull(),
    /** Always positive. The sign comes from `kind`. */
    amount: real("amount").notNull(),
    /** Free-form description. */
    label: text("label").notNull(),
    /** Free-form category. */
    category: text("category"),
    /** Reference (slip number, receipt id, …). */
    reference: text("reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("cash_entries_v2_tenant_id_idx").on(table.tenantId),
    dateIdx: index("cash_entries_v2_entry_date_idx").on(table.entryDate),
  }),
);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;
export type BankEntry = typeof bankEntries.$inferSelect;
export type InsertBankEntry = typeof bankEntries.$inferInsert;
export type CashEntry = typeof cashEntries.$inferSelect;
export type InsertCashEntry = typeof cashEntries.$inferInsert;

/** Allowed values for `cash_entries.kind` — validated at the route boundary. */
export const CASH_ENTRY_KINDS = ["in", "out"] as const;
export type CashEntryKind = (typeof CASH_ENTRY_KINDS)[number];
