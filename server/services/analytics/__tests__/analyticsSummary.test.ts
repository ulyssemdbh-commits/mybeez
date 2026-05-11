import { describe, it, expect } from "vitest";
import {
  round2,
  monthsInRange,
  bucketMonth,
  sumField,
  bucketSumByMonth,
  topByGroup,
  countByGroup,
} from "../analyticsSummary";

describe("round2", () => {
  it("arrondit à 2 décimales", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(123.456)).toBe(123.46);
    expect(round2(123.454)).toBe(123.45);
  });
});

describe("monthsInRange", () => {
  it("génère la liste inclusive YYYY-MM sur un range simple", () => {
    expect(monthsInRange("2026-01", "2026-04")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("traverse le saut d'année", () => {
    expect(monthsInRange("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("retourne un seul mois quand from === to", () => {
    expect(monthsInRange("2026-05", "2026-05")).toEqual(["2026-05"]);
  });

  it("retourne [] quand to < from", () => {
    expect(monthsInRange("2026-05", "2026-01")).toEqual([]);
  });

  it("accepte un YYYY-MM-DD complet et tronque au mois", () => {
    expect(monthsInRange("2026-01-15", "2026-03-30")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("retourne [] sur format invalide", () => {
    expect(monthsInRange("2026/01", "2026/04")).toEqual([]);
    expect(monthsInRange("2026-13", "2026-14")).toEqual([]);
    expect(monthsInRange("", "")).toEqual([]);
  });
});

describe("bucketMonth", () => {
  it("retourne le YYYY-MM tel quel sur input YYYY-MM", () => {
    expect(bucketMonth("2026-04")).toBe("2026-04");
  });

  it("tronque YYYY-MM-DD en YYYY-MM", () => {
    expect(bucketMonth("2026-04-15")).toBe("2026-04");
  });

  it("retourne null sur format invalide", () => {
    expect(bucketMonth("invalid")).toBeNull();
    expect(bucketMonth("2026")).toBeNull();
    expect(bucketMonth(null)).toBeNull();
    expect(bucketMonth(undefined)).toBeNull();
    expect(bucketMonth("2026-13-15")).toBeNull();
  });
});

describe("sumField", () => {
  it("somme un champ numérique", () => {
    const rows = [{ a: 10 }, { a: 20.5 }, { a: 30.2 }];
    expect(sumField(rows, (r) => r.a)).toBe(60.7);
  });

  it("ignore les null/undefined/NaN/Infinity (defense)", () => {
    const rows = [{ a: 10 }, { a: null }, { a: undefined }, { a: NaN }, { a: Infinity }, { a: 5 }];
    expect(sumField(rows, (r) => r.a as number | null | undefined)).toBe(15);
  });

  it("retourne 0 sur liste vide", () => {
    expect(sumField([], () => 0)).toBe(0);
  });
});

describe("bucketSumByMonth", () => {
  it("groupe et somme par mois (YYYY-MM-DD)", () => {
    const rows = [
      { date: "2026-04-15", amount: 100 },
      { date: "2026-04-30", amount: 50 },
      { date: "2026-05-01", amount: 200 },
    ];
    const map = bucketSumByMonth(rows, (r) => r.date, (r) => r.amount);
    expect(map.get("2026-04")).toBe(150);
    expect(map.get("2026-05")).toBe(200);
    expect(map.size).toBe(2);
  });

  it("accepte les dates déjà au format YYYY-MM (cf. payroll.month)", () => {
    const rows = [
      { period: "2026-04", amount: 1000 },
      { period: "2026-04", amount: 500 },
      { period: "2026-05", amount: 800 },
    ];
    const map = bucketSumByMonth(rows, (r) => r.period, (r) => r.amount);
    expect(map.get("2026-04")).toBe(1500);
    expect(map.get("2026-05")).toBe(800);
  });

  it("ignore les rows sans date valide", () => {
    const rows = [
      { date: "2026-04-15", amount: 100 },
      { date: "invalid", amount: 999 },
      { date: null, amount: 50 },
    ];
    const map = bucketSumByMonth(rows, (r) => r.date, (r) => r.amount);
    expect(map.get("2026-04")).toBe(100);
    expect(map.size).toBe(1);
  });
});

describe("topByGroup", () => {
  it("retourne le top N trié par total desc", () => {
    const rows = [
      { supplier: "A", amount: 100 },
      { supplier: "B", amount: 500 },
      { supplier: "A", amount: 200 },
      { supplier: "C", amount: 50 },
    ];
    const top = topByGroup(rows, (r) => r.supplier, (r) => r.amount, 2);
    expect(top).toEqual([
      { key: "B", total: 500, count: 1 },
      { key: "A", total: 300, count: 2 },
    ]);
  });

  it("respecte le tri stable (group key asc en cas de tie)", () => {
    const rows = [
      { k: "B", v: 100 },
      { k: "A", v: 100 },
      { k: "C", v: 100 },
    ];
    const top = topByGroup(rows, (r) => r.k, (r) => r.v, 5);
    expect(top.map((t) => t.key)).toEqual(["A", "B", "C"]);
  });

  it("ignore les rows avec key null/undefined", () => {
    const rows = [
      { k: "A", v: 100 },
      { k: null, v: 999 },
      { k: undefined, v: 999 },
    ];
    const top = topByGroup(rows, (r) => r.k as string | null | undefined, (r) => r.v, 5);
    expect(top.length).toBe(1);
    expect(top[0]!.key).toBe("A");
  });

  it("compte les occurrences même si l'amount est invalide", () => {
    const rows = [
      { k: "A", v: 100 },
      { k: "A", v: NaN },
      { k: "A", v: null },
    ];
    const top = topByGroup(rows, (r) => r.k, (r) => r.v as number | null, 5);
    expect(top[0]).toEqual({ key: "A", total: 100, count: 3 });
  });

  it("limit=0 retourne []", () => {
    const top = topByGroup([{ k: "A", v: 1 }], (r) => r.k, (r) => r.v, 0);
    expect(top).toEqual([]);
  });
});

describe("countByGroup", () => {
  it("compte les occurrences", () => {
    const rows = [
      { status: "paid" },
      { status: "pending" },
      { status: "paid" },
      { status: "late" },
    ];
    expect(countByGroup(rows, (r) => r.status)).toEqual({
      paid: 2,
      pending: 1,
      late: 1,
    });
  });

  it("bucketise les null/undefined sous __null__", () => {
    const rows = [{ status: "paid" }, { status: null }, { status: undefined }];
    expect(countByGroup(rows, (r) => r.status as string | null | undefined)).toEqual({
      paid: 1,
      __null__: 2,
    });
  });
});
