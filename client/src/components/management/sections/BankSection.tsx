/**
 * BankSection — UI pour les modules Banque (comptes + opérations).
 * Backend : /api/management/:slug/bank-accounts + /bank-entries (PR #83).
 *
 * Un seul écran avec 2 tabs internes "Comptes" / "Opérations" :
 *   - Comptes : table CRUD avec solde calculé (openingBalance + Σentries).
 *   - Opérations : table CRUD signée (négatif=débit/positif=crédit),
 *     stats credits/debits/net/reconciledRate sur la période sélectionnée,
 *     filtres date + compte + status rapprochement.
 */

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Landmark,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/management/sharedUI/StatCard";

interface BankAccount {
  id: number;
  name: string;
  bankName: string | null;
  iban: string | null;
  openingBalance: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string | null;
}

interface BankAccountBalance {
  accountId: number;
  openingBalance: number;
  netDelta: number;
  currentBalance: number;
  entryCount: number;
}

interface BankEntry {
  id: number;
  bankAccountId: number;
  entryDate: string;
  label: string;
  amount: number;
  balance: number | null;
  category: string | null;
  reference: string | null;
  isReconciled: boolean;
  purchaseId: number | null;
  expenseId: number | null;
  payrollId: number | null;
  notes: string | null;
  createdAt: string | null;
}

interface BankStats {
  totalCredits: number;
  totalDebits: number;
  net: number;
  entryCount: number;
  reconciledRate: number;
}

interface Props {
  tenantSlug: string;
}

function formatEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

export function BankSection({ tenantSlug }: Props) {
  const [tab, setTab] = useState<"accounts" | "entries">("accounts");

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1 border-b">
        <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} testId="bank-tab-accounts">
          Comptes
        </TabButton>
        <TabButton active={tab === "entries"} onClick={() => setTab("entries")} testId="bank-tab-entries">
          Opérations
        </TabButton>
      </div>
      {tab === "accounts" ? (
        <BankAccountsView tenantSlug={tenantSlug} />
      ) : (
        <BankEntriesView tenantSlug={tenantSlug} />
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Bank Accounts
// ============================================================================

function BankAccountsView({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BankAccount | null>(null);

  const baseKey = ["/api/management", tenantSlug, "bank-accounts"] as const;
  const queryKey = [...baseKey, { includeInactive }];

  const listQuery = useQuery<{ accounts: BankAccount[] }>({
    queryKey,
    queryFn: async () => {
      const url = `/api/management/${tenantSlug}/bank-accounts${includeInactive ? "?includeInactive=true" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-accounts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast({ title: "Compte archivé" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const accounts = listQuery.data?.accounts ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {listQuery.data ? `${accounts.length} compte${accounts.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 accent-primary"
              data-testid="bank-accounts-include-inactive"
            />
            Afficher les archivés
          </label>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            data-testid="bank-accounts-add"
          >
            <Plus className="w-4 h-4" />
            Ajouter un compte
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Banque</th>
                <th className="px-4 py-3">IBAN</th>
                <th className="px-4 py-3 text-right">Solde courant</th>
                <th className="px-4 py-3 text-right">Opérations</th>
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
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun compte. Ajoutez le premier !
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <BankAccountRow
                    key={a.id}
                    account={a}
                    tenantSlug={tenantSlug}
                    onEdit={() => setEditing(a)}
                    onArchive={() => setConfirmDelete(a)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <BankAccountDialog
          tenantSlug={tenantSlug}
          account={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: baseKey });
            toast({ title: editing ? "Compte modifié" : "Compte créé" });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Archiver ce compte ?"
          body={`${confirmDelete.name} sera marqué comme inactif. Ses opérations restent consultables.`}
          confirmLabel="Archiver"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            deleteMutation.mutate(id);
          }}
        />
      )}
    </div>
  );
}

function BankAccountRow({
  account,
  tenantSlug,
  onEdit,
  onArchive,
}: {
  account: BankAccount;
  tenantSlug: string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const detailQuery = useQuery<{ account: BankAccount; balance: BankAccountBalance }>({
    queryKey: ["/api/management", tenantSlug, "bank-accounts", account.id, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-accounts/${account.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const bal = detailQuery.data?.balance;
  return (
    <tr
      className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/30", !account.isActive && "opacity-60")}
      data-testid={`bank-account-row-${account.id}`}
    >
      <td className="px-4 py-3 font-medium">{account.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{account.bankName ?? "—"}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{account.iban ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums font-medium">
        {bal ? formatEUR(bal.currentBalance) : "…"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{bal?.entryCount ?? "…"}</td>
      <td className="px-4 py-3">
        {account.isActive ? (
          <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            Actif
          </span>
        ) : (
          <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Archivé
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Modifier"
            data-testid={`bank-account-edit-${account.id}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          {account.isActive && (
            <button
              type="button"
              onClick={onArchive}
              className="p-2 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              aria-label="Archiver"
              data-testid={`bank-account-delete-${account.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function BankAccountDialog({
  tenantSlug,
  account,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = account !== null;
  const [form, setForm] = useState(() => ({
    name: account?.name ?? "",
    bankName: account?.bankName ?? "",
    iban: account?.iban ?? "",
    openingBalance: account?.openingBalance?.toString() ?? "",
    notes: account?.notes ?? "",
    isActive: account?.isActive ?? true,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du compte est requis");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        bankName: form.bankName,
        iban: form.iban,
        notes: form.notes,
      };
      if (form.openingBalance.trim()) {
        const v = Number.parseFloat(form.openingBalance.replace(",", "."));
        if (Number.isFinite(v)) payload.openingBalance = v;
      }
      if (isEdit) payload.isActive = form.isActive;
      const url = isEdit
        ? `/api/management/${tenantSlug}/bank-accounts/${account!.id}`
        : `/api/management/${tenantSlug}/bank-accounts`;
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
    <ModalShell title={isEdit ? "Modifier le compte" : "Nouveau compte"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="bank-account-form">
        <Field label="Nom *">
          <input
            type="text"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
            data-testid="bank-account-name"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Banque">
            <input
              type="text"
              maxLength={120}
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Solde initial (€)">
            <input
              type="text"
              inputMode="decimal"
              value={form.openingBalance}
              onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
              placeholder="0,00"
              className={cn(inputCls, "tabular-nums")}
            />
          </Field>
        </div>
        <Field label="IBAN">
          <input
            type="text"
            maxLength={60}
            value={form.iban}
            onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
            className={cn(inputCls, "font-mono")}
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
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            Actif (décocher pour archiver)
          </label>
        )}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        )}
        <FormFooter onCancel={onClose} submitting={submitting} isEdit={isEdit} testId="bank-account-submit" />
      </form>
    </ModalShell>
  );
}

// ============================================================================
// Bank Entries
// ============================================================================

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function BankEntriesView({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(firstOfMonthISO);
  const [to, setTo] = useState(todayISO);
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [reconciledFilter, setReconciledFilter] = useState<"" | "true" | "false">("");
  const [editing, setEditing] = useState<BankEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BankEntry | null>(null);

  const accountsQuery = useQuery<{ accounts: BankAccount[] }>({
    queryKey: ["/api/management", tenantSlug, "bank-accounts"],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-accounts`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const accounts = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (accountFilter) p.set("accountId", accountFilter);
    if (reconciledFilter) p.set("reconciled", reconciledFilter);
    return p.toString();
  }, [from, to, accountFilter, reconciledFilter]);

  const entriesKey = ["/api/management", tenantSlug, "bank-entries", queryString] as const;
  const statsKey = ["/api/management", tenantSlug, "bank-entries", "stats", queryString] as const;

  const entriesQuery = useQuery<{ entries: BankEntry[] }>({
    queryKey: entriesKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-entries?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const statsQuery = useQuery<BankStats>({
    queryKey: statsKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-entries/stats?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/bank-entries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast({ title: "Opération supprimée" });
      queryClient.invalidateQueries({ queryKey: ["/api/management", tenantSlug, "bank-entries"] });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const entries = entriesQuery.data?.entries ?? [];
  const stats = statsQuery.data;
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Crédits" value={formatEUR(stats?.totalCredits ?? 0)} icon={ArrowDown} color="green" testId="bank-stat-credits" />
        <StatCard label="Débits" value={formatEUR(stats?.totalDebits ?? 0)} icon={ArrowUp} color="red" testId="bank-stat-debits" />
        <StatCard label="Solde net période" value={formatEUR(stats?.net ?? 0)} icon={Landmark} color={stats && stats.net >= 0 ? "green" : "red"} testId="bank-stat-net" />
        <StatCard label="Rapprochées" value={`${stats ? formatPct(stats.reconciledRate) : "—"} (${stats?.entryCount ?? 0})`} icon={CheckCircle2} color="blue" testId="bank-stat-reconciled" />
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900 rounded-2xl border p-3">
        <Field label="Du" className="w-36">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} data-testid="bank-entries-from" />
        </Field>
        <Field label="Au" className="w-36">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} data-testid="bank-entries-to" />
        </Field>
        <Field label="Compte" className="w-44">
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={inputCls} data-testid="bank-entries-account">
            <option value="">Tous</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Rapprochement" className="w-40">
          <select
            value={reconciledFilter}
            onChange={(e) => setReconciledFilter(e.target.value as "" | "true" | "false")}
            className={inputCls}
            data-testid="bank-entries-reconciled-filter"
          >
            <option value="">Tous</option>
            <option value="true">Rapprochées</option>
            <option value="false">Non rapprochées</option>
          </select>
        </Field>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            data-testid="bank-entries-add"
            title={accounts.length === 0 ? "Créez d'abord un compte" : undefined}
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
                <th className="px-4 py-3">Compte</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Rapprochée</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {entriesQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">Chargement…</td>
                </tr>
              ) : entriesQuery.error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-destructive">
                    {(entriesQuery.error as Error).message}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucune opération sur la période.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30" data-testid={`bank-entry-row-${e.id}`}>
                    <td className="px-4 py-3 tabular-nums">{e.entryDate}</td>
                    <td className="px-4 py-3">
                      {e.label}
                      {e.reference && (
                        <span className="ml-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Hash className="w-3 h-3" />{e.reference}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{accountById.get(e.bankAccountId)?.name ?? `#${e.bankAccountId}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.category ?? "—"}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums font-medium",
                        e.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatEUR(e.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {e.isReconciled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Oui
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Non</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(e)}
                          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          aria-label="Modifier"
                          data-testid={`bank-entry-edit-${e.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(e)}
                          className="p-2 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                          aria-label="Supprimer"
                          data-testid={`bank-entry-delete-${e.id}`}
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
        <BankEntryDialog
          tenantSlug={tenantSlug}
          entry={editing}
          accounts={accounts.filter((a) => a.isActive || a.id === editing?.bankAccountId)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/management", tenantSlug, "bank-entries"] });
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
    </div>
  );
}

function BankEntryDialog({
  tenantSlug,
  entry,
  accounts,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  entry: BankEntry | null;
  accounts: BankAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = entry !== null;
  const [form, setForm] = useState(() => ({
    bankAccountId: entry?.bankAccountId.toString() ?? accounts[0]?.id.toString() ?? "",
    entryDate: entry?.entryDate ?? todayISO(),
    label: entry?.label ?? "",
    amount: entry?.amount.toString() ?? "",
    category: entry?.category ?? "",
    reference: entry?.reference ?? "",
    isReconciled: entry?.isReconciled ?? false,
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
    const accountId = Number.parseInt(form.bankAccountId, 10);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      setError("Choisissez un compte");
      return;
    }
    const amount = Number.parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amount)) {
      setError("Le montant est invalide");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        bankAccountId: accountId,
        entryDate: form.entryDate,
        label: form.label.trim(),
        amount,
        category: form.category,
        reference: form.reference,
        isReconciled: form.isReconciled,
        notes: form.notes,
      };
      const url = isEdit
        ? `/api/management/${tenantSlug}/bank-entries/${entry!.id}`
        : `/api/management/${tenantSlug}/bank-entries`;
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
    <ModalShell title={isEdit ? "Modifier l'opération" : "Nouvelle opération"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="bank-entry-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Compte *">
            <select
              required
              value={form.bankAccountId}
              onChange={(e) => setForm((f) => ({ ...f, bankAccountId: e.target.value }))}
              className={inputCls}
              data-testid="bank-entry-account"
            >
              <option value="">— Choisir —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Date *">
            <input
              type="date"
              required
              value={form.entryDate}
              onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              className={inputCls}
            />
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
            data-testid="bank-entry-label"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Montant * (€, négatif = débit)">
            <input
              type="text"
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="-150,00"
              className={cn(inputCls, "tabular-nums")}
              data-testid="bank-entry-amount"
            />
          </Field>
          <Field label="Catégorie">
            <input
              type="text"
              maxLength={60}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="loyer, urssaf…"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Référence (chèque, virement, etc.)">
          <input
            type="text"
            maxLength={120}
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            className={inputCls}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.isReconciled}
            onChange={(e) => setForm((f) => ({ ...f, isReconciled: e.target.checked }))}
            className="w-4 h-4 accent-primary"
            data-testid="bank-entry-reconciled"
          />
          Rapprochée avec une opération métier
        </label>
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
        <FormFooter onCancel={onClose} submitting={submitting} isEdit={isEdit} testId="bank-entry-submit" />
      </form>
    </ModalShell>
  );
}

// ============================================================================
// Shared helpers (local — pattern of the repo : duplicate small UI utilities
// per section rather than building a shared dialog module).
// ============================================================================

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

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-xl w-full my-8 p-6 sm:p-8 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormFooter({
  onCancel,
  submitting,
  isEdit,
  testId,
}: {
  onCancel: () => void;
  submitting: boolean;
  isEdit: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2 border-t">
      <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
        Annuler
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        data-testid={testId}
      >
        {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
      </button>
    </div>
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
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:opacity-90" data-testid="confirm-delete-bank">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
