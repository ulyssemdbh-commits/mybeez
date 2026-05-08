/**
 * Pure helpers to aggregate payroll data into the dashboard cards
 * shown on the RH page (capture utilisateur 2026-05-08) :
 *   - Effectif actif
 *   - Nb fiches de paie
 *   - Alertes (= absences non approuvées)
 *   - Masse salariale / mois
 *   - Synthèse financière (total brut, net, charges sal, charges pat,
 *     coût employeur, ratio, moyenne par fiche)
 *
 * Calculs identiques à ulysseclaude `GestionRHTab.tsx` mais isolés ici
 * pour pouvoir les tester et — surtout — pouvoir les exposer côté API
 * future (V2) sans dupliquer la logique au front.
 */

export interface EmployeeForSummary {
  isActive: boolean;
  salary: number | null;
}

export interface PayrollForSummary {
  grossSalary: number;
  netSalary: number;
  socialCharges: number | null;
  employerCharges: number | null;
}

export interface AbsenceForSummary {
  isApproved: boolean;
}

export interface PayrollSummary {
  /** Number of `isActive` employees. */
  activeHeadcount: number;
  /** Sum of `salary` for active employees only. Null entries treated as 0. */
  monthlyPayrollMass: number;
  /** Number of payroll rows in scope. */
  payslipCount: number;
  totalGrossSalary: number;
  totalNetSalary: number;
  totalSocialCharges: number;
  /** If a row's `employerCharges` is null we estimate as `gross × employerChargeRate`. */
  totalEmployerCharges: number;
  /** True iff at least one row needed the estimate. UI prefixes totals with `~`. */
  hasEstimatedEmployerCharges: boolean;
  /** gross + employerCharges (estimated where needed). */
  totalEmployerCost: number;
  /** Ratio totalSocialCharges / totalGrossSalary × 100. 0 if no gross. */
  socialChargeRate: number;
  /** Average gross per payroll row. 0 if no payrolls. */
  averageGrossPerPayslip: number;
  /** Count of absences with `isApproved=false`. */
  pendingAbsenceAlerts: number;
}

/**
 * Default employer-charge estimate when the parsed PDF didn't expose
 * the amount. 13% is the rate ulysseclaude hardcoded; myBeez paramètres
 * via `tenants.taxRules.employerChargeRate` and falls back to this.
 */
export const DEFAULT_EMPLOYER_CHARGE_RATE = 0.13;

export function computePayrollSummary(
  employees: ReadonlyArray<EmployeeForSummary>,
  payrolls: ReadonlyArray<PayrollForSummary>,
  absences: ReadonlyArray<AbsenceForSummary>,
  employerChargeRate: number = DEFAULT_EMPLOYER_CHARGE_RATE,
): PayrollSummary {
  const activeEmps = employees.filter((e) => e.isActive);
  const activeHeadcount = activeEmps.length;
  const monthlyPayrollMass = activeEmps.reduce((acc, e) => acc + (e.salary ?? 0), 0);

  const payslipCount = payrolls.length;
  let totalGrossSalary = 0;
  let totalNetSalary = 0;
  let totalSocialCharges = 0;
  let totalEmployerCharges = 0;
  let hasEstimatedEmployerCharges = false;

  for (const p of payrolls) {
    totalGrossSalary += p.grossSalary;
    totalNetSalary += p.netSalary;
    totalSocialCharges += p.socialCharges ?? 0;
    if (p.employerCharges == null) {
      totalEmployerCharges += p.grossSalary * employerChargeRate;
      hasEstimatedEmployerCharges = true;
    } else {
      totalEmployerCharges += p.employerCharges;
    }
  }

  const totalEmployerCost = totalGrossSalary + totalEmployerCharges;
  const socialChargeRate =
    totalGrossSalary > 0 ? (totalSocialCharges / totalGrossSalary) * 100 : 0;
  const averageGrossPerPayslip = payslipCount > 0 ? totalGrossSalary / payslipCount : 0;

  const pendingAbsenceAlerts = absences.filter((a) => !a.isApproved).length;

  return {
    activeHeadcount,
    monthlyPayrollMass,
    payslipCount,
    totalGrossSalary,
    totalNetSalary,
    totalSocialCharges,
    totalEmployerCharges,
    hasEstimatedEmployerCharges,
    totalEmployerCost,
    socialChargeRate,
    averageGrossPerPayslip,
    pendingAbsenceAlerts,
  };
}
