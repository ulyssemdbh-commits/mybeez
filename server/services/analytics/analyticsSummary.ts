/**
 * Pure helpers for the Analytics module dashboards. The route handlers
 * fetch the rows once and pass them in so vitest can cover the maths
 * without a Postgres dependency.
 *
 * Design choices :
 *
 *   - **Compute on-demand** : no caching / materialised view. The
 *     volumes we expect (single-tenant scope, < 12 months × ~few
 *     thousand rows max) compute in milliseconds. A cache layer can
 *     land later (the `analytics` table is the staging spot) when a
 *     real perf signal warrants it.
 *
 *   - **Vertical-agnostic** : nothing here hardcodes restaurant
 *     concepts (no food cost %, no Z-ticket revenue). Ratios that
 *     require a "revenue" anchor are intentionally left out of V1
 *     because myBeez does not yet have a generic revenue table.
 *
 *   - **Round-to-cent** on sums for stable JSON output, same policy as
 *     `financeSummary`.
 */

const MONTH_RX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Round to 2 decimals for stable JSON. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns the inclusive list of `YYYY-MM` keys between `from` and `to`.
 * Both bounds accept either a `YYYY-MM` (preferred) or a `YYYY-MM-DD`
 * (date-truncated). Returns `[]` if the range is invalid.
 *
 * Caller use-case : pre-fill a monthly series with empty rows so the
 * UI can render a continuous chart even on months with no data.
 */
export function monthsInRange(from: string, to: string): string[] {
  const fm = parseMonth(from);
  const tm = parseMonth(to);
  if (!fm || !tm) return [];
  const start = fm.year * 12 + fm.month;
  const end = tm.year * 12 + tm.month;
  if (end < start) return [];
  const out: string[] = [];
  for (let v = start; v <= end; v++) {
    const year = Math.floor(v / 12);
    const month = v % 12;
    out.push(`${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}`);
  }
  return out;
}

function parseMonth(input: string): { year: number; month: number } | null {
  if (!input) return null;
  const m10 = input.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
  if (!m10) return null;
  const year = Number.parseInt(m10[1]!, 10);
  const month = Number.parseInt(m10[2]!, 10) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return null;
  return { year, month };
}

/**
 * Type-safe accessor : extract the YYYY-MM bucket key from a row's
 * date-like field. Accepts both YYYY-MM (e.g. payroll.month) and
 * YYYY-MM-DD (e.g. purchases.invoiceDate). Returns `null` on any other
 * shape so the caller can skip / count separately.
 */
export function bucketMonth(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (MONTH_RX.test(value)) return value;
  // Date YYYY-MM-DD : on extrait le mois ET on revalide via MONTH_RX
  // pour ne pas accepter "2026-13-15" qui matcherait la forme mais pas
  // la sémantique.
  const m = value.match(/^(\d{4}-\d{2})-\d{2}$/);
  if (!m) return null;
  return MONTH_RX.test(m[1]!) ? m[1]! : null;
}

/**
 * Sums a numeric field across a list, ignoring null/undefined and
 * non-finite values defensively. Returns the result rounded to cents.
 */
export function sumField<T>(rows: ReadonlyArray<T>, getter: (row: T) => number | null | undefined): number {
  let total = 0;
  for (const r of rows) {
    const v = getter(r);
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return round2(total);
}

/**
 * Bucket-then-sum : for each row, derive a YYYY-MM key from the date
 * field, accumulate the amount, and return a map keyed by month. Used
 * to drive the monthly series of the analytics dashboard.
 */
export function bucketSumByMonth<T>(
  rows: ReadonlyArray<T>,
  getDate: (row: T) => string | null | undefined,
  getAmount: (row: T) => number | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = bucketMonth(getDate(r));
    if (!key) continue;
    const amt = getAmount(r);
    if (typeof amt !== "number" || !Number.isFinite(amt)) continue;
    out.set(key, (out.get(key) ?? 0) + amt);
  }
  for (const [k, v] of out) out.set(k, round2(v));
  return out;
}

/**
 * Returns the top N entries grouped by `groupBy(row)`, summing
 * `sumBy(row)`. Stable order : descending sum, then ascending group
 * key for tie-breaking (deterministic across calls).
 */
export function topByGroup<T>(
  rows: ReadonlyArray<T>,
  groupBy: (row: T) => string | number | null | undefined,
  sumBy: (row: T) => number | null | undefined,
  limit: number,
): Array<{ key: string | number; total: number; count: number }> {
  const buckets = new Map<string | number, { total: number; count: number }>();
  for (const r of rows) {
    const key = groupBy(r);
    if (key === null || key === undefined) continue;
    const amt = sumBy(r);
    const existing = buckets.get(key) ?? { total: 0, count: 0 };
    existing.count += 1;
    if (typeof amt === "number" && Number.isFinite(amt)) existing.total += amt;
    buckets.set(key, existing);
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, total: round2(v.total), count: v.count }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return String(a.key).localeCompare(String(b.key));
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}

/**
 * Counts rows by a categorical field (e.g. paymentStatus) and returns
 * a {key: count} map. Null/undefined keys are bucketed under `__null__`.
 */
export function countByGroup<T>(
  rows: ReadonlyArray<T>,
  groupBy: (row: T) => string | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = groupBy(r) ?? "__null__";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
