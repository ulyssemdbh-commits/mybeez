/**
 * Étape 2 — Choix d'un sub-template dans la vertical sélectionnée.
 *
 * Grid de TemplateCard avec recherche temps réel (filtre par nom,
 * tagline, idealFor). Bouton "Précédent" pour revenir à l'étape 1.
 *
 * "Continuer" reste désactivé tant qu'aucun template n'est sélectionné.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { TemplateCard } from "./TemplateCard";
import type { ApiTemplate } from "./types";

interface Props {
  vertical: ApiTemplate;
  selected: ApiTemplate | null;
  onSelect: (t: ApiTemplate) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SignupStep2Template({ vertical, selected, onSelect, onBack, onContinue }: Props) {
  const [search, setSearch] = useState("");

  const all = useMemo(() => vertical.children ?? [], [vertical.children]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => {
      return (
        t.name.toLowerCase().includes(q) ||
        (t.tagline?.toLowerCase().includes(q) ?? false) ||
        (t.idealFor?.toLowerCase().includes(q) ?? false) ||
        t.slug.includes(q)
      );
    });
  }, [all, search]);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          data-testid="step2-back"
        >
          <ChevronLeft className="w-4 h-4" />
          Changer de domaine
        </button>
        <div className="text-center space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold">Plus précisément ?</h2>
          <p className="text-sm text-muted-foreground">
            Choisissez le métier qui ressemble le plus au vôtre. Vous pourrez ajuster modules et vocabulaire ensuite.
          </p>
        </div>
        {all.length > 4 && (
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un métier (boulangerie, garage…)"
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="step2-search"
            />
          </div>
        )}
      </header>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12" data-testid="step2-no-results">
          Aucun métier ne correspond à « {search.trim()} ».
          <br />
          <a href="mailto:contact@mybeez-ai.com" className="text-amber-600 hover:underline">
            Écrivez-nous
          </a>{" "}
          — on ajoute votre vertical en 24h.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              selected={selected?.id === t.id}
              onSelect={() => onSelect(t)}
            />
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between gap-2 pt-2 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Précédent
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={onContinue}
          className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors"
          data-testid="step2-continue"
        >
          Continuer
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
