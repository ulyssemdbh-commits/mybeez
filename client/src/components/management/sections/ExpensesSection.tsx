/**
 * ExpensesSection — UI pour le module Dépenses générales.
 *
 * Backend: /api/management/:slug/expenses (Sprint 2 module).
 *
 * Pattern miroir de PurchasesSection (#64) :
 *   - KPI strip (total, count, impayés, récurrentes)
 *   - filtres (période, statut, fournisseur, "récurrentes uniquement")
 *   - table triée par date desc
 *   - modal Add/Edit
 *   - confirmation soft-delete
 *   - action rapide "✓ Payée"
 *
 * Différences vs PurchasesSection :
 *   - 4ème filtre dédié "récurrentes uniquement"
 *   - colonne Catégorie en plus (les dépenses sont catégorisées par
 *     défaut : loyer, énergie, télécom, assurance…)
 *   - colonne Récurrence (icône Repeat sur les lignes recurring)
 *   - pas d'OCR (les dépenses récurrentes se saisissent une fois)
 */

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Search,
  Receipt,
  Wallet,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  XCircle,
  Repeat,
  TrendingDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PeriodFilter, StatCard, usePeriodFilter } from "@/components/management/sharedUI";

type PaymentStatus = "pending" | "paid" | "late" | "cancelled";
type RecurringFrequency = "monthly" | "quarterly" | "yearly";

interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string | null;
  isRecurring: boolean;
  recurringFrequency: RecurringFrequency | null;
  notes: string | null;
  supplierId: number | null;
  taxAmount: number | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  period: string | null;
  paymentStatus: PaymentStatus;
  paidDate: string | null;
  isActive: boolean;
}

interface SupplierOption {
  id: number;
  name: string;
}

interface ListResponse {
  expenses: Expense[];
}

interface SuppliersResponse {
  suppliers: { id: number; name: string; isActive: boolean }[];
}

interface StatsResponse {
  total: number;
  taxTotal: number;
  count: number;
  unpaidTotal: number;
  unpaidCount: number;
  recurringTotal: number;
  recurringCount: number;
}

const STATUS_META: Record<
  PaymentStatus,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "En attente",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    icon: CircleDashed,
  },
  paid: {
    label: "Payée",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  late: {
    label: "Retard",
    color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Annulée",
    color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    icon: XCircle,
  },
};

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  yearly: "Annuelle",
};

function formatEUR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDateFR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

interface Props {
  tenantSlug: string;
}

export function ExpensesSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const periodCtl = usePeriodFilter("year");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [supplierFilter, setSupplierFilter] = useState<"all" | number>("all");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);

  const baseKey = ["/api/management", tenantSlug, "expenses"] as const;

  const queryArgs = useMemo(
    () => ({
      from: periodCtl.period.from,
      to: periodCtl.period.to,
      status: statusFilter === "all" ? undefined : statusFilter,
      supplierId: supplierFilter === "all" ? undefined : supplierFilter,
      recurringOnly,
    }),
    [periodCtl.period.from, periodCtl.period.to, statusFilter, supplierFilter, recurringOnly],
  );

  const listQuery = useQuery<ListResponse>({
    queryKey: [...baseKey, "list", queryArgs],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("from", queryArgs.from);
      params.set("to", queryArgs.to);
      if (queryArgs.status) params.set("status", queryArgs.status);
      if (queryArgs.supplierId) params.set("supplierId", String(queryArgs.supplierId));
      if (queryArgs.recurringOnly) params.set("recurringOnly", "true");
      const res = await fetch(`/api/management/${tenantSlug}/expenses?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const statsQuery = useQuery<StatsResponse>({
    queryKey: [...baseKey, "stats", queryArgs.from, queryArgs.to],
    queryFn: async () => {
      const params = new URLSearchParams({ from: queryArgs.from, to: queryArgs.to });
      const res = await fetch(`/api/management/${tenantSlug}/expenses/stats?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("stats");
      return res.json();
    },
  });

  const suppliersQuery = useQuery<SuppliersResponse>({
    queryKey: ["/api/management", tenantSlug, "suppliers"],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/suppliers`, { credentials: "include" });
      if (!res.ok) throw new Error("suppliers");
      return res.json();
    },
  });

  const supplierOptions: SupplierOption[] = (suppliersQuery.data?.suppliers ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.name }));

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/expenses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Dépense archivée" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (e: Expense) => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/management/${tenantSlug}/expenses/${e.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid", paidDate: today }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Marquée payée" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const filtered = (listQuery.data?.expenses ?? []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.invoiceNumber?.toLowerCase().includes(q) ?? false) ||
      (e.notes?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Dépenses</h2>
          <p className="text-sm text-muted-foreground">
            Charges générales (loyer, énergie, assurances, abonnements, charges sociales).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          data-testid="expenses-add"
        >
          <Plus className="w-4 h-4" />
          Nouvelle dépense
        </button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingDown}
          label="Total dépenses"
          value={formatEUR(statsQuery.data?.total)}
          color="amber"
          testId="expenses-stat-total"
        />
        <StatCard
          icon={Receipt}
          label="Lignes"
          value={String(statsQuery.data?.count ?? 0)}
          color="blue"
          testId="expenses-stat-count"
        />
        <StatCard
          icon={Wallet}
          label="Impayé"
          value={formatEUR(statsQuery.data?.unpaidTotal)}
          color={statsQuery.data?.unpaidTotal ? "red" : "green"}
          testId="expenses-stat-unpaid"
          warning={
            statsQuery.data?.unpaidCount
              ? `${statsQuery.data.unpaidCount} dépense${statsQuery.data.unpaidCount > 1 ? "s" : ""} en attente`
              : undefined
          }
        />
        <StatCard
          icon={Repeat}
          label="Récurrentes"
          value={formatEUR(statsQuery.data?.recurringTotal)}
          color="purple"
          testId="expenses-stat-recurring"
          warning={
            statsQuery.data?.recurringCount
              ? `${statsQuery.data.recurringCount} ligne${statsQuery.data.recurringCount > 1 ? "s" : ""} récurrente${statsQuery.data.recurringCount > 1 ? "s" : ""}`
              : undefined
          }
        />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <PeriodFilter
          periodKey={periodCtl.periodKey}
          setPeriod={periodCtl.setPeriod}
          customFrom={periodCtl.customFrom}
          setCustomFrom={periodCtl.setCustomFrom}
          customTo={periodCtl.customTo}
          setCustomTo={periodCtl.setCustomTo}
        />
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Description, catégorie, n° pièce…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="expenses-search"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="expenses-filter-status"
          >
            <option value="all">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="paid">Payée</option>
            <option value="late">Retard</option>
            <option value="cancelled">Annulée</option>
          </select>
          <select
            value={String(supplierFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setSupplierFilter(v === "all" ? "all" : Number(v));
            }}
            className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 max-w-[220px]"
            data-testid="expenses-filter-supplier"
          >
            <option value="all">Tous fournisseurs</option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={recurringOnly}
              onChange={(e) => setRecurringOnly(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="expenses-filter-recurring"
            />
            Récurrentes uniquement
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Récurrence</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Chargement…
                  </td>
                </tr>
              ) : listQuery.error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-destructive">
                    {(listQuery.error as Error).message}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {search.trim() || statusFilter !== "all" || supplierFilter !== "all" || recurringOnly
                      ? "Aucune dépense ne correspond aux filtres."
                      : "Aucune dépense sur la période. Cliquez « Nouvelle dépense » pour commencer."}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const meta = STATUS_META[e.paymentStatus];
                  const StatusIcon = meta.icon;
                  return (
                    <tr
                      key={e.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`expense-row-${e.id}`}
                    >
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatDateFR(e.date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
                      <td className="px-4 py-3 font-medium">
                        {e.description}
                        {e.invoiceNumber && (
                          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {e.invoiceNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {formatEUR(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {e.isRecurring ? (
                          <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300">
                            <Repeat className="w-3 h-3" />
                            {e.recurringFrequency ? FREQUENCY_LABEL[e.recurringFrequency] : "Récurrente"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Ponctuelle</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
                            meta.color,
                          )}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {e.paymentStatus !== "paid" && e.paymentStatus !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => markPaidMutation.mutate(e)}
                              className="text-xs px-2 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                              data-testid={`expense-mark-paid-${e.id}`}
                              title="Marquer comme payée"
                            >
                              ✓ Payée
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            aria-label="Modifier"
                            data-testid={`expense-edit-${e.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(e)}
                            className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            aria-label="Archiver"
                            data-testid={`expense-delete-${e.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">
            {filtered.length} ligne{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <ExpenseDialog
          tenantSlug={tenantSlug}
          expense={editing}
          suppliers={supplierOptions}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: baseKey });
            toast({ title: editing ? "Dépense modifiée" : "Dépense créée" });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Archiver cette dépense ?"
          body={`${confirmDelete.description} (${formatEUR(confirmDelete.amount)}) sera marquée comme inactive. Elle reste consultable via le filtre « inclure archivés » et peut être réactivée.`}
          confirmLabel="Archiver"
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

// ========================== Form dialog ==========================

interface DialogProps {
  tenantSlug: string;
  expense: Expense | null;
  suppliers: SupplierOption[];
  onClose: () => void;
  onSaved: () => void;
}

function ExpenseDialog({ tenantSlug, expense, suppliers, onClose, onSaved }: DialogProps) {
  const isEdit = expense !== null;
  const [form, setForm] = useState(() => ({
    category: expense?.category ?? "",
    description: expense?.description ?? "",
    amount: expense?.amount != null ? String(expense.amount) : "",
    date: expense?.date ?? new Date().toISOString().slice(0, 10),
    paymentMethod: expense?.paymentMethod ?? "",
    isRecurring: expense?.isRecurring ?? false,
    recurringFrequency: expense?.recurringFrequency ?? "monthly",
    supplierId: expense?.supplierId ? String(expense.supplierId) : "",
    taxAmount: expense?.taxAmount != null ? String(expense.taxAmount) : "",
    dueDate: expense?.dueDate ?? "",
    invoiceNumber: expense?.invoiceNumber ?? "",
    period: expense?.period ?? "",
    paymentStatus: expense?.paymentStatus ?? "pending",
    paidDate: expense?.paidDate ?? "",
    notes: expense?.notes ?? "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.category.trim()) {
      setError("La catégorie est requise");
      return;
    }
    if (!form.description.trim()) {
      setError("La description est requise");
      return;
    }
    if (!form.amount || Number.isNaN(Number(form.amount))) {
      setError("Le montant est requis");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        category: form.category.trim(),
        description: form.description.trim(),
        amount: Number(form.amount),
        date: form.date,
        paymentMethod: form.paymentMethod || undefined,
        isRecurring: form.isRecurring,
        recurringFrequency: form.isRecurring ? form.recurringFrequency : null,
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : null,
        dueDate: form.dueDate || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        period: form.period.trim() || undefined,
        paymentStatus: form.paymentStatus,
        paidDate: form.paidDate || undefined,
        notes: form.notes.trim() || undefined,
      };

      const url = isEdit
        ? `/api/management/${tenantSlug}/expenses/${expense!.id}`
        : `/api/management/${tenantSlug}/expenses`;
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

  const inputCls =
    "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-2xl w-full my-8 p-6 sm:p-8 space-y-5"
        data-testid="expense-form"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">{isEdit ? "Modifier la dépense" : "Nouvelle dépense"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Identification
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Catégorie *">
              <input
                type="text"
                required
                maxLength={60}
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className={inputCls}
                placeholder="loyer, énergie, assurance…"
                data-testid="expense-category"
              />
            </Field>
            <Field label="Description *">
              <input
                type="text"
                required
                maxLength={500}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                className={inputCls}
                data-testid="expense-description"
              />
            </Field>
            <Field label="Date *">
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Période couverte (optionnel)">
              <input
                type="text"
                maxLength={7}
                value={form.period}
                onChange={(e) => update("period", e.target.value)}
                className={inputCls}
                placeholder="2026-05 ou 2026"
              />
            </Field>
            <Field label="Fournisseur (annuaire)">
              <select
                value={form.supplierId}
                onChange={(e) => update("supplierId", e.target.value)}
                className={inputCls}
              >
                <option value="">— Aucun —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="N° pièce (optionnel)">
              <input
                type="text"
                maxLength={60}
                value={form.invoiceNumber}
                onChange={(e) => update("invoiceNumber", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Montant
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Montant *">
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                className={cn(inputCls, "tabular-nums font-semibold")}
                data-testid="expense-amount"
              />
            </Field>
            <Field label="Dont TVA (si applicable)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.taxAmount}
                onChange={(e) => update("taxAmount", e.target.value)}
                className={cn(inputCls, "tabular-nums")}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Récurrence
          </legend>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => update("isRecurring", e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="expense-recurring"
            />
            <span>Cette dépense se répète régulièrement</span>
          </label>
          {form.isRecurring && (
            <Field label="Fréquence">
              <select
                value={form.recurringFrequency}
                onChange={(e) => update("recurringFrequency", e.target.value as typeof form.recurringFrequency)}
                className={inputCls}
              >
                <option value="monthly">Mensuelle</option>
                <option value="quarterly">Trimestrielle</option>
                <option value="yearly">Annuelle</option>
              </select>
            </Field>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Paiement
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Statut">
              <select
                value={form.paymentStatus}
                onChange={(e) => update("paymentStatus", e.target.value as typeof form.paymentStatus)}
                className={inputCls}
                data-testid="expense-payment-status"
              >
                <option value="pending">En attente</option>
                <option value="paid">Payée</option>
                <option value="late">Retard</option>
                <option value="cancelled">Annulée</option>
              </select>
            </Field>
            <Field label="Mode de paiement">
              <input
                type="text"
                maxLength={40}
                value={form.paymentMethod}
                onChange={(e) => update("paymentMethod", e.target.value)}
                className={inputCls}
                placeholder="prélèvement, virement, CB…"
              />
            </Field>
            <Field label="Échéance">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Date de paiement (si payée)">
              <input
                type="date"
                value={form.paidDate}
                onChange={(e) => update("paidDate", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Notes
          </legend>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            maxLength={2000}
            className={cn(inputCls, "resize-none")}
          />
        </fieldset>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
            data-testid="expense-submit"
          >
            {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-1 block", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }: ConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:opacity-90 transition-opacity"
            data-testid="confirm-delete-expense"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
