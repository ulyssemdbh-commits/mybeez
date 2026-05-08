/**
 * FilesSection — UI pour le module Documents (fichiers + corbeille TTL 7j).
 *
 * Backend : /api/management/:slug/files (PR #71 — Sprint 3 module).
 *
 * Pattern adapté des sections existantes (PurchasesSection / ExpensesSection)
 * et inspiré du layout ulysseclaude `Documents Ressources Humaines` :
 *   - StatCards en haut (Total / Mois / Taille totale / Corbeille)
 *   - filtres : recherche libre + dropdown catégorie
 *   - CollapsibleCard "Documents (N)" : table compacte + actions par ligne
 *   - CollapsibleCard "Corbeille (N)" (default collapsed) : countdown TTL
 *     + actions restore / suppression définitive
 *   - dialog upload multipart (file + métadonnées)
 *   - confirmation soft-delete + hard-delete
 *
 * V1 — hors scope (cf. files.ts §V1) :
 *   - send-email, parse-preview, side-effects vers expenses/purchases
 *   - bulk multi-select (les actions par ligne suffisent au démarrage)
 *   - preview inline images/PDF (download direct, économie bande passante R2)
 */

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen,
  Trash2,
  Plus,
  X,
  Search,
  Download,
  RotateCcw,
  HardDrive,
  Calendar,
  AlertTriangle,
  Loader2,
  File as FileIcon,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CollapsibleCard, StatCard } from "@/components/management/sharedUI";

// ============================== Types ==============================

interface FileRow {
  id: number;
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
  createdAt: string | null;
}

interface TrashRow extends FileRow {
  originalFileId: number;
  deletedAt: string;
  expiresAt: string;
  originalCreatedAt: string | null;
}

interface ListResponse {
  files: FileRow[];
}

interface TrashListResponse {
  files: TrashRow[];
}

interface Props {
  tenantSlug: string;
}

// ============================== Constants ==============================

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // doit matcher server/routes/management/files.ts

/** Catégories suggérées dans le dropdown. Champ libre côté serveur, on
 *  propose juste un set raisonnable pour l'UX. */
const SUGGESTED_CATEGORIES = [
  "Factures fournisseurs",
  "Factures clients",
  "Contrats",
  "Documents administratifs",
  "Bulletins de paie",
  "Documents RH",
  "Banque",
  "Assurance",
  "Comptabilité",
  "Autres",
];

// ============================== Helpers ==============================

function formatDateFR(iso: string | null | undefined): string {
  if (!iso) return "—";
  // ISO complet ou YYYY-MM-DD
  const d = iso.length === 10 ? iso : iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

/** Octets → "12 Ko" / "3,4 Mo" / "1,2 Go". */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} Ko`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(".", ",")} Mo`;
  const gb = mb / 1024;
  return `${gb.toFixed(2).replace(".", ",")} Go`;
}

/** Date d'expiration → "Expire dans 3 j" / "Expire aujourd'hui" / "Expirée". */
function formatRelativeTTL(expiresAtIso: string, now: Date = new Date()): {
  label: string;
  expired: boolean;
  urgent: boolean;
} {
  const expiresAt = new Date(expiresAtIso);
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return { label: "Expirée", expired: true, urgent: true };
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) {
    const hours = Math.floor(ms / 3_600_000);
    return {
      label: hours <= 1 ? "Expire dans moins d'1 h" : `Expire dans ${hours} h`,
      expired: false,
      urgent: true,
    };
  }
  return {
    label: days === 1 ? "Expire dans 1 j" : `Expire dans ${days} j`,
    expired: false,
    urgent: days <= 1,
  };
}

/** mimeType → icône lucide adaptée. */
function mimeToIcon(mime: string): LucideIcon {
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/pdf") return FileText;
  if (mime.includes("spreadsheet") || mime === "text/csv") return FileSpreadsheet;
  if (mime.includes("zip") || mime.includes("compressed")) return FileArchive;
  if (mime.startsWith("text/")) return FileText;
  return FileIcon;
}

/** mimeType → couleur d'icône (cohérent avec lucide convention). */
function mimeToIconColor(mime: string): string {
  if (mime.startsWith("image/")) return "text-purple-500 dark:text-purple-400";
  if (mime === "application/pdf") return "text-red-500 dark:text-red-400";
  if (mime.includes("spreadsheet") || mime === "text/csv")
    return "text-emerald-500 dark:text-emerald-400";
  if (mime.includes("zip") || mime.includes("compressed"))
    return "text-amber-500 dark:text-amber-400";
  return "text-blue-500 dark:text-blue-400";
}

// ============================== Main component ==============================

export function FilesSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FileRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<TrashRow | null>(null);

  const baseKey = ["/api/management", tenantSlug, "files"] as const;

  // ---- queries ----

  const filesQuery = useQuery<ListResponse>({
    queryKey: [...baseKey, "list", { category: categoryFilter, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      const qs = params.toString();
      const res = await fetch(
        `/api/management/${tenantSlug}/files${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const trashQuery = useQuery<TrashListResponse>({
    queryKey: [...baseKey, "trash"],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/files/trash`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: 5 * 60_000, // re-fetch toutes les 5 min pour actualiser les TTL
  });

  // ---- catégories observées (alimente le dropdown filtre) ----
  const observedCategories = useMemo(() => {
    const set = new Set<string>();
    for (const f of filesQuery.data?.files ?? []) set.add(f.category);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [filesQuery.data]);

  // ---- stats dérivées ----
  const stats = useMemo(() => {
    const files = filesQuery.data?.files ?? [];
    const trash = trashQuery.data?.files ?? [];
    const totalBytes = files.reduce((acc, f) => acc + f.fileSize, 0);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = files.filter((f) => {
      if (!f.createdAt) return false;
      return new Date(f.createdAt) >= startOfMonth;
    }).length;
    return {
      total: files.length,
      thisMonth,
      totalBytes,
      trashCount: trash.length,
    };
  }, [filesQuery.data, trashQuery.data]);

  // ---- mutations ----

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/files/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ success: true; expiresAt: string }>;
    },
    onSuccess: (data) => {
      const ttl = formatRelativeTTL(data.expiresAt);
      toast({
        title: "Document envoyé en corbeille",
        description: `${ttl.label} avant suppression définitive. Restaurable depuis l'onglet Corbeille.`,
      });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(
        `/api/management/${tenantSlug}/files/trash/${id}/restore`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Document restauré" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const purgeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(
        `/api/management/${tenantSlug}/files/trash/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Document supprimé définitivement" });
      queryClient.invalidateQueries({ queryKey: baseKey });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ---- download (pas une mutation : on stream le binaire dans une nouvelle tab) ----
  function handleDownload(row: FileRow) {
    const url = `/api/management/${tenantSlug}/files/${row.id}/download`;
    // Ouvre dans un nouvel onglet — la réponse est servie en `inline`,
    // le navigateur affiche ou télécharge selon le mimeType.
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const files = filesQuery.data?.files ?? [];
  const trash = trashQuery.data?.files ?? [];

  return (
    <section className="space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Centralise factures, contrats, fiches de paie et autres documents administratifs.
            Suppression réversible 7 jours via la corbeille.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          data-testid="files-add"
        >
          <Plus className="w-4 h-4" />
          Ajouter un document
        </button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={FolderOpen}
          label="Documents"
          value={String(stats.total)}
          color="amber"
          testId="files-stat-total"
        />
        <StatCard
          icon={Calendar}
          label="Ce mois"
          value={String(stats.thisMonth)}
          color="blue"
          testId="files-stat-month"
        />
        <StatCard
          icon={HardDrive}
          label="Taille totale"
          value={formatBytes(stats.totalBytes)}
          color="purple"
          testId="files-stat-size"
        />
        <StatCard
          icon={Trash2}
          label="Corbeille"
          value={String(stats.trashCount)}
          color={stats.trashCount > 0 ? "red" : "green"}
          testId="files-stat-trash"
          warning={
            stats.trashCount > 0
              ? `${stats.trashCount} document${stats.trashCount > 1 ? "s" : ""} en attente de suppression définitive`
              : undefined
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, fournisseur, description)…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="files-search"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 max-w-[260px]"
          data-testid="files-filter-category"
        >
          <option value="all">Toutes catégories</option>
          {observedCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Documents */}
      <CollapsibleCard
        title={`Documents (${files.length})`}
        icon={FolderOpen}
        cardId="files-active"
      >
        {filesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Chargement…</p>
        ) : filesQuery.error ? (
          <p className="text-sm text-destructive py-6 text-center">
            {(filesQuery.error as Error).message}
          </p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {search.trim() || categoryFilter !== "all"
              ? "Aucun document ne correspond aux filtres."
              : "Aucun document. Cliquez « Ajouter un document » pour commencer."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -mx-3 sm:-mx-5">
            {files.map((row) => {
              const Icon = mimeToIcon(row.mimeType);
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-3 sm:px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group"
                  data-testid={`file-row-${row.id}`}
                >
                  <Icon className={cn("w-5 h-5 shrink-0", mimeToIconColor(row.mimeType))} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleDownload(row)}
                      className="text-sm font-medium truncate text-left hover:underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
                      title={row.originalName}
                    >
                      {row.originalName}
                    </button>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>{row.category}</span>
                      <span>·</span>
                      <span>{formatDateFR(row.fileDate ?? row.createdAt)}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatBytes(row.fileSize)}</span>
                      {row.supplier && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[180px]">{row.supplier}</span>
                        </>
                      )}
                    </div>
                    {row.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {row.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownload(row)}
                      className="p-2 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                      aria-label="Télécharger"
                      title="Télécharger"
                      data-testid={`file-download-${row.id}`}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(row)}
                      className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      aria-label="Envoyer en corbeille"
                      title="Envoyer en corbeille (réversible 7 jours)"
                      data-testid={`file-delete-${row.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleCard>

      {/* Trash */}
      <CollapsibleCard
        title={`Corbeille (${trash.length})`}
        icon={Trash2}
        cardId="files-trash"
        defaultCollapsed
      >
        <p className="text-xs text-muted-foreground mb-3">
          Les documents supprimés restent ici 7 jours. Au-delà, ils sont
          supprimés définitivement (DB + stockage R2). Vous pouvez restaurer ou
          supprimer définitivement chaque document avant expiration.
        </p>
        {trashQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Chargement…</p>
        ) : trashQuery.error ? (
          <p className="text-sm text-destructive py-6 text-center">
            {(trashQuery.error as Error).message}
          </p>
        ) : trash.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Corbeille vide.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -mx-3 sm:-mx-5">
            {trash.map((row) => {
              const Icon = mimeToIcon(row.mimeType);
              const ttl = formatRelativeTTL(row.expiresAt);
              const isRestoring =
                restoreMutation.isPending && restoreMutation.variables === row.id;
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-3 sm:px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                  data-testid={`file-trash-row-${row.id}`}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0 opacity-60",
                      mimeToIconColor(row.mimeType),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={row.originalName}>
                      {row.originalName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>{row.category}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatBytes(row.fileSize)}</span>
                      <span>·</span>
                      <span>Supprimé le {formatDateFR(row.deletedAt)}</span>
                      <span>·</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          ttl.expired
                            ? "text-red-600 dark:text-red-400"
                            : ttl.urgent
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {ttl.urgent && <AlertTriangle className="w-3 h-3" />}
                        {ttl.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => restoreMutation.mutate(row.id)}
                      disabled={ttl.expired || isRestoring}
                      className="p-2 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Restaurer"
                      title={ttl.expired ? "Document expiré, non restaurable" : "Restaurer"}
                      data-testid={`file-restore-${row.id}`}
                    >
                      {isRestoring ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPurge(row)}
                      className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      aria-label="Supprimer définitivement"
                      title="Supprimer définitivement (irréversible)"
                      data-testid={`file-purge-${row.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleCard>

      {/* Dialogs */}
      {creating && (
        <FileUploadDialog
          tenantSlug={tenantSlug}
          observedCategories={observedCategories}
          onClose={() => setCreating(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: baseKey });
            toast({ title: "Document ajouté" });
            setCreating(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Envoyer ce document en corbeille ?"
          body={`« ${confirmDelete.originalName} » sera placé dans la corbeille pendant 7 jours, puis supprimé définitivement (DB + stockage). Vous pouvez le restaurer pendant cette période.`}
          confirmLabel="Envoyer en corbeille"
          variant="warning"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            deleteMutation.mutate(id);
          }}
        />
      )}

      {confirmPurge && (
        <ConfirmDialog
          title="Supprimer définitivement ce document ?"
          body={`« ${confirmPurge.originalName} » sera supprimé immédiatement, à la fois de la base de données et du stockage R2. Cette action est irréversible.`}
          confirmLabel="Supprimer définitivement"
          variant="destructive"
          onCancel={() => setConfirmPurge(null)}
          onConfirm={() => {
            const id = confirmPurge.id;
            setConfirmPurge(null);
            purgeMutation.mutate(id);
          }}
        />
      )}
    </section>
  );
}

// ============================== Upload dialog ==============================

interface UploadDialogProps {
  tenantSlug: string;
  observedCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function FileUploadDialog({
  tenantSlug,
  observedCategories,
  onClose,
  onSaved,
}: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(observedCategories[0] ?? "");
  const [customCategory, setCustomCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [fileDate, setFileDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Catégories proposées : suggérées + observées (dédoublonné, ordre stable).
  const categoryOptions = useMemo(() => {
    const set = new Set([...observedCategories, ...SUGGESTED_CATEGORIES]);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [observedCategories]);

  function handleFilePick(picked: File | null) {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setError(
        `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo, reçu ${formatBytes(picked.size)})`,
      );
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const finalCategory =
      category === "__custom__" ? customCategory.trim() : category.trim();

    if (!file) {
      setError("Sélectionnez un fichier à téléverser.");
      return;
    }
    if (!finalCategory) {
      setError("La catégorie est requise.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", finalCategory);
      if (supplier.trim()) fd.append("supplier", supplier.trim());
      if (description.trim()) fd.append("description", description.trim());
      if (fileDate.trim()) fd.append("fileDate", fileDate.trim());

      const res = await fetch(`/api/management/${tenantSlug}/files`, {
        method: "POST",
        credentials: "include",
        body: fd,
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
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-xl w-full my-8 p-6 sm:p-8 space-y-5"
        data-testid="file-upload-form"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold">Ajouter un document</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File picker */}
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor="file-upload-input">
            Fichier *
          </label>
          <input
            ref={inputRef}
            id="file-upload-input"
            type="file"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
            className="hidden"
            data-testid="file-upload-picker"
          />
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Retirer le fichier"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-500/5 px-6 py-8 transition-colors"
              data-testid="file-upload-trigger"
            >
              <Plus className="w-6 h-6 text-amber-500" />
              <span className="text-sm font-medium">Sélectionner un fichier</span>
              <span className="text-xs text-muted-foreground">
                Max {MAX_UPLOAD_BYTES / 1024 / 1024} Mo
              </span>
            </button>
          )}
        </div>

        {/* Category */}
        <Field label="Catégorie *">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
            data-testid="file-upload-category"
          >
            <option value="">— Sélectionner —</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__custom__">+ Autre (saisir)</option>
          </select>
          {category === "__custom__" && (
            <input
              type="text"
              maxLength={60}
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="Nom de la catégorie"
              className={cn(inputCls, "mt-2")}
              data-testid="file-upload-category-custom"
            />
          )}
        </Field>

        {/* Métadonnées optionnelles */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Fournisseur (optionnel)">
            <input
              type="text"
              maxLength={200}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className={inputCls}
              placeholder="Ex : EDF, URSSAF"
              data-testid="file-upload-supplier"
            />
          </Field>
          <Field label="Date du document (optionnel)">
            <input
              type="date"
              value={fileDate}
              onChange={(e) => setFileDate(e.target.value)}
              className={inputCls}
              data-testid="file-upload-date"
            />
          </Field>
        </div>

        <Field label="Description (optionnel)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className={cn(inputCls, "resize-none")}
            placeholder="Notes utiles pour retrouver ce document plus tard"
            data-testid="file-upload-description"
          />
        </Field>

        {error && (
          <p
            className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting || !file}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
            data-testid="file-upload-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Téléversement…
              </>
            ) : (
              "Ajouter"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================== Helpers ==============================

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
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
  variant?: "warning" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  variant = "destructive",
  onCancel,
  onConfirm,
}: ConfirmProps) {
  const btnCls =
    variant === "warning"
      ? "bg-amber-500 hover:bg-amber-600 text-white"
      : "bg-red-600 hover:opacity-90 text-white";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-opacity", btnCls)}
            data-testid="file-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
