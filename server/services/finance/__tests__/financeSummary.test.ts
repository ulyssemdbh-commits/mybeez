import { describe, it, expect } from "vitest";
import {
  computeBankAccountBalance,
  computeBankStats,
  computeCashStats,
} from "../financeSummary";

describe("computeBankAccountBalance", () => {
  it("retourne 0 / 0 / 0 sur un compte vide sans solde initial", () => {
    const r = computeBankAccountBalance({ id: 1, openingBalance: null }, []);
    expect(r).toEqual({
      accountId: 1,
      openingBalance: 0,
      netDelta: 0,
      currentBalance: 0,
      entryCount: 0,
    });
  });

  it("respecte le solde initial sans entries", () => {
    const r = computeBankAccountBalance({ id: 7, openingBalance: 1500.5 }, []);
    expect(r.openingBalance).toBe(1500.5);
    expect(r.netDelta).toBe(0);
    expect(r.currentBalance).toBe(1500.5);
  });

  it("additionne les amounts signés (crédits + et débits -)", () => {
    const r = computeBankAccountBalance({ id: 1, openingBalance: 1000 }, [
      { amount: 250 }, // crédit
      { amount: -75.5 }, // débit
      { amount: -120 },
    ]);
    expect(r.netDelta).toBe(54.5);
    expect(r.currentBalance).toBe(1054.5);
    expect(r.entryCount).toBe(3);
  });

  it("arrondit à 2 décimales", () => {
    const r = computeBankAccountBalance({ id: 1, openingBalance: 0.1 }, [
      { amount: 0.2 }, // 0.1 + 0.2 = 0.30000000000000004 en flottant
    ]);
    expect(r.currentBalance).toBe(0.3);
    expect(r.netDelta).toBe(0.2);
  });
});

describe("computeBankStats", () => {
  it("retourne les zéros sur une liste vide", () => {
    const r = computeBankStats([]);
    expect(r).toEqual({
      totalCredits: 0,
      totalDebits: 0,
      net: 0,
      entryCount: 0,
      reconciledRate: 0,
    });
  });

  it("split positifs vs négatifs en credits/debits absolus", () => {
    const r = computeBankStats([
      { amount: 1000, isReconciled: true },
      { amount: -250, isReconciled: false },
      { amount: -100.5, isReconciled: true },
      { amount: 50, isReconciled: false },
    ]);
    expect(r.totalCredits).toBe(1050);
    expect(r.totalDebits).toBe(350.5);
    expect(r.net).toBe(699.5);
    expect(r.entryCount).toBe(4);
  });

  it("calcule le taux de rapprochement (0..1, 3 décimales)", () => {
    const r = computeBankStats([
      { amount: 100, isReconciled: true },
      { amount: -50, isReconciled: true },
      { amount: -25, isReconciled: false },
    ]);
    // 2/3 = 0.667
    expect(r.reconciledRate).toBeCloseTo(0.667, 2);
  });

  it("ignore les entries à amount=0 dans crédits/débits mais les compte dans entryCount", () => {
    const r = computeBankStats([
      { amount: 0, isReconciled: true },
      { amount: 100, isReconciled: false },
    ]);
    expect(r.totalCredits).toBe(100);
    expect(r.totalDebits).toBe(0);
    expect(r.entryCount).toBe(2);
  });
});

describe("computeCashStats", () => {
  it("retourne les zéros sur une liste vide", () => {
    expect(computeCashStats([])).toEqual({
      totalIn: 0,
      totalOut: 0,
      net: 0,
      entryCount: 0,
    });
  });

  it("agrège in/out via le discriminateur kind", () => {
    const r = computeCashStats([
      { kind: "in", amount: 250 },
      { kind: "in", amount: 75.5 },
      { kind: "out", amount: 100 },
    ]);
    expect(r.totalIn).toBe(325.5);
    expect(r.totalOut).toBe(100);
    expect(r.net).toBe(225.5);
    expect(r.entryCount).toBe(3);
  });

  it("ignore les kind invalides dans les totaux mais les compte dans entryCount (defense en profondeur)", () => {
    // `kind` is `text` at the DB level, so a downstream caller could
    // technically smuggle a non-validated string in. We accept that and
    // simply do not include it in either total.
    const r = computeCashStats([
      { kind: "in", amount: 100 },
      { kind: "bogus", amount: 999 },
    ]);
    expect(r.totalIn).toBe(100);
    expect(r.totalOut).toBe(0);
    expect(r.entryCount).toBe(2);
  });
});
