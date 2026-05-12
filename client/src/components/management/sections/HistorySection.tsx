/**
 * HistorySection — UI pour le module History cross-module.
 * Backend : /api/management/:slug/history (PR #88).
 *
 * Read-only — flux unifié des actions audit_log décorées (module, action,
 * label FR, entityType, entityId). Filtres module / action / date range /
 * userId + pagination offset-based.
 *
 * Pas de mutation : tout le travail d'écriture passe par les modules
 * sources (purchases, expenses, …). History est juste une lecture.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Filter,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { tenantPath } from "@/lib/tenantHost";

interface DecoratedHistoryRow {
  id: number;
  createdAt: string;
  event: string;
  module: string;
  action: string;
  outcome: string | null;
  label: string;
  userId: number | null;
  tenantId: number | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  entityType: string | null;
  entityId: number | null;
}

interface HistoryResponse {
  items: DecoratedHistoryRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface Props {
  tenantSlug: string;
}

/**
 * Modules surfaced as filter options. Mirrors `FILTERABLE_MODULES` from
 * the backend `historyDecorator.ts` — kept here as a static list so the
 * UI doesn't pay a roundtrip to populate the dropdown. If the backend
 * adds new modules, this list will be a tad outdated until refreshed,
 * which is acceptable (the filter just won't be selectable).
 */
const MODULE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tous les modules" },
  { value: "auth", label: "Authentification" },
  { value: "mfa", label: "MFA" },
  { value: "password", label: "Mot de passe" },
  { value: "tenant", label: "Tenant" },
  { value: "user", label: "Utilisateur" },
  { value: "purchases", label: "Achats" },
  { value: "expenses", label: "Dépenses" },
  { value: "suppliers", label: "Fournisseurs" },
  { value: "files", label: "Fichiers" },
  { value: "employees", label: "Employés" },
  { value: "payroll", label: "Fiches de paie" },
  { value: "absences", label: "Absences" },
  { value: "bankAccounts", label: "Comptes bancaires" },
  { value: "bankEntries", label: "Opérations bancaires" },
  { value: "cashEntries", label: "Opérations de caisse" },
  { value: "checklist", label: "Checklist" },
  { value: "alfred", label: "Alfred" },
  { value: "template", label: "Template" },
];

const COMMON_ACTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Toutes les actions" },
  { value: "created", label: "Créé" },
  { value: "updated", label: "Mis à jour" },
  { value: "deleted", label: "Supprimé" },
  { value: "archived", label: "Archivé" },
  { value: "imported", label: "Importé" },
  { value: "emailed", label: "Email envoyé" },
  { value: "uploaded", label: "Téléversé" },
  { value: "trashed", label: "Corbeille" },
  { value: "restored", label: "Restauré" },
  { value: "login", label: "Connexion" },
  { value: "logout", label: "Déconnexion" },
  { value: "signup", label: "Inscription" },
];

/**
 * Module → management section slug for the deep-link. Some modules
 * (auth, mfa, …) have no management page — we don't offer a deep-link
 * for those rows.
 */
const ENTITY_TO_SECTION: Record<string, string> = {
  purchase: "purchases",
  expense: "expenses",
  supplier: "suppliers",
  file: "files",
  employee: "employees",
  payroll: "payroll",
  absence: "absences",
  bankAccount: "bank",
  bankEntry: "bank",
  cashEntry: "cash",
};

const PAGE_SIZE = 50;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function HistorySection({ tenantSlug }: Props) {
  const [, setLocation] = useLocation();
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (moduleFilter) p.set("module", moduleFilter);
    if (actionFilter) p.set("action", actionFilter);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (userIdFilter.trim()) p.set("userId", userIdFilter.trim());
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(offset));
    return p.toString();
  }, [moduleFilter, actionFilter, from, to, userIdFilter, offset]);

  const query = useQuery<HistoryResponse>({
    queryKey: ["/api/management", tenantSlug, "history", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/history?${queryString}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  function resetFilters() {
    setModuleFilter("");
    setActionFilter("");
    setFrom("");
    setTo("");
    setUserIdFilter("");
    setOffset(0);
  }

  // When a filter changes, reset the offset to the first page.
  function onFilterChange(setter: (v: string) => void, v: string) {
    setter(v);
    setOffset(0);
  }

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDeepLink(row: DecoratedHistoryRow) {
    if (!row.entityType) return;
    const section = ENTITY_TO_SECTION[row.entityType];
    if (!section) return;
    setLocation(tenantPath(tenantSlug, `/management/${section}`));
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = query.data?.hasMore ?? false;

  return (
    <section className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4 text-muted-foreground" />
            Filtres
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="history-reset-filters"
          >
            <RotateCcw className="w-3 h-3" /> Réinitialiser
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <Field label="Module">
            <select
              value={moduleFilter}
              onChange={(e) => onFilterChange(setModuleFilter, e.target.value)}
              className={inputCls}
              data-testid="history-module-filter"
            >
              {MODULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select
              value={actionFilter}
              onChange={(e) => onFilterChange(setActionFilter, e.target.value)}
              className={inputCls}
              data-testid="history-action-filter"
            >
              {COMMON_ACTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Du">
            <input
              type="date"
              value={from}
              onChange={(e) => onFilterChange(setFrom, e.target.value)}
              className={inputCls}
              data-testid="history-from"
            />
          </Field>
          <Field label="Au">
            <input
              type="date"
              value={to}
              onChange={(e) => onFilterChange(setTo, e.target.value)}
              className={inputCls}
              data-testid="history-to"
            />
          </Field>
          <Field label="User ID">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={userIdFilter}
              onChange={(e) => onFilterChange(setUserIdFilter, e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="ex. 42"
              className={inputCls}
              data-testid="history-user-filter"
            />
          </Field>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
        <div className="px-4 py-2 border-b flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="history-total">
            {query.isLoading
              ? "Chargement…"
              : query.error
                ? "Erreur"
                : `${total} action${total > 1 ? "s" : ""} — affichage ${total === 0 ? 0 : offset + 1}-${Math.min(offset + items.length, total)}`}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Tri : du plus récent au plus ancien
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3 text-right">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {query.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Chargement…
                  </td>
                </tr>
              ) : query.error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-destructive">
                    {(query.error as Error).message}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucune action sur cette période / filtres.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const isExpanded = expanded.has(row.id);
                  const deepLinkable = row.entityType !== null && ENTITY_TO_SECTION[row.entityType] !== undefined;
                  return (
                    <FragmentRow
                      key={row.id}
                      row={row}
                      isExpanded={isExpanded}
                      deepLinkable={deepLinkable}
                      onToggle={() => toggleExpand(row.id)}
                      onDeepLink={() => onDeepLink(row)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {(items.length > 0 || offset > 0) && (
          <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              data-testid="history-prev"
            >
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {Math.floor(offset / PAGE_SIZE) + 1}
            </span>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasMore}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              data-testid="history-next"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function FragmentRow({
  row,
  isExpanded,
  deepLinkable,
  onToggle,
  onDeepLink,
}: {
  row: DecoratedHistoryRow;
  isExpanded: boolean;
  deepLinkable: boolean;
  onToggle: () => void;
  onDeepLink: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer"
        onClick={onToggle}
        data-testid={`history-row-${row.id}`}
      >
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label={isExpanded ? "Réduire" : "Développer"}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.createdAt)}
        </td>
        <td className="px-4 py-3">
          <div className="font-medium">{row.label}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.event}</div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{row.module}</td>
        <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
          {row.userId !== null ? `#${row.userId}` : "—"}
        </td>
        <td className="px-4 py-3 text-right">
          {deepLinkable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeepLink();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-primary hover:bg-primary/10"
              data-testid={`history-deeplink-${row.id}`}
              title={`Aller à ${row.entityType} #${row.entityId}`}
            >
              <ExternalLink className="w-3 h-3" />
              Voir
            </button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-zinc-50 dark:bg-zinc-800/30" data-testid={`history-detail-${row.id}`}>
          <td colSpan={6} className="px-4 py-3">
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <DetailItem label="Event" value={row.event} mono />
              <DetailItem label="ID" value={`#${row.id}`} />
              {row.outcome && <DetailItem label="Outcome" value={row.outcome} />}
              {row.entityType && (
                <DetailItem
                  label="Entité"
                  value={`${row.entityType} #${row.entityId}`}
                  mono
                />
              )}
              {row.ipAddress && <DetailItem label="IP" value={row.ipAddress} mono />}
              {row.userAgent && (
                <DetailItem label="User-Agent" value={row.userAgent} mono className="sm:col-span-2 truncate" />
              )}
              {Object.keys(row.metadata).length > 0 && (
                <div className="sm:col-span-2 space-y-1">
                  <div className="text-muted-foreground font-medium">Metadata</div>
                  <pre className="bg-white dark:bg-zinc-900 rounded-md border p-2 font-mono text-[11px] overflow-x-auto max-h-48">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn(mono && "font-mono")}>{value}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
