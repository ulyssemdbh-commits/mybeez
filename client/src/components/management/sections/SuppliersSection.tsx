/**
 * SuppliersSection — UI pour le module Fournisseurs.
 * Backend: /api/management/:slug/suppliers (PR #2).
 */

import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, X, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Supplier {
  id: number;
  name: string;
  shortName: string | null;
  siret: string | null;
  tvaNumber: string | null;
  accountNumber: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contactName: string | null;
  category: string | null;
  paymentTerms: string | null;
  defaultPaymentMethod: string | null;
  bankIban: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string | null;
}

const CATEGORIES = [
  { value: "autre", label: "Autre" },
  { value: "matieres_premieres", label: "Matières premières" },
  { value: "boissons", label: "Boissons" },
  { value: "fournitures", label: "Fournitures" },
  { value: "services", label: "Services" },
  { value: "logistique", label: "Logistique" },
];

function categoryLabel(value: string | null): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "—";
}

interface ListResponse {
  suppliers: Supplier[];
}

interface Props {
  tenantSlug: string;
}

export function SuppliersSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const baseKey = ["/api/management", tenantSlug, "suppliers"] as const;
  const queryKey = [...baseKey, { includeInactive }];

  const listQuery = useQuery<ListResponse>({
    queryKey,
    queryFn: async () => {
      const url = `/api/management/${tenantSlug}/suppliers${includeInactive ? "?includeInactive=true" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/suppliers/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Fournisseur archivé" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const filtered = (listQuery.data?.suppliers ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.shortName?.toLowerCase().includes(q) ?? false) ||
      (s.email?.toLowerCase().includes(q) ?? false) ||
      (s.city?.toLowerCase().includes(q) ?? false) ||
      (s.contactName?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Fournisseurs</h2>
          <p className="text-sm text-muted-foreground">
            {listQuery.data ? `${filtered.length} fournisseur${filtered.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          data-testid="suppliers-add"
        >
          <Plus className="w-4 h-4" />
          Ajouter un fournisseur
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, ville…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="suppliers-search"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 accent-primary"
            data-testid="suppliers-include-inactive"
          />
          Afficher les archivés
        </label>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Ville</th>
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
                    {search.trim() ? "Aucun fournisseur ne correspond à la recherche." : "Aucun fournisseur. Ajoutez le premier !"}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors",
                      !s.isActive && "opacity-60",
                    )}
                    data-testid={`supplier-row-${s.id}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {s.name}
                      {s.shortName && (
                        <span className="ml-2 text-xs text-muted-foreground">({s.shortName})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{categoryLabel(s.category)}</td>
                    <td className="px-4 py-3">
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="text-primary hover:underline">
                          {s.email}
                        </a>
                      )}
                      {s.contactName && <div className="text-xs text-muted-foreground">{s.contactName}</div>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[s.postalCode, s.city].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Archivé
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(s)}
                          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          aria-label="Modifier"
                          data-testid={`supplier-edit-${s.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {s.isActive && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(s)}
                            className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            aria-label="Archiver"
                            data-testid={`supplier-delete-${s.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
        <SupplierDialog
          tenantSlug={tenantSlug}
          supplier={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: baseKey });
            toast({ title: editing ? "Fournisseur modifié" : "Fournisseur créé" });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Archiver ce fournisseur ?"
          body={`${confirmDelete.name} sera marqué comme inactif. Ses achats passés restent consultables et il pourra être réactivé via "Afficher les archivés" → Modifier.`}
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

interface SupplierDialogProps {
  tenantSlug: string;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}

function SupplierDialog({ tenantSlug, supplier, onClose, onSaved }: SupplierDialogProps) {
  const isEdit = supplier !== null;
  const [form, setForm] = useState(() => ({
    name: supplier?.name ?? "",
    shortName: supplier?.shortName ?? "",
    siret: supplier?.siret ?? "",
    tvaNumber: supplier?.tvaNumber ?? "",
    accountNumber: supplier?.accountNumber ?? "",
    address: supplier?.address ?? "",
    city: supplier?.city ?? "",
    postalCode: supplier?.postalCode ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    website: supplier?.website ?? "",
    contactName: supplier?.contactName ?? "",
    category: supplier?.category ?? "autre",
    paymentTerms: supplier?.paymentTerms ?? "",
    defaultPaymentMethod: supplier?.defaultPaymentMethod ?? "",
    bankIban: supplier?.bankIban ?? "",
    notes: supplier?.notes ?? "",
    isActive: supplier?.isActive ?? true,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Le nom du fournisseur est requis");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        shortName: form.shortName,
        siret: form.siret,
        tvaNumber: form.tvaNumber,
        accountNumber: form.accountNumber,
        address: form.address,
        city: form.city,
        postalCode: form.postalCode,
        phone: form.phone,
        email: form.email,
        website: form.website,
        contactName: form.contactName,
        category: form.category,
        paymentTerms: form.paymentTerms,
        defaultPaymentMethod: form.defaultPaymentMethod,
        bankIban: form.bankIban,
        notes: form.notes,
      };
      if (isEdit) payload.isActive = form.isActive;

      const url = isEdit
        ? `/api/management/${tenantSlug}/suppliers/${supplier!.id}`
        : `/api/management/${tenantSlug}/suppliers`;
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-2xl w-full my-8 p-6 sm:p-8 space-y-5"
        data-testid="supplier-form"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">{isEdit ? "Modifier le fournisseur" : "Nouveau fournisseur"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Identité
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom *" className="sm:col-span-2">
              <input
                type="text"
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className={inputCls}
                data-testid="supplier-name"
              />
            </Field>
            <Field label="Nom court / alias">
              <input type="text" maxLength={60} value={form.shortName} onChange={(e) => update("shortName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Catégorie">
              <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="SIRET">
              <input type="text" maxLength={20} value={form.siret} onChange={(e) => update("siret", e.target.value)} className={inputCls} />
            </Field>
            <Field label="N° TVA intracom">
              <input type="text" maxLength={40} value={form.tvaNumber} onChange={(e) => update("tvaNumber", e.target.value)} className={inputCls} />
            </Field>
            <Field label="N° de compte interne">
              <input type="text" maxLength={40} value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Contact
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Personne contact">
              <input type="text" maxLength={120} value={form.contactName} onChange={(e) => update("contactName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Téléphone">
              <input type="tel" maxLength={40} value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" maxLength={200} value={form.email} onChange={(e) => update("email", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Site web">
              <input type="url" maxLength={200} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://…" className={inputCls} />
            </Field>
            <Field label="Adresse" className="sm:col-span-2">
              <input type="text" maxLength={200} value={form.address} onChange={(e) => update("address", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Code postal">
              <input type="text" maxLength={20} value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Ville">
              <input type="text" maxLength={100} value={form.city} onChange={(e) => update("city", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Paiement
          </legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Conditions de paiement">
              <input
                type="text"
                maxLength={100}
                value={form.paymentTerms}
                onChange={(e) => update("paymentTerms", e.target.value)}
                placeholder="ex: 30 jours fin de mois"
                className={inputCls}
              />
            </Field>
            <Field label="Mode de paiement par défaut">
              <input
                type="text"
                maxLength={40}
                value={form.defaultPaymentMethod}
                onChange={(e) => update("defaultPaymentMethod", e.target.value)}
                placeholder="virement, prélèvement…"
                className={inputCls}
              />
            </Field>
            <Field label="IBAN" className="sm:col-span-2">
              <input
                type="text"
                maxLength={40}
                value={form.bankIban}
                onChange={(e) => update("bankIban", e.target.value)}
                className={cn(inputCls, "font-mono")}
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

        {isEdit && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update("isActive", e.target.checked)}
              className="w-4 h-4 accent-primary"
              data-testid="supplier-active"
            />
            <span>Actif (décocher pour archiver)</span>
          </label>
        )}

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
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            data-testid="supplier-submit"
          >
            {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

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
            data-testid="confirm-delete-supplier"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
