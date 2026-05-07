/**
 * TenantVocabularySection — édition des overrides vocabulary du tenant.
 *
 * Backend : GET /api/management/:slug/settings + PATCH .../vocabulary
 * Le placeholder de chaque champ est la valeur **héritée du template**
 * courant (lue via /api/management/:slug/template) — vider = revenir
 * au défaut hérité.
 *
 * Le vocabulaire affecte directement Alfred (system prompt) et
 * potentiellement plus tard les libellés UI.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VOCABULARY_KEYS, VOCABULARY_KEYS_META, type VocabularyKey } from "../../../../shared/modules";

interface SettingsResponse {
  vocabulary: Record<string, string>;
  modulesEnabled: string[];
}

interface TemplateResponse {
  current: { vocabulary?: Record<string, string> } | null;
}

interface Props {
  tenantSlug: string;
}

export function TenantVocabularySection({ tenantSlug }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsKey = ["/api/management", tenantSlug, "settings"] as const;
  const templateKey = ["/api/management", tenantSlug, "template"] as const;

  const settingsQuery = useQuery<SettingsResponse>({
    queryKey: settingsKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
  });

  const templateQuery = useQuery<TemplateResponse>({
    queryKey: templateKey,
    queryFn: async () => {
      const res = await fetch(`/api/management/${tenantSlug}/template`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur de chargement");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<Partial<Record<VocabularyKey, string>>>({});

  // Load draft from server on mount and reset when query refreshes.
  useEffect(() => {
    const v = settingsQuery.data?.vocabulary ?? {};
    const next: Partial<Record<VocabularyKey, string>> = {};
    for (const k of VOCABULARY_KEYS) {
      next[k] = v[k] ?? "";
    }
    setDraft(next);
  }, [settingsQuery.data]);

  const inheritedVocab = templateQuery.data?.current?.vocabulary ?? {};
  const tenantVocab = settingsQuery.data?.vocabulary ?? {};

  const isDirty = VOCABULARY_KEYS.some((k) => {
    const current = (tenantVocab[k] ?? "");
    const drafted = (draft[k] ?? "");
    return current !== drafted;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | undefined> = {};
      for (const k of VOCABULARY_KEYS) {
        const v = draft[k];
        payload[k] = v && v.trim().length > 0 ? v.trim() : undefined;
      }
      const res = await fetch(`/api/management/${tenantSlug}/vocabulary`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabulary: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vocabulaire mis à jour" });
      queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Vocabulaire</h2>
        <p className="text-sm text-muted-foreground">
          Personnalisez les mots utilisés par Alfred et l'interface. Vide = on garde le défaut du template.
        </p>
      </header>

      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-4">
        {settingsQuery.isLoading || templateQuery.isLoading ? (
          <div className="h-32 animate-pulse" />
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              {VOCABULARY_KEYS_META.map((meta) => {
                const inherited = inheritedVocab[meta.key];
                const placeholder = inherited ?? meta.exampleNeutral;
                return (
                  <label key={meta.key} className="block space-y-1.5">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <input
                      type="text"
                      maxLength={40}
                      value={draft[meta.key] ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [meta.key]: e.target.value }))
                      }
                      placeholder={placeholder}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      data-testid={`vocab-${meta.key}`}
                    />
                    <span className="block text-xs text-muted-foreground">{meta.description}</span>
                  </label>
                );
              })}
            </div>

            <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/40 px-3 py-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Alfred utilise déjà ces mots. Exemple : pour un cabinet médical, mettez « consultation » sur Élément et « patient » sur Client — Alfred parlera des « consultations cochées » au lieu des « éléments cochés ».
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-amber-500"
                data-testid="vocab-save"
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
