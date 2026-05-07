import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { computePeriodDates, type PeriodKey } from "../period";

/**
 * Pin "now" to a fixed instant so the tests are deterministic. Picked
 * 2026-05-15 (mid-month, mid-Q2) — exercise quarter / month / last_month
 * boundaries cleanly.
 */
const FIXED_NOW = new Date(2026, 4, 15, 12, 0, 0); // months are 0-indexed → mai

describe("computePeriodDates", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("`all` covers from 2024-01-01 to end of current year", () => {
    const p = computePeriodDates("all");
    expect(p.from).toBe("2024-01-01");
    expect(p.to).toBe("2026-12-31");
    expect(p.label).toBe("Depuis le début");
    expect(p.key).toBe("all");
  });

  it("`year` covers the current calendar year", () => {
    const p = computePeriodDates("year");
    expect(p.from).toBe("2026-01-01");
    expect(p.to).toBe("2026-12-31");
    expect(p.year).toBe("2026");
    expect(p.label).toBe("Année 2026");
  });

  it("`quarter` covers the current quarter (Q2 = avril-juin)", () => {
    const p = computePeriodDates("quarter");
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-06-30");
    expect(p.label).toBe("T2 2026");
  });

  it("`last_month` covers the previous calendar month", () => {
    const p = computePeriodDates("last_month");
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-04-30");
    // label is locale-dependent; just check it contains "avril 2026"
    expect(p.label.toLowerCase()).toContain("avril");
    expect(p.label).toContain("2026");
  });

  it("`month` covers the current calendar month", () => {
    const p = computePeriodDates("month");
    expect(p.from).toBe("2026-05-01");
    expect(p.to).toBe("2026-05-31");
    expect(p.label.toLowerCase()).toContain("mai");
  });

  it("`custom` honours the user-supplied bounds", () => {
    const p = computePeriodDates("custom", "2026-03-15", "2026-03-31");
    expect(p.from).toBe("2026-03-15");
    expect(p.to).toBe("2026-03-31");
    expect(p.year).toBe("2026");
    expect(p.label).toBe("Personnalisé");
  });

  it("`custom` falls back to current month when bounds missing", () => {
    const p = computePeriodDates("custom");
    expect(p.from).toBe("2026-05-01");
    expect(p.to).toBe("2026-05-31");
  });

  it("returns all six period keys with the matching `key` field", () => {
    const keys: PeriodKey[] = ["all", "year", "quarter", "last_month", "month", "custom"];
    for (const k of keys) {
      expect(computePeriodDates(k).key).toBe(k);
    }
  });
});
