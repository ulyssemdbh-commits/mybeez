/**
 * CashSection — UI pour le module Caisse (espèces hors banque).
 * Backend : /api/management/:slug/cash-entries (PR #83).
 *
 * Générique : pas de colonnes resto-spécifiques (ticket-resto / Deliveroo).
 * Modèle simple : kind ('in'|'out') + amount toujours positif. Le sens vient
 * du kind. Stats in/out/net sur la période, filtres date + kind, CRUD direct.
 */

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Wallet,
  ArrowDown,
  ArrowUp,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/management/sharedUI/StatCard";

interface CashEntry {
  id: number;
  entryDate: string;
  kind: "in" | "out";
  amount: number;
  label: string;
  category: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string | null;
}

interface CashStats {
  totalIn: number;
  totalOut: number;
  net: number;
  entryCount: number;
}

interface Props {
  tenantSlug: string;
}

function formatEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function CashSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(firstOfMonthISO);
  const [to, setTo] = useState(todayISO);
  const [kindFilter, setKindFilter] = useState<"" | "in" | "out">("");
  const [editing, setEditing] = useState<CashEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CashEntry | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (kindFilter) p.set("kind", kindFilter);
    return p.toString();
  }, [from, to, kindFilter]);

  const entriesKey = ["/api/management", tenantSlug, "cash-entries", queryString] as const;
  const statsKey = ["/api/management", tenantSlug, "cash-entries", "stats", queryString] as const;

  const entriesQuery = useQuery<{ entries: CashEntry[] }>({
    queryKey: entriesKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/cash-entries?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const statsQuery = useQuery<CashStats>({
    queryKey: statsKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/cash-entries/stats?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/cash-entries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast({ title: "Opération supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/management", tenantSlug, "cash-entries"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const entries = entriesQuery.data?.entries ?? [];
  const stats = statsQuery.data;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Entrées" value={formatEUR(stats?.totalIn ?? 0)} icon={ArrowDown} color="green" testId="cash-stat-in" />
        <StatCard label="Sorties" value={formatEUR(stats?.totalOut ?? 0)} icon={ArrowUp} color="red" testId="cash-stat-out" />
        <StatCard label="Solde net période" value={formatEUR(stats?.net ?? 0)} icon={Wallet} color={stats && stats.net >= 0 ? "green" : "red"} testId="cash-stat-net" />
        <StatCard label="Opérations" value={`${stats?.entryCount ?? 0}`} icon={Hash} color="blue" testId="cash-stat-count" />
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900 rounded-2xl border p-3">
        <Field label="Du" className="w-36">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} data-testid="cash-from" />
        </Field>
        <Field label="Au" className="w-36">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} data-testid="cash-to" />
        </Field>
        <Field label="Type" className="w-36">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "" | "in" | "out")}
            className={inputCls}
            data-testid="cash-kind-filter"
          >
            <option value="">Tous</option>
            <option value="in">Entrées</option>
            <option value="out">Sorties</option>
          </select>
        </Field>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90"
            data-testid="cash-add"
          >
            <Plus className="w-4 h-4" />
            Ajouter une opération
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Libellé</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {entriesQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">Chargement…</td>
                </tr>
              ) : entriesQuery.error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-destructive">
                    {(entriesQuery.error as Error).message}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucune opération sur la période.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30" data-testid={`cash-row-${e.id}`}>
                    <td className="px-4 py-3 tabular-nums">{e.entryDate}</td>
                    <td className="px-4 py-3">
                      {e.label}
                      {e.reference && (
                        <span className="ml-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Hash className="w-3 h-3" />{e.reference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.kind === "in" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                          <ArrowDown className="w-3 h-3" /> Entrée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
                          <ArrowUp className="w-3 h-3" /> Sortie
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.category ?? "—"}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums font-medium",
                        e.kind === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {e.kind === "in" ? "+" : "-"}{formatEUR(e.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(e)}
                          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label="Modifier"
                          data-testid={`cash-edit-${e.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(e)}
                          className="p-2 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                          aria-label="Supprimer"
                          data-testid={`cash-delete-${e.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <CashEntryDialog
          tenantSlug={tenantSlug}
          entry={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/management", tenantSlug, "cash-entries"] });
            toast({ title: editing ? "Opération modifiée" : "Opération créée" });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cette opération ?"
          body="Suppression définitive (audit_log garde la trace)."
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            deleteMutation.mutate(id);
          }}
        />
      )}
    </section>
  );
}

function CashEntryDialog({
  tenantSlug,
  entry,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  entry: CashEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = entry !== null;
  const [form, setForm] = useState(() => ({
    entryDate: entry?.entryDate ?? todayISO(),
    kind: entry?.kind ?? "in",
    amount: entry?.amount.toString() ?? "",
    label: entry?.label ?? "",
    category: entry?.category ?? "",
    reference: entry?.reference ?? "",
    notes: entry?.notes ?? "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setError("Le libellé est requis");
      return;
    }
    const amount = Number.parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Le montant doit être un nombre positif");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        entryDate: form.entryDate,
        kind: form.kind,
        amount,
        label: form.label.trim(),
        category: form.category,
        reference: form.reference,
        notes: form.notes,
      };
      const url = isEdit
        ? `/api/management/${tenantSlug}/cash-entries/${entry!.id}`
        : `/api/management/${tenantSlug}/cash-entries`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-xl w-full my-8 p-6 sm:p-8 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">{isEdit ? "Modifier l'opération" : "Nouvelle opération"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" data-testid="cash-form">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Date *">
              <input
                type="date"
                required
                value={form.entryDate}
                onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Type *">
              <select
                required
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "in" | "out" }))}
                className={inputCls}
                data-testid="cash-form-kind"
              >
                <option value="in">Entrée (encaissement)</option>
                <option value="out">Sortie (décaissement)</option>
              </select>
            </Field>
          </div>
          <Field label="Libellé *">
            <input
              type="text"
              required
              maxLength={300}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className={inputCls}
              data-testid="cash-form-label"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Montant * (€, positif)">
              <input
                type="text"
                required
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="50,00"
                className={cn(inputCls, "tabular-nums")}
                data-testid="cash-form-amount"
              />
            </Field>
            <Field label="Catégorie">
              <input
                type="text"
                maxLength={60}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Référence">
            <input
              type="text"
              maxLength={120}
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              maxLength={2000}
              className={cn(inputCls, "resize-none")}
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              data-testid="cash-form-submit"
            >
              {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-1 block", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Annuler
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:opacity-90" data-testid="confirm-delete-cash">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
