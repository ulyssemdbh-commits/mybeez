/**
 * PurchasesSection — UI pour le module Achats.
 *
 * Backend: /api/management/:slug/purchases (Sprint 1 module).
 *
 * Pattern adapté de ulysseclaude/client/src/pages/suguval/AchatsTab.tsx :
 *   - filtres (période, statut, recherche)
 *   - KPI strip (total TTC, impayés, count)
 *   - liste triée par date facture descendante
 *   - dialog Add/Edit
 *   - confirmation soft-delete
 *
 * Adaptations myBeez :
 *   - composants `sharedUI` (PR #63) : CollapsibleCard, StatCard, PeriodFilter
 *   - vertical-agnostic : pas de catégories restaurant pré-listées,
 *     champ libre `category`
 *   - dark-mode auto via Tailwind (pas de `useSuguDark`)
 *   - palette amber (myBeez)
 */

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Search,
  ShoppingCart,
  Wallet,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  XCircle,
  Receipt,
  FileUp,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  PeriodFilter,
  StatCard,
  usePeriodFilter,
} from "@/components/management/sharedUI";

interface Purchase {
  id: number;
  supplierId: number | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string;
  totalHt: number | null;
  totalTtc: number;
  tvaRate: number | null;
  tvaAmount: number | null;
  paymentMethod: string | null;
  paymentStatus: "pending" | "paid" | "late" | "cancelled";
  paidDate: string | null;
  dueDate: string | null;
  category: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string | null;
}

interface SupplierOption {
  id: number;
  name: string;
}

interface ListResponse {
  purchases: Purchase[];
}

interface SuppliersResponse {
  suppliers: { id: number; name: string; isActive: boolean }[];
}

interface StatsResponse {
  totalTtc: number;
  totalHt: number;
  invoiceCount: number;
  unpaidTotal: number;
  unpaidCount: number;
}

const STATUS_META: Record<
  Purchase["paymentStatus"],
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
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

interface Props {
  tenantSlug: string;
}

interface PrefilledFields {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalHt?: string;
  totalTtc?: string;
  tvaRate?: string;
  tvaAmount?: string;
  paymentMethod?: string;
  dueDate?: string;
  category?: string;
}

const SUPPORTED_OCR_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_OCR_BYTES = 5 * 1024 * 1024;

export function PurchasesSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const periodCtl = usePeriodFilter("year");
  const [statusFilter, setStatusFilter] = useState<"all" | Purchase["paymentStatus"]>("all");
  const [supplierFilter, setSupplierFilter] = useState<"all" | number>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Purchase | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedFields, setImportedFields] = useState<PrefilledFields | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseKey = ["/api/management", tenantSlug, "purchases"] as const;

  const queryArgs = useMemo(
    () => ({
      from: periodCtl.period.from,
      to: periodCtl.period.to,
      status: statusFilter === "all" ? undefined : statusFilter,
      supplierId: supplierFilter === "all" ? undefined : supplierFilter,
    }),
    [periodCtl.period.from, periodCtl.period.to, statusFilter, supplierFilter],
  );

  const listQuery = useQuery<ListResponse>({
    queryKey: [...baseKey, "list", queryArgs],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("from", queryArgs.from);
      params.set("to", queryArgs.to);
      if (queryArgs.status) params.set("status", queryArgs.status);
      if (queryArgs.supplierId) params.set("supplierId", String(queryArgs.supplierId));
      const res = await fetch(`/api/management/${tenantSlug}/purchases?${params.toString()}`, {
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
      const res = await fetch(`/api/management/${tenantSlug}/purchases/stats?${params.toString()}`, {
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
      const res = await fetch(`/api/management/${tenantSlug}/purchases/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Achat archivé" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  async function handleFilePicked(file: File) {
    if (!SUPPORTED_OCR_MIME.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Utilisez une image JPG, PNG ou WebP. Le PDF n'est pas supporté en V1.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_OCR_BYTES) {
      toast({
        title: "Image trop volumineuse",
        description: `Maximum ${MAX_OCR_BYTES / 1024 / 1024} MB.`,
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    try {
      // Read file as base64 (data URL → strip prefix).
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const idx = result.indexOf(",");
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/management/${tenantSlug}/purchases/parse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 503
            ? "Le service OCR n'est pas configuré sur ce serveur."
            : data.error ?? `HTTP ${res.status}`;
        toast({ title: "Échec de l'import", description: msg, variant: "destructive" });
        return;
      }

      const fields = data.fields as Record<string, string | number | null>;
      const prefilled: PrefilledFields = {
        supplierName: typeof fields.supplierName === "string" ? fields.supplierName : undefined,
        invoiceNumber: typeof fields.invoiceNumber === "string" ? fields.invoiceNumber : undefined,
        invoiceDate: typeof fields.invoiceDate === "string" ? fields.invoiceDate : undefined,
        totalHt: typeof fields.totalHt === "number" ? String(fields.totalHt) : undefined,
        totalTtc: typeof fields.totalTtc === "number" ? String(fields.totalTtc) : undefined,
        tvaRate: typeof fields.tvaRate === "number" ? String(fields.tvaRate) : undefined,
        tvaAmount: typeof fields.tvaAmount === "number" ? String(fields.tvaAmount) : undefined,
        paymentMethod: typeof fields.paymentMethod === "string" ? fields.paymentMethod : undefined,
        dueDate: typeof fields.dueDate === "string" ? fields.dueDate : undefined,
        category: typeof fields.category === "string" ? fields.category : undefined,
      };

      setImportedFields(prefilled);
      const filledCount = Object.values(prefilled).filter(Boolean).length;
      toast({
        title: "Facture analysée",
        description: `${filledCount} champ${filledCount > 1 ? "s" : ""} pré-rempli${filledCount > 1 ? "s" : ""} via ${data.provider}. Vérifiez avant d'enregistrer.`,
      });
    } catch (err) {
      toast({
        title: "Erreur d'analyse",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      // Reset l'input pour permettre re-upload du même fichier.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const markPaidMutation = useMutation({
    mutationFn: async (p: Purchase) => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/management/${tenantSlug}/purchases/${p.id}`, {
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
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const filtered = (listQuery.data?.purchases ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.supplierName?.toLowerCase().includes(q) ?? false) ||
      (p.invoiceNumber?.toLowerCase().includes(q) ?? false) ||
      (p.description?.toLowerCase().includes(q) ?? false) ||
      (p.category?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Achats</h2>
          <p className="text-sm text-muted-foreground">
            Suivi des factures fournisseurs : montants HT/TVA/TTC, échéances, statut de paiement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFilePicked(f);
            }}
            data-testid="purchases-import-file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-wait"
            data-testid="purchases-import"
            title="Photographier ou téléverser une facture, l'IA pré-remplit le formulaire"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyse en cours…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <FileUp className="w-4 h-4" />
                Importer une facture
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            data-testid="purchases-add"
          >
            <Plus className="w-4 h-4" />
            Nouvel achat
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Receipt}
          label="Total facturé"
          value={formatEUR(statsQuery.data?.totalTtc)}
          color="amber"
          testId="purchases-stat-total"
        />
        <StatCard
          icon={ShoppingCart}
          label="Factures"
          value={String(statsQuery.data?.invoiceCount ?? 0)}
          color="blue"
          testId="purchases-stat-count"
        />
        <StatCard
          icon={Wallet}
          label="Impayé"
          value={formatEUR(statsQuery.data?.unpaidTotal)}
          color={statsQuery.data?.unpaidTotal ? "red" : "green"}
          testId="purchases-stat-unpaid"
          warning={
            statsQuery.data?.unpaidCount
              ? `${statsQuery.data.unpaidCount} facture${statsQuery.data.unpaidCount > 1 ? "s" : ""} en attente`
              : undefined
          }
        />
        <StatCard
          icon={AlertCircle}
          label="HT (calcul comptable)"
          value={formatEUR(statsQuery.data?.totalHt)}
          color="purple"
          testId="purchases-stat-ht"
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
              placeholder="Fournisseur, n° facture, description…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="purchases-search"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="purchases-filter-status"
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
            data-testid="purchases-filter-supplier"
          >
            <option value="all">Tous fournisseurs</option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Fournisseur</th>
                <th className="px-4 py-3">N° facture</th>
                <th className="px-4 py-3 text-right">TTC</th>
                <th className="px-4 py-3">Échéance</th>
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
                    {search.trim() || statusFilter !== "all" || supplierFilter !== "all"
                      ? "Aucune facture ne correspond aux filtres."
                      : "Aucune facture sur la période. Cliquez « Nouvel achat » pour commencer."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const meta = STATUS_META[p.paymentStatus];
                  const StatusIcon = meta.icon;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`purchase-row-${p.id}`}
                    >
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatDateFR(p.invoiceDate)}</td>
                      <td className="px-4 py-3 font-medium">
                        {p.supplierName ?? <span className="text-muted-foreground italic">non renseigné</span>}
                        {p.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.invoiceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {formatEUR(p.totalTtc)}
                      </td>
                      <td className="px-4 py-3 text-xs">{formatDateFR(p.dueDate)}</td>
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
                          {p.paymentStatus !== "paid" && p.paymentStatus !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => markPaidMutation.mutate(p)}
                              className="text-xs px-2 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                              data-testid={`purchase-mark-paid-${p.id}`}
                              title="Marquer comme payée"
                            >
                              ✓ Payée
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            aria-label="Modifier"
                            data-testid={`purchase-edit-${p.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(p)}
                            className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            aria-label="Archiver"
                            data-testid={`purchase-delete-${p.id}`}
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
            {filtered.length} facture{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {(creating || editing || importedFields) && (
        <PurchaseDialog
          tenantSlug={tenantSlug}
          purchase={editing}
          suppliers={supplierOptions}
          prefilled={importedFields ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setImportedFields(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: baseKey });
            toast({ title: editing ? "Achat modifié" : "Achat créé" });
            setCreating(false);
            setEditing(null);
            setImportedFields(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Archiver cette facture ?"
          body={`La facture ${confirmDelete.invoiceNumber || formatDateFR(confirmDelete.invoiceDate)} (${formatEUR(confirmDelete.totalTtc)}) sera marquée comme inactive. Elle reste consultable via le filtre « inclure archivés » et peut être réactivée.`}
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
  purchase: Purchase | null;
  suppliers: SupplierOption[];
  /** Champs pré-remplis (typiquement issus de l'OCR). Ignorés en mode édition. */
  prefilled?: PrefilledFields;
  onClose: () => void;
  onSaved: () => void;
}

function PurchaseDialog({ tenantSlug, purchase, suppliers, prefilled, onClose, onSaved }: DialogProps) {
  const isEdit = purchase !== null;
  const [form, setForm] = useState(() => ({
    supplierId: purchase?.supplierId ? String(purchase.supplierId) : "",
    supplierName: purchase?.supplierName ?? prefilled?.supplierName ?? "",
    invoiceNumber: purchase?.invoiceNumber ?? prefilled?.invoiceNumber ?? "",
    invoiceDate: purchase?.invoiceDate ?? prefilled?.invoiceDate ?? new Date().toISOString().slice(0, 10),
    totalHt: purchase?.totalHt != null ? String(purchase.totalHt) : (prefilled?.totalHt ?? ""),
    totalTtc: purchase?.totalTtc != null ? String(purchase.totalTtc) : (prefilled?.totalTtc ?? ""),
    tvaRate: purchase?.tvaRate != null ? String(purchase.tvaRate) : (prefilled?.tvaRate ?? ""),
    tvaAmount: purchase?.tvaAmount != null ? String(purchase.tvaAmount) : (prefilled?.tvaAmount ?? ""),
    paymentMethod: purchase?.paymentMethod ?? prefilled?.paymentMethod ?? "",
    paymentStatus: purchase?.paymentStatus ?? "pending",
    paidDate: purchase?.paidDate ?? "",
    dueDate: purchase?.dueDate ?? prefilled?.dueDate ?? "",
    category: purchase?.category ?? prefilled?.category ?? "",
    description: purchase?.description ?? "",
    notes: purchase?.notes ?? "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.invoiceDate) {
      setError("La date de facture est requise");
      return;
    }
    if (!form.totalTtc || Number.isNaN(Number(form.totalTtc))) {
      setError("Le montant TTC est requis");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        supplierName: form.supplierName.trim() || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        invoiceDate: form.invoiceDate,
        totalHt: form.totalHt ? Number(form.totalHt) : null,
        totalTtc: Number(form.totalTtc),
        tvaRate: form.tvaRate ? Number(form.tvaRate) : null,
        tvaAmount: form.tvaAmount ? Number(form.tvaAmount) : null,
        paymentMethod: form.paymentMethod || undefined,
        paymentStatus: form.paymentStatus,
        paidDate: form.paidDate || undefined,
        dueDate: form.dueDate || undefined,
        category: form.category.trim() || undefined,
        description: form.description.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      const url = isEdit
        ? `/api/management/${tenantSlug}/purchases/${purchase!.id}`
        : `/api/management/${tenantSlug}/purchases`;
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
        data-testid="purchase-form"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">
            {isEdit ? "Modifier l'achat" : prefilled ? "Vérifier la facture importée" : "Nouvel achat"}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isEdit && prefilled && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-700/40 px-3 py-2 flex items-start gap-2 text-xs">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-200">
              Champs détectés automatiquement par l'OCR. Relisez et corrigez si besoin avant d'enregistrer.
            </p>
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Identification
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Fournisseur (annuaire)">
              <select
                value={form.supplierId}
                onChange={(e) => update("supplierId", e.target.value)}
                className={inputCls}
                data-testid="purchase-supplier-id"
              >
                <option value="">— Aucun (saisir nom libre) —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ou saisir un nom libre">
              <input
                type="text"
                maxLength={200}
                value={form.supplierName}
                onChange={(e) => update("supplierName", e.target.value)}
                className={inputCls}
                placeholder="Ex : Métro France"
                data-testid="purchase-supplier-name"
              />
            </Field>
            <Field label="N° facture">
              <input
                type="text"
                maxLength={60}
                value={form.invoiceNumber}
                onChange={(e) => update("invoiceNumber", e.target.value)}
                className={inputCls}
                data-testid="purchase-invoice-number"
              />
            </Field>
            <Field label="Date de facture *">
              <input
                type="date"
                required
                value={form.invoiceDate}
                onChange={(e) => update("invoiceDate", e.target.value)}
                className={inputCls}
                data-testid="purchase-invoice-date"
              />
            </Field>
            <Field label="Catégorie">
              <input
                type="text"
                maxLength={60}
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className={inputCls}
                placeholder="Ex : matières premières"
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                maxLength={500}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Montants
          </legend>
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Total HT">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.totalHt}
                onChange={(e) => update("totalHt", e.target.value)}
                className={cn(inputCls, "tabular-nums")}
                data-testid="purchase-total-ht"
              />
            </Field>
            <Field label="TVA %">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.tvaRate}
                onChange={(e) => update("tvaRate", e.target.value)}
                className={cn(inputCls, "tabular-nums")}
              />
            </Field>
            <Field label="Montant TVA">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.tvaAmount}
                onChange={(e) => update("tvaAmount", e.target.value)}
                className={cn(inputCls, "tabular-nums")}
              />
            </Field>
            <Field label="Total TTC *">
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.totalTtc}
                onChange={(e) => update("totalTtc", e.target.value)}
                className={cn(inputCls, "tabular-nums font-semibold")}
                data-testid="purchase-total-ttc"
              />
            </Field>
          </div>
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
                data-testid="purchase-payment-status"
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
                placeholder="virement, prélèvement, CB…"
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
            data-testid="purchase-submit"
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
            data-testid="confirm-delete-purchase"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
