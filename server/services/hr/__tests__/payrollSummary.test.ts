import { describe, it, expect } from "vitest";
import {
  computePayrollSummary,
  DEFAULT_EMPLOYER_CHARGE_RATE,
} from "../payrollSummary";

describe("computePayrollSummary", () => {
  it("renvoie tout à zéro sur des entrées vides", () => {
    const r = computePayrollSummary([], [], []);
    expect(r).toEqual({
      activeHeadcount: 0,
      monthlyPayrollMass: 0,
      payslipCount: 0,
      totalGrossSalary: 0,
      totalNetSalary: 0,
      totalSocialCharges: 0,
      totalEmployerCharges: 0,
      hasEstimatedEmployerCharges: false,
      totalEmployerCost: 0,
      socialChargeRate: 0,
      averageGrossPerPayslip: 0,
      pendingAbsenceAlerts: 0,
    });
  });

  it("compte uniquement les employés actifs pour effectif et masse salariale", () => {
    const r = computePayrollSummary(
      [
        { isActive: true, salary: 2000 },
        { isActive: true, salary: 3000 },
        { isActive: false, salary: 9999 },
        { isActive: true, salary: null },
      ],
      [],
      [],
    );
    expect(r.activeHeadcount).toBe(3);
    expect(r.monthlyPayrollMass).toBe(5000);
  });

  it("agrège les payrolls (gross/net/charges sal)", () => {
    const r = computePayrollSummary(
      [],
      [
        { grossSalary: 2500, netSalary: 1900, socialCharges: 600, employerCharges: 300 },
        { grossSalary: 3000, netSalary: 2300, socialCharges: 700, employerCharges: 400 },
      ],
      [],
    );
    expect(r.payslipCount).toBe(2);
    expect(r.totalGrossSalary).toBe(5500);
    expect(r.totalNetSalary).toBe(4200);
    expect(r.totalSocialCharges).toBe(1300);
    expect(r.totalEmployerCharges).toBe(700);
    expect(r.hasEstimatedEmployerCharges).toBe(false);
    expect(r.totalEmployerCost).toBe(6200);
  });

  it("estime les charges patronales manquantes au taux par défaut", () => {
    const r = computePayrollSummary(
      [],
      [
        { grossSalary: 2000, netSalary: 1500, socialCharges: 500, employerCharges: null },
      ],
      [],
    );
    expect(r.totalEmployerCharges).toBeCloseTo(2000 * DEFAULT_EMPLOYER_CHARGE_RATE);
    expect(r.hasEstimatedEmployerCharges).toBe(true);
  });

  it("respecte un employerChargeRate custom (paramétrable via tenant.taxRules)", () => {
    const r = computePayrollSummary(
      [],
      [
        { grossSalary: 1000, netSalary: 800, socialCharges: 200, employerCharges: null },
      ],
      [],
      0.42,
    );
    expect(r.totalEmployerCharges).toBeCloseTo(420);
  });

  it("flag estimate=true dès qu'au moins une fiche manque la donnée", () => {
    const r = computePayrollSummary(
      [],
      [
        { grossSalary: 1000, netSalary: 800, socialCharges: 200, employerCharges: 100 },
        { grossSalary: 2000, netSalary: 1500, socialCharges: 500, employerCharges: null },
      ],
      [],
    );
    expect(r.hasEstimatedEmployerCharges).toBe(true);
  });

  it("calcule socialChargeRate en %", () => {
    const r = computePayrollSummary(
      [],
      [{ grossSalary: 2000, netSalary: 1500, socialCharges: 400, employerCharges: 0 }],
      [],
    );
    expect(r.socialChargeRate).toBe(20);
  });

  it("socialChargeRate = 0 si pas de gross (évite NaN)", () => {
    const r = computePayrollSummary([], [], []);
    expect(r.socialChargeRate).toBe(0);
  });

  it("averageGrossPerPayslip = 0 si pas de fiche", () => {
    const r = computePayrollSummary([{ isActive: true, salary: 1000 }], [], []);
    expect(r.averageGrossPerPayslip).toBe(0);
  });

  it("compte les absences non-approuvées comme alertes", () => {
    const r = computePayrollSummary(
      [],
      [],
      [
        { isApproved: false },
        { isApproved: true },
        { isApproved: false },
        { isApproved: false },
      ],
    );
    expect(r.pendingAbsenceAlerts).toBe(3);
  });

  it("traite socialCharges null comme 0", () => {
    const r = computePayrollSummary(
      [],
      [
        { grossSalary: 1000, netSalary: 800, socialCharges: null, employerCharges: 0 },
      ],
      [],
    );
    expect(r.totalSocialCharges).toBe(0);
  });
});
