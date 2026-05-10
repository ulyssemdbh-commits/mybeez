/**
 * Pure helpers for the Finance module dashboards. No DB / no IO so the
 * route handlers can fetch the rows once and pass them in for stats,
 * and so vitest can cover the maths without a Postgres dependency.
 *
 * Three computations exposed :
 *   - `computeBankAccountBalance(account, entries)` — running balance
 *     starting from `account.openingBalance` and walking through the
 *     account's entries (signed amounts).
 *   - `computeBankStats(entries)` — period totals (credits, debits,
 *     net, count, reconciled-rate) over a flat list of entries.
 *   - `computeCashStats(entries)` — period totals for cash flows
 *     (in / out / net / count) given the `kind` discriminator.
 *
 * Floating-point rounding policy : sums are rounded to the cent
 * (2 decimals) before return so the UI shows clean numbers and JSON
 * comparison stays stable across environments. Internal accumulation
 * stays in number-precision — for the tenant volumes we expect (< 10k
 * rows / period), accumulated drift is well under a cent.
 */

import type { BankAccount, BankEntry, CashEntry } from "../../../shared/schema/finance";

/** Round to 2 decimals for stable JSON output. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface BankAccountBalance {
  accountId: number;
  /** Opening balance fed into the account, or 0 when not set. */
  openingBalance: number;
  /** Sum of all entry amounts (signed). */
  netDelta: number;
  /** `openingBalance + netDelta`. */
  currentBalance: number;
  entryCount: number;
}

/**
 * Compute the running balance of a bank account given its entries.
 * The caller is responsible for filtering entries to the account
 * (`entries.filter(e => e.bankAccountId === account.id)`).
 *
 * Reads `account.openingBalance` (default 0 when null/undefined) and
 * adds the signed sum of `entries[].amount` (negative = debit).
 */
export function computeBankAccountBalance(
  account: Pick<BankAccount, "id" | "openingBalance">,
  entries: ReadonlyArray<Pick<BankEntry, "amount">>,
): BankAccountBalance {
  const opening = account.openingBalance ?? 0;
  let net = 0;
  for (const e of entries) {
    net += e.amount;
  }
  return {
    accountId: account.id,
    openingBalance: round2(opening),
    netDelta: round2(net),
    currentBalance: round2(opening + net),
    entryCount: entries.length,
  };
}

export interface BankStats {
  /** Sum of positive amounts. */
  totalCredits: number;
  /** Absolute sum of negative amounts (positive number). */
  totalDebits: number;
  /** `credits - debits` (signed). */
  net: number;
  entryCount: number;
  /** 0..1 — fraction of entries with `isReconciled = true`. */
  reconciledRate: number;
}

/**
 * Aggregates over a flat list of bank entries (already filtered by the
 * caller — period, account, category, …). Counts a credit when amount
 * is `> 0` and a debit when amount is `< 0`. Rows with `amount === 0`
 * count toward `entryCount` but neither credits nor debits.
 */
export function computeBankStats(
  entries: ReadonlyArray<Pick<BankEntry, "amount" | "isReconciled">>,
): BankStats {
  let credits = 0;
  let debits = 0;
  let reconciled = 0;
  for (const e of entries) {
    if (e.amount > 0) credits += e.amount;
    else if (e.amount < 0) debits += -e.amount;
    if (e.isReconciled) reconciled += 1;
  }
  const total = entries.length;
  const reconciledRate = total === 0 ? 0 : reconciled / total;
  return {
    totalCredits: round2(credits),
    totalDebits: round2(debits),
    net: round2(credits - debits),
    entryCount: total,
    reconciledRate: Math.round(reconciledRate * 1000) / 1000,
  };
}

export interface CashStats {
  /** Sum of `kind = "in"` amounts. */
  totalIn: number;
  /** Sum of `kind = "out"` amounts. */
  totalOut: number;
  /** `in - out`. */
  net: number;
  entryCount: number;
}

/**
 * Aggregates over a flat list of cash entries. Validates `kind` against
 * the two known values ; any other value is silently skipped from the
 * totals (we trust route-level Zod validation but defend in depth).
 */
export function computeCashStats(
  entries: ReadonlyArray<Pick<CashEntry, "kind" | "amount">>,
): CashStats {
  let inSum = 0;
  let outSum = 0;
  for (const e of entries) {
    if (e.kind === "in") inSum += e.amount;
    else if (e.kind === "out") outSum += e.amount;
  }
  return {
    totalIn: round2(inSum),
    totalOut: round2(outSum),
    net: round2(inSum - outSum),
    entryCount: entries.length,
  };
}
