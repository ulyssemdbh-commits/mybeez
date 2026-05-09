/**
 * AbsenceFormDialog — déclaration d'une absence/congé pour un employé.
 *
 * `endDate` optionnelle pour le type "retard" (single-day). `isApproved`
 * peut être coché à la création par un admin (raccourci) ou laissé à
 * false (sera approuvé via la liste).
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Modal,
  FieldText,
  FieldDate,
  FieldSelect,
  FieldTextarea,
  FieldCheckbox,
} from "./EmployeeFormDialog";
import type { Employee } from "./types";

const ABSENCE_TYPES = ["conge", "maladie", "retard", "absence", "formation"] as const;

const TYPE_LABELS: Record<string, string> = {
  conge: "Congé",
  maladie: "Maladie",
  retard: "Retard",
  absence: "Absence",
  formation: "Formation",
};

interface Props {
  tenantSlug: string;
  employee: Employee;
  onClose: () => void;
}

interface FormState {
  type: string;
  startDate: string;
  endDate: string;
  duration: string;
  reason: string;
  notes: string;
  isApproved: boolean;
}

function init(): FormState {
  return {
    type: "conge",
    startDate: "",
    endDate: "",
    duration: "",
    reason: "",
    notes: "",
    isApproved: false,
  };
}

function toPayload(s: FormState, employeeId: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    employeeId,
    type: s.type,
    startDate: s.startDate,
    isApproved: s.isApproved,
  };
  if (s.endDate.trim()) out.endDate = s.endDate;
  if (s.duration.trim()) out.duration = Number.parseFloat(s.duration);
  if (s.reason.trim()) out.reason = s.reason;
  if (s.notes.trim()) out.notes = s.notes;
  return out;
}

export function AbsenceFormDialog({ tenantSlug, employee, onClose }: Props) {
  const apiBase = `/api/management/${tenantSlug}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => init());

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/absences`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(form, employee.id)),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
    },
    onSuccess: () => {
      toast({ title: "Absence déclarée" });
      qc.invalidateQueries({ queryKey: [`${apiBase}/absences`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/employees/summary`] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form.startDate.trim()) {
      toast({ title: "Date de début requise", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      title={`Déclarer une absence — ${employee.firstName} ${employee.lastName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-absence">
        <div className="grid grid-cols-2 gap-3">
          <FieldSelect
            label="Type *"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={ABSENCE_TYPES.map((t) => t)}
          />
          <FieldText label="Durée (jours)" value={form.duration} onChange={(v) => setForm({ ...form, duration: v })} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldDate label="Date de début *" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
          <FieldDate label="Date de fin" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
        </div>
        <FieldText label="Motif" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} placeholder="Ex: Visite médicale, formation interne…" />
        <FieldTextarea label="Notes internes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        <FieldCheckbox label="Approuvée immédiatement" value={form.isApproved} onChange={(v) => setForm({ ...form, isApproved: v })} />
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
            data-testid="btn-submit-absence"
          >
            {mutation.isPending ? "…" : "Déclarer"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Le type sélectionné est : {TYPE_LABELS[form.type]}.
        </p>
      </form>
    </Modal>
  );
}
