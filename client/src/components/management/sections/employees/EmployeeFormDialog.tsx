/**
 * EmployeeFormDialog — création / édition d'un employé.
 *
 * Champs alignés sur le schema `employees` (PR #72) : nom, poste,
 * contrat, dates, contact, SSN, rémunération (mensuelle ou horaire +
 * heures hebdo). Validation côté serveur via Zod (les erreurs `400`
 * remontent dans le toast).
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "./types";

const CONTRACT_TYPES = ["CDI", "CDD", "Interim", "Apprentissage", "Stage", "Extra"] as const;

type Mode = "create" | "edit";

interface Props {
  tenantSlug: string;
  mode: Mode;
  employee?: Employee;
  onClose: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  position: string;
  contractType: string;
  startDate: string;
  endDate: string;
  phone: string;
  email: string;
  socialSecurityNumber: string;
  salary: string;
  hourlyRate: string;
  weeklyHours: string;
  notes: string;
}

function init(employee?: Employee): FormState {
  return {
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    position: employee?.position ?? "",
    contractType: employee?.contractType ?? "CDI",
    startDate: employee?.startDate ?? "",
    endDate: employee?.endDate ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    socialSecurityNumber: employee?.socialSecurityNumber ?? "",
    salary: employee?.salary != null ? String(employee.salary) : "",
    hourlyRate: employee?.hourlyRate != null ? String(employee.hourlyRate) : "",
    weeklyHours: employee?.weeklyHours != null ? String(employee.weeklyHours) : "",
    notes: employee?.notes ?? "",
  };
}

function toPayload(s: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    firstName: s.firstName.trim(),
    lastName: s.lastName.trim(),
    contractType: s.contractType,
  };
  const opt = (k: keyof FormState) => {
    const v = (s[k] as string).trim();
    if (v) out[k] = v;
  };
  opt("position");
  opt("startDate");
  opt("endDate");
  opt("phone");
  opt("email");
  opt("socialSecurityNumber");
  opt("notes");
  if (s.salary.trim()) out.salary = Number.parseFloat(s.salary);
  if (s.hourlyRate.trim()) out.hourlyRate = Number.parseFloat(s.hourlyRate);
  if (s.weeklyHours.trim()) out.weeklyHours = Number.parseFloat(s.weeklyHours);
  return out;
}

export function EmployeeFormDialog({ tenantSlug, mode, employee, onClose }: Props) {
  const apiBase = `/api/management/${tenantSlug}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => init(employee));

  const mutation = useMutation({
    mutationFn: async () => {
      const url = mode === "create" ? `${apiBase}/employees` : `${apiBase}/employees/${employee!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: mode === "create" ? "Employé créé" : "Employé modifié" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "Prénom et nom requis", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal title={mode === "create" ? "Nouvel employé" : "Modifier l'employé"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-employee">
        <div className="grid grid-cols-2 gap-3">
          <FieldText label="Prénom *" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} testId="input-firstname" />
          <FieldText label="Nom *" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} testId="input-lastname" />
        </div>
        <FieldText label="Poste" value={form.position} onChange={(v) => setForm({ ...form, position: v })} placeholder="Ex: Cuisinier, Chef de salle…" />
        <div className="grid grid-cols-2 gap-3">
          <FieldSelect
            label="Type de contrat *"
            value={form.contractType}
            onChange={(v) => setForm({ ...form, contractType: v })}
            options={[...CONTRACT_TYPES]}
          />
          <FieldText label="N° Sécurité Sociale" value={form.socialSecurityNumber} onChange={(v) => setForm({ ...form, socialSecurityNumber: v })} placeholder="1 85 03 75 123 456 78" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldDate label="Début contrat" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
          <FieldDate label="Fin contrat" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldText label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />
          <FieldText label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FieldText label="Salaire mensuel (€)" value={form.salary} onChange={(v) => setForm({ ...form, salary: v })} type="number" />
          <FieldText label="Taux horaire (€)" value={form.hourlyRate} onChange={(v) => setForm({ ...form, hourlyRate: v })} type="number" />
          <FieldText label="Heures hebdo" value={form.weeklyHours} onChange={(v) => setForm({ ...form, weeklyHours: v })} type="number" />
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
            data-testid="btn-submit-employee"
          >
            {mutation.isPending ? "…" : mode === "create" ? "Créer" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =================== Reusable UI primitives (shared with Payslip / Absence dialogs) ===================

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-3 border-b dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FieldText({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-sm"
        data-testid={testId}
      />
    </label>
  );
}

export function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function FieldDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return <FieldText label={label} value={value} onChange={onChange} type="date" />;
}

export function FieldMonth({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return <FieldText label={label} value={value} onChange={onChange} type="month" />;
}

export function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-sm resize-y"
      />
    </label>
  );
}

export function FieldCheckbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}
