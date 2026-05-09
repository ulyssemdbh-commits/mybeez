/**
 * Types partagés UI module RH (PR #75). Mirror partiel du schema
 * Drizzle côté serveur — on duplique délibérément (plutôt qu'importer
 * `shared/schema/checklist.ts`) pour éviter de tirer le bundle drizzle
 * dans le client.
 */

export interface Employee {
  id: number;
  tenantId: number;
  firstName: string;
  lastName: string;
  position: string | null;
  contractType: string;
  startDate: string | null;
  endDate: string | null;
  phone: string | null;
  email: string | null;
  socialSecurityNumber: string | null;
  salary: number | null;
  hourlyRate: number | null;
  weeklyHours: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string | null;
}

export interface Payroll {
  id: number;
  tenantId: number;
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
  status: string;
  isPaid: boolean;
  paidDate: string | null;
  paidAt: string | null;
  pdfFileId: number | null;
  notes: string | null;
  createdAt: string | null;
}

export interface Absence {
  id: number;
  tenantId: number;
  employeeId: number;
  type: string;
  startDate: string;
  endDate: string | null;
  duration: number | null;
  reason: string | null;
  notes: string | null;
  status: string;
  isApproved: boolean;
  createdAt: string | null;
}

export interface FileRow {
  id: number;
  tenantId: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  fileType: string;
  supplier: string | null;
  description: string | null;
  fileDate: string | null;
  storagePath: string;
  emailedTo: string[] | null;
  employeeId: number | null;
  createdAt: string | null;
}

export interface EmployeeSummary {
  activeHeadcount: number;
  monthlyPayrollMass: number;
  payslipCount: number;
  totalGrossSalary: number;
  totalNetSalary: number;
  totalSocialCharges: number;
  totalEmployerCharges: number;
  hasEstimatedEmployerCharges: boolean;
  totalEmployerCost: number;
  socialChargeRate: number;
  averageGrossPerPayslip: number;
  pendingAbsenceAlerts: number;
}
