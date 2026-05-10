import { describe, it, expect } from "vitest";
import { PayslipFieldsSchema } from "../payslipParser";

describe("PayslipFieldsSchema", () => {
  it("accepte un bulletin complet valide", () => {
    const ok = PayslipFieldsSchema.parse({
      firstName: "Sophie",
      lastName: "Martin",
      socialSecurityNumber: "1 85 03 75 123 456 78",
      period: "2026-04",
      grossSalary: 2800.5,
      netSalary: 2210.4,
      socialCharges: 590.1,
      employerCharges: 1120.0,
      totalEmployerCost: 3920.5,
      bonuses: 200,
      overtime: 0,
      deductions: 50,
      paidDate: "2026-04-30",
    });
    expect(ok.firstName).toBe("Sophie");
    expect(ok.period).toBe("2026-04");
    expect(ok.netSalary).toBeCloseTo(2210.4);
  });

  it("accepte tous les champs à null", () => {
    const ok = PayslipFieldsSchema.parse({
      firstName: null,
      lastName: null,
      socialSecurityNumber: null,
      period: null,
      grossSalary: null,
      netSalary: null,
      socialCharges: null,
      employerCharges: null,
      totalEmployerCost: null,
      bonuses: null,
      overtime: null,
      deductions: null,
      paidDate: null,
    });
    expect(ok.grossSalary).toBeNull();
  });

  it("rejette une période au mauvais format (YYYY-MM-DD au lieu de YYYY-MM)", () => {
    expect(() =>
      PayslipFieldsSchema.parse({
        firstName: null,
        lastName: null,
        socialSecurityNumber: null,
        period: "2026-04-30",
        grossSalary: null,
        netSalary: null,
        socialCharges: null,
        employerCharges: null,
        totalEmployerCost: null,
        bonuses: null,
        overtime: null,
        deductions: null,
        paidDate: null,
      }),
    ).toThrow();
  });

  it("rejette une paidDate au format français", () => {
    expect(() =>
      PayslipFieldsSchema.parse({
        firstName: null,
        lastName: null,
        socialSecurityNumber: null,
        period: null,
        grossSalary: null,
        netSalary: null,
        socialCharges: null,
        employerCharges: null,
        totalEmployerCost: null,
        bonuses: null,
        overtime: null,
        deductions: null,
        paidDate: "30/04/2026",
      }),
    ).toThrow();
  });

  it("rejette un nombre non-fini (NaN, Infinity)", () => {
    expect(() =>
      PayslipFieldsSchema.parse({
        firstName: null,
        lastName: null,
        socialSecurityNumber: null,
        period: null,
        grossSalary: Number.NaN,
        netSalary: null,
        socialCharges: null,
        employerCharges: null,
        totalEmployerCost: null,
        bonuses: null,
        overtime: null,
        deductions: null,
        paidDate: null,
      }),
    ).toThrow();
  });

  it("rejette un objet incomplet (champ obligatoire manquant)", () => {
    expect(() =>
      PayslipFieldsSchema.parse({
        firstName: "Sophie",
        // les autres clés manquent
      }),
    ).toThrow();
  });
});
