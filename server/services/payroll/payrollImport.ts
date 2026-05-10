/**
 * Payroll PDF import — pure helpers consumed by the
 * `POST /api/management/:slug/payroll/import-pdf` and `/reparse-all`
 * routes. The orchestration (DB queries, R2 upload, audit log) lives in
 * the route handler; only the deterministic transformations live here so
 * vitest can cover them without touching the network or the DB.
 *
 * Three helpers :
 *   - `payslipImportEligibility(fields)` : returns `ok` only if the
 *     parsed bulletin has the minimum needed to insert a payroll row
 *     (period YYYY-MM + grossSalary + netSalary). Otherwise returns the
 *     error reason in French so the route can surface it 1:1.
 *   - `buildPayrollValues({fields, employeeId, pdfFileId})` : maps
 *     `PayslipFields` → values ready for `db.insert(payroll)`.
 *   - `buildEmployeeValues(fields)` : when the import auto-creates an
 *     employee, this maps the parsed identity to a row stub the route
 *     can extend with `tenantId`.
 *   - `summarizeImportWarnings(fields)` : non-blocking issues to surface
 *     to the UI (employer charges missing, totalEmployerCost null, …).
 */

import type { PayslipFields } from "../parsing/payslipParser";

export interface PayrollInsertValues {
  employeeId: number;
  month: string;
  grossSalary: number;
  netSalary: number;
  socialCharges: number | null;
  employerCharges: number | null;
  totalEmployerCost: number | null;
  bonuses: number | null;
  overtime: number | null;
  deductions: number | null;
  paidDate: string | null;
  isPaid: boolean;
  status: string;
  pdfFileId: number | null;
  notes: string | null;
}

export interface EmployeeInsertStub {
  firstName: string;
  lastName: string;
  socialSecurityNumber: string | null;
}

export type EligibilityResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * The parsed payslip is "good enough" to insert when at minimum we have
 * a period (YYYY-MM) and the two salary anchors (gross + net). Without
 * those three the payroll row would be a stub and the UNIQUE
 * (tenant, employee, month) constraint would not even hold.
 */
export function payslipImportEligibility(fields: PayslipFields): EligibilityResult {
  if (!fields.period) {
    return { ok: false, error: "Période non détectée sur le bulletin (YYYY-MM requis)." };
  }
  if (fields.grossSalary === null) {
    return { ok: false, error: "Salaire brut non détecté sur le bulletin." };
  }
  if (fields.netSalary === null) {
    return { ok: false, error: "Salaire net non détecté sur le bulletin." };
  }
  return { ok: true };
}

/**
 * Maps a parsed payslip + context to the values the route inserts into
 * `payroll`. Caller is expected to have already validated eligibility
 * (see `payslipImportEligibility`) and supplies a resolved
 * `employeeId` and the `pdfFileId` of the archived bulletin.
 *
 * `tenantId` is intentionally NOT in the return shape — the route adds
 * it at insert time so this helper stays trivially testable.
 */
export function buildPayrollValues(args: {
  fields: PayslipFields;
  employeeId: number;
  pdfFileId: number | null;
}): PayrollInsertValues {
  const { fields, employeeId, pdfFileId } = args;
  // Eligibility above guarantees these three are non-null.
  const period = fields.period!;
  const grossSalary = fields.grossSalary!;
  const netSalary = fields.netSalary!;

  // If the parser saw a paidDate, treat the row as already paid. The
  // user can correct via PATCH if the bulletin merely *predicts* a
  // payment date that hasn't happened yet.
  const isPaid = fields.paidDate !== null;

  return {
    employeeId,
    month: period,
    grossSalary,
    netSalary,
    socialCharges: fields.socialCharges,
    employerCharges: fields.employerCharges,
    totalEmployerCost: fields.totalEmployerCost,
    bonuses: fields.bonuses,
    overtime: fields.overtime,
    deductions: fields.deductions,
    paidDate: fields.paidDate,
    isPaid,
    status: isPaid ? "paid" : "draft",
    pdfFileId,
    notes: null,
  };
}

/**
 * Auto-create stub for an employee when the import was asked to create
 * missing staff (`autoCreateEmployee=true` on the route). Returns null
 * if the parser did not recover both first and last name — we never
 * create an employee row from half an identity.
 */
export function buildEmployeeValues(fields: PayslipFields): EmployeeInsertStub | null {
  const firstName = fields.firstName?.trim();
  const lastName = fields.lastName?.trim();
  if (!firstName || !lastName) return null;
  return {
    firstName,
    lastName,
    socialSecurityNumber: fields.socialSecurityNumber?.trim() || null,
  };
}

/**
 * Non-blocking issues worth surfacing in the route response so the UI
 * can hint at fields the user might want to complete by hand. The list
 * is intentionally short — we don't want to drown the user in warnings
 * about every null number.
 */
export function summarizeImportWarnings(fields: PayslipFields): string[] {
  const warnings: string[] = [];
  if (fields.employerCharges === null) {
    warnings.push("Charges patronales non extraites — le dashboard utilisera l'estimation par défaut.");
  }
  if (fields.totalEmployerCost === null) {
    warnings.push("Coût total employeur non extrait.");
  }
  if (fields.socialSecurityNumber === null) {
    warnings.push("Numéro de sécurité sociale non détecté — le rapprochement futur sera moins précis.");
  }
  return warnings;
}
