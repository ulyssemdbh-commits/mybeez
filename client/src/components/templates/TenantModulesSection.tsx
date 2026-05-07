/**
 * TenantModulesSection — toggle des modules métier du tenant.
 *
 * Backend : GET /api/management/:slug/settings + PATCH .../modules
 *
 * UX :
 *   - Modules groupés par catégorie (core / gestion / rh)
 *   - Modules `required` non-décochables (badge "Obligatoire")
 *   - Modules `implemented: false` toggleables MAIS marqués "À venir"
 *     (laisse le tenant pré-activer pour quand le module sortira)
 *   - Bouton Enregistrer apparaît seulement si dirty
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MODULE_CATALOG, type ModuleSpec } from "../../../../shared/modules";

interface SettingsResponse {
  vocabulary: Record<string, string>;
  modulesEnabled: string[];
}

interface Props {
  tenantSlug: string;
}

const CATEGORY_LABELS: Record<ModuleSpec["category"], string> = {
  core: "Cœur",
  gestion: "Gestion",
  rh: "RH",
};

export function TenantModulesSection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsKey = ["/api/management", tenantSlug, "settings"] as const;

  const settingsQuery = useQuery<SettingsResponse>({
    queryKey: settingsKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Set<string>>(new Set());

  useEffect(() => {
    const enabled = settingsQuery.data?.modulesEnabled ?? [];
    setDraft(new Set(enabled));
  }, [settingsQuery.data]);

  const grouped = useMemo(() => {
    const out: Record<ModuleSpec["category"], ModuleSpec[]> = { core: [], gestion: [], rh: [] };
    for (const m of MODULE_CATALOG) out[m.category].push(m);
    return out;
  }, []);

  const tenantEnabled = useMemo(
    () => new Set(settingsQuery.data?.modulesEnabled ?? []),
    [settingsQuery.data],
  );

  const isDirty = useMemo(() => {
    if (tenantEnabled.size !== draft.size) return true;
    for (const s of draft) if (!tenantEnabled.has(s)) return true;
    return false;
  }, [tenantEnabled, draft]);

  function toggle(slug: string, spec: ModuleSpec) {
    if (spec.required) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/modules`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulesEnabled: Array.from(draft) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Modules mis à jour" });
      queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Modules</h2>
        <p className="text-sm text-muted-foreground">
          Activez ou désactivez les fonctionnalités disponibles pour votre activité.
        </p>
      </header>

      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-5">
        {settingsQuery.isLoading ? (
          <div className="h-40 animate-pulse" />
        ) : (
          <>
            {(["core", "gestion", "rh"] as const).map((cat) => (
              <div key={cat} className="space-y-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {grouped[cat].map((m) => {
                    const checked = draft.has(m.slug);
                    return (
                      <button
                        key={m.slug}
                        type="button"
                        onClick={() => toggle(m.slug, m)}
                        disabled={m.required}
                        className={cn(
                          "text-left rounded-xl border-2 p-3 transition-all",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                          checked
                            ? "border-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600",
                          m.required && "cursor-default opacity-90",
                          !m.implemented && "border-dashed",
                        )}
                        data-testid={`module-${m.slug}`}
                        data-checked={checked}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={cn(
                              "shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors",
                              checked
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "border-zinc-300 dark:border-zinc-600",
                            )}
                          >
                            {checked && <span className="text-xs leading-none">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold">{m.label}</span>
                              {m.required && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide font-bold text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                  <Lock className="w-2.5 h-2.5" /> Obligatoire
                                </span>
                              )}
                              {!m.implemented && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                  <Clock className="w-2.5 h-2.5" /> À venir
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-amber-500"
                data-testid="modules-save"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
