/**
 * TenantTemplateSection — affichage + switch du template du tenant.
 *
 * Backend : GET/PATCH `/api/management/:slug/template`
 *
 * UX :
 *   - card du template actuel (icône + nom + tagline + bullets features)
 *   - bouton "Changer de template" → modal avec recherche + grid de
 *     sub-templates (réutilise TemplateCard du wizard signup)
 *   - confirmation explicite avant switch (impact business)
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, X, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { IconRenderer } from "./IconRenderer";
import { TemplateCard } from "@/components/signup/TemplateCard";
import type { ApiTemplate } from "@/components/signup/types";
import { cn } from "@/lib/utils";
import { TAX_RULES_LABELS, formatTaxRuleValue } from "@/lib/taxRulesLabels";

interface CurrentResponse {
  current: ApiTemplate | null;
  parent: ApiTemplate | null;
}

interface Props {
  tenantSlug: string;
}

export function TenantTemplateSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);

  const currentKey = ["/api/management", tenantSlug, "template"] as const;

  const currentQuery = useQuery<CurrentResponse>({
    queryKey: currentKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/template`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch(`/api/management/${tenantSlug}/template`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as CurrentResponse;
    },
    onSuccess: () => {
      toast({ title: "Template mis à jour" });
      queryClient.invalidateQueries({ queryKey: currentKey });
      setPicking(false);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const current = currentQuery.data?.current ?? null;
  const parent = currentQuery.data?.parent ?? null;

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Mon template</h2>
          <p className="text-sm text-muted-foreground">
            Le template gouverne le vocabulaire, les modules par défaut et la TVA suggérée.
          </p>
        </div>
      </header>

      {currentQuery.isLoading ? (
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 h-32 animate-pulse" />
      ) : current ? (
        <div className="rounded-2xl border overflow-hidden bg-white dark:bg-zinc-900">
          <div
            className={cn(
              "h-24 bg-gradient-to-br flex items-center justify-between px-5",
              current.coverGradient ?? "from-zinc-500 to-zinc-700",
            )}
          >
            <div className="text-white space-y-0.5 min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-white/80">
                {parent?.name ?? "Vertical"}
              </p>
              <h3 className="font-bold text-lg sm:text-xl truncate">{current.name}</h3>
              {current.tagline && (
                <p className="text-sm text-white/85 truncate">{current.tagline}</p>
              )}
            </div>
            <IconRenderer name={current.icon} className="w-12 h-12 text-white" />
          </div>
          <div className="p-5 sm:p-6 space-y-4">
            {current.idealFor && (
              <p className="text-sm text-muted-foreground italic">{current.idealFor}</p>
            )}
            {current.featuresHighlight.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                  Inclus dans ce template
                </p>
                <ul className="grid sm:grid-cols-2 gap-1.5">
                  {current.featuresHighlight.map((f, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(current.taxRules).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                  TVA suggérée
                </p>
                <div className="flex flex-wrap gap-2" data-testid="template-tax-rules">
                  {Object.entries(current.taxRules)
                    .filter(([k]) => TAX_RULES_LABELS[k])
                    .map(([k, v]) => {
                      const lbl = TAX_RULES_LABELS[k];
                      return (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1 text-xs"
                          title={lbl.label}
                        >
                          <span className="text-muted-foreground">{lbl.short}</span>
                          <span className="font-mono font-semibold">{formatTaxRuleValue(k, v)}</span>
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                data-testid="template-switch-open"
              >
                <Pencil className="w-4 h-4" />
                Changer de template
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-700/40 p-5 sm:p-6 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold">Aucun template défini</h3>
              <p className="text-sm text-muted-foreground">
                Choisissez un template d'activité pour bénéficier d'un vocabulaire métier, de modules adaptés et de la TVA par défaut.
              </p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                data-testid="template-pick-open"
              >
                Choisir un template
              </button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <TemplatePickerModal
          currentId={current?.id ?? null}
          onPick={(t) => switchMutation.mutate(t.id)}
          onClose={() => setPicking(false)}
          submitting={switchMutation.isPending}
        />
      )}
    </section>
  );
}

interface ModalProps {
  currentId: number | null;
  onPick: (t: ApiTemplate) => void;
  onClose: () => void;
  submitting: boolean;
}

function TemplatePickerModal({ currentId, onPick, onClose, submitting }: ModalProps) {
  const [verticals, setVerticals] = useState<ApiTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<ApiTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) return;
        const data = (await res.json()) as { templates: ApiTemplate[] };
        if (cancelled) return;
        setVerticals(data.templates);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allSubs = useMemo(() => {
    const out: ApiTemplate[] = [];
    for (const top of verticals) {
      for (const c of top.children ?? []) {
        out.push(c);
      }
    }
    return out;
  }, [verticals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSubs;
    return allSubs.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.tagline?.toLowerCase().includes(q) ?? false) ||
        (t.idealFor?.toLowerCase().includes(q) ?? false) ||
        t.slug.includes(q),
    );
  }, [allSubs, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-4xl w-full my-4 sm:my-8 p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
        data-testid="template-picker-modal"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Choisir un template</h3>
            <p className="text-sm text-muted-foreground">
              {confirm
                ? "Confirmez le changement. Vos données restent inchangées."
                : "Sélectionnez le métier qui correspond le mieux à votre activité."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </header>

        {!confirm ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (boulangerie, garage…)"
                className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                data-testid="template-picker-search"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Aucun métier ne correspond à « {search.trim()} ».
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                {filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={t.id === currentId}
                    onSelect={() => setConfirm(t)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <ConfirmSwitch
            target={confirm}
            isCurrent={confirm.id === currentId}
            onCancel={() => setConfirm(null)}
            onConfirm={() => onPick(confirm)}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}

interface ConfirmProps {
  target: ApiTemplate;
  isCurrent: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

function ConfirmSwitch({ target, isCurrent, onCancel, onConfirm, submitting }: ConfirmProps) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "h-20 bg-gradient-to-br rounded-xl flex items-center justify-between px-5",
          target.coverGradient ?? "from-zinc-500 to-zinc-700",
        )}
      >
        <div className="text-white space-y-0.5 min-w-0">
          <h4 className="font-bold text-lg truncate">{target.name}</h4>
          {target.tagline && <p className="text-xs text-white/85 truncate">{target.tagline}</p>}
        </div>
        <IconRenderer name={target.icon} className="w-9 h-9 text-white" />
      </div>

      {isCurrent ? (
        <p className="text-sm text-muted-foreground">
          C'est déjà votre template actuel.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-700/40 px-4 py-3 text-sm">
            <p className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300 mb-1.5">
              <AlertTriangle className="w-4 h-4" /> Ce que ça change
            </p>
            <ul className="space-y-1 text-zinc-700 dark:text-zinc-300">
              <li>· Le vocabulaire et la TVA suggérée s'aligneront sur ce template (vos overrides actuels sont préservés).</li>
              <li>· Les modules activés ne sont pas modifiés automatiquement.</li>
              <li>· Aucune donnée de gestion (achats, employés, fichiers) n'est touchée.</li>
            </ul>
          </div>
          {target.featuresHighlight.length > 0 && (
            <ul className="space-y-1 text-sm">
              {target.featuresHighlight.slice(0, 4).map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-3 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Précédent
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting || isCurrent}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
          data-testid="template-switch-confirm"
        >
          {submitting ? "Mise à jour…" : isCurrent ? "Déjà actuel" : "Confirmer"}
        </button>
      </div>
    </div>
  );
}
