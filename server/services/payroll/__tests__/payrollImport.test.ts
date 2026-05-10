import { describe, it, expect } from "vitest";
import {
  payslipImportEligibility,
  buildPayrollValues,
  buildEmployeeValues,
  summarizeImportWarnings,
} from "../payrollImport";
import type { PayslipFields } from "../../parsing/payslipParser";

const completeFields: PayslipFields = {
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
};

describe("payslipImportEligibility", () => {
  it("accepte un bulletin complet", () => {
    expect(payslipImportEligibility(completeFields)).toEqual({ ok: true });
  });

  it("rejette si la période est null", () => {
    const r = payslipImportEligibility({ ...completeFields, period: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("période");
  });

  it("rejette si grossSalary est null", () => {
    const r = payslipImportEligibility({ ...completeFields, grossSalary: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("brut");
  });

  it("rejette si netSalary est null", () => {
    const r = payslipImportEligibility({ ...completeFields, netSalary: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("net");
  });
});

describe("buildPayrollValues", () => {
  it("mappe un bulletin complet vers les values d'insert", () => {
    const v = buildPayrollValues({ fields: completeFields, employeeId: 7, pdfFileId: 42 });
    expect(v).toEqual({
      employeeId: 7,
      month: "2026-04",
      grossSalary: 2800.5,
      netSalary: 2210.4,
      socialCharges: 590.1,
      employerCharges: 1120.0,
      totalEmployerCost: 3920.5,
      bonuses: 200,
      overtime: 0,
      deductions: 50,
      paidDate: "2026-04-30",
      isPaid: true,
      status: "paid",
      pdfFileId: 42,
      notes: null,
    });
  });

  it("met isPaid=false et status='draft' quand paidDate est null", () => {
    const v = buildPayrollValues({
      fields: { ...completeFields, paidDate: null },
      employeeId: 1,
      pdfFileId: null,
    });
    expect(v.isPaid).toBe(false);
    expect(v.status).toBe("draft");
    expect(v.pdfFileId).toBeNull();
  });

  it("préserve les nullités côté sources fragmentaires", () => {
    const v = buildPayrollValues({
      fields: {
        ...completeFields,
        socialCharges: null,
        employerCharges: null,
        totalEmployerCost: null,
        bonuses: null,
        overtime: null,
        deductions: null,
      },
      employeeId: 5,
      pdfFileId: 9,
    });
    expect(v.socialCharges).toBeNull();
    expect(v.employerCharges).toBeNull();
    expect(v.totalEmployerCost).toBeNull();
    expect(v.bonuses).toBeNull();
    expect(v.overtime).toBeNull();
    expect(v.deductions).toBeNull();
  });
});

describe("buildEmployeeValues", () => {
  it("retourne le stub avec SSN si first+last présents", () => {
    expect(buildEmployeeValues(completeFields)).toEqual({
      firstName: "Sophie",
      lastName: "Martin",
      socialSecurityNumber: "1 85 03 75 123 456 78",
    });
  });

  it("retourne null si firstName manque", () => {
    expect(buildEmployeeValues({ ...completeFields, firstName: null })).toBeNull();
  });

  it("retourne null si lastName manque", () => {
    expect(buildEmployeeValues({ ...completeFields, lastName: null })).toBeNull();
  });

  it("retourne null si firstName est blanc (pas seulement vide)", () => {
    expect(buildEmployeeValues({ ...completeFields, firstName: "   " })).toBeNull();
  });

  it("met SSN à null si parsé vide ou whitespace", () => {
    const r = buildEmployeeValues({ ...completeFields, socialSecurityNumber: "   " });
    expect(r?.socialSecurityNumber).toBeNull();
  });
});

describe("summarizeImportWarnings", () => {
  it("aucune warning sur un bulletin complet", () => {
    expect(summarizeImportWarnings(completeFields)).toEqual([]);
  });

  it("warns sur charges patronales manquantes", () => {
    const w = summarizeImportWarnings({ ...completeFields, employerCharges: null });
    expect(w.some((m) => m.toLowerCase().includes("charges patronales"))).toBe(true);
  });

  it("warns sur SSN manquant", () => {
    const w = summarizeImportWarnings({ ...completeFields, socialSecurityNumber: null });
    expect(w.some((m) => m.toLowerCase().includes("sécurité sociale"))).toBe(true);
  });

  it("cumule les warnings", () => {
    const w = summarizeImportWarnings({
      ...completeFields,
      employerCharges: null,
      totalEmployerCost: null,
      socialSecurityNumber: null,
    });
    expect(w.length).toBe(3);
  });
});
