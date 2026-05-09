/**
 * PayslipFormDialog — création d'une fiche de paie pour un employé.
 *
 * V1 = saisie manuelle. La V2 ajoutera l'import-PDF avec parsing OCR
 * (`POST /payroll/import-pdf`) qui consommera `matchEmployee` (PR #72)
 * pour auto-créer/lier l'employé.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Modal,
  FieldText,
  FieldDate,
  FieldMonth,
  FieldTextarea,
  FieldCheckbox,
} from "./EmployeeFormDialog";
import type { Employee } from "./types";

interface Props {
  tenantSlug: string;
  employee: Employee;
  onClose: () => void;
}

interface FormState {
  month: string;
  grossSalary: string;
  netSalary: string;
  socialCharges: string;
  employerCharges: string;
  bonuses: string;
  overtime: string;
  deductions: string;
  isPaid: boolean;
  paidDate: string;
  notes: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function init(): FormState {
  return {
    month: currentMonth(),
    grossSalary: "",
    netSalary: "",
    socialCharges: "",
    employerCharges: "",
    bonuses: "",
    overtime: "",
    deductions: "",
    isPaid: false,
    paidDate: "",
    notes: "",
  };
}

function toPayload(s: FormState, employeeId: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    employeeId,
    month: s.month,
    grossSalary: Number.parseFloat(s.grossSalary),
    netSalary: Number.parseFloat(s.netSalary),
    isPaid: s.isPaid,
  };
  const optNum = (k: keyof FormState) => {
    const v = (s[k] as string).trim();
    if (v) out[k] = Number.parseFloat(v);
  };
  optNum("socialCharges");
  optNum("employerCharges");
  optNum("bonuses");
  optNum("overtime");
  optNum("deductions");
  if (s.paidDate.trim()) out.paidDate = s.paidDate;
  if (s.notes.trim()) out.notes = s.notes;
  return out;
}

export function PayslipFormDialog({ tenantSlug, employee, onClose }: Props) {
  const apiBase = `/api/management/${tenantSlug}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => init());

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/payroll`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(form, employee.id)),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (r.status === 409) {
          throw new Error("Une fiche existe déjà pour cet employé et ce mois");
        }
        throw new Error(data.error || "Erreur");
      }
    },
    onSuccess: () => {
      toast({ title: "Fiche créée" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/payroll`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form.month || !form.grossSalary || !form.netSalary) {
      toast({ title: "Période, brut et net requis", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      title={`Nouvelle fiche — ${employee.firstName} ${employee.lastName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-payslip">
        <div className="grid grid-cols-3 gap-3">
          <FieldMonth label="Période *" value={form.month} onChange={(v) => setForm({ ...form, month: v })} />
          <FieldText label="Brut (€) *" value={form.grossSalary} onChange={(v) => setForm({ ...form, grossSalary: v })} type="number" />
          <FieldText label="Net (€) *" value={form.netSalary} onChange={(v) => setForm({ ...form, netSalary: v })} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldText label="Charges salariales (€)" value={form.socialCharges} onChange={(v) => setForm({ ...form, socialCharges: v })} type="number" />
          <FieldText label="Charges patronales (€)" value={form.employerCharges} onChange={(v) => setForm({ ...form, employerCharges: v })} type="number" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FieldText label="Primes (€)" value={form.bonuses} onChange={(v) => setForm({ ...form, bonuses: v })} type="number" />
          <FieldText label="Heures sup (€)" value={form.overtime} onChange={(v) => setForm({ ...form, overtime: v })} type="number" />
          <FieldText label="Retenues (€)" value={form.deductions} onChange={(v) => setForm({ ...form, deductions: v })} type="number" />
        </div>
        <div className="flex items-center gap-4">
          <FieldCheckbox label="Payée" value={form.isPaid} onChange={(v) => setForm({ ...form, isPaid: v })} />
          {form.isPaid && (
            <div className="flex-1 max-w-xs">
              <FieldDate label="Date de paiement" value={form.paidDate} onChange={(v) => setForm({ ...form, paidDate: v })} />
            </div>
          )}
        </div>
        <FieldTextarea label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            data-testid="btn-submit-payslip"
          >
            {mutation.isPending ? "…" : "Créer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
