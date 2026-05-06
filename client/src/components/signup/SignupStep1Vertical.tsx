/**
 * Étape 1 — Choix du grand domaine d'activité (vertical top-level).
 *
 * 4 cards : Commerce de bouche, Services, Retail, Santé & bien-être.
 * Chacune annonce le nombre de métiers disponibles dans la vertical.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconRenderer } from "./IconRenderer";
import type { ApiTemplate } from "./types";

interface Props {
  verticals: ApiTemplate[];
  selected: ApiTemplate | null;
  onSelect: (vertical: ApiTemplate) => void;
}

export function SignupStep1Vertical({ verticals, selected, onSelect }: Props) {
  return (
    <div className="space-y-5">
      <header className="text-center space-y-1">
        <h2 className="text-2xl sm:text-3xl font-bold">Vous faites quoi ?</h2>
        <p className="text-sm text-muted-foreground">
          Choisissez votre grand domaine d'activité. On affinera après.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-3">
        {verticals.map((v) => {
          const childCount = v.children?.length ?? 0;
          const isSelected = selected?.id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v)}
              className={cn(
                "group rounded-2xl border-2 bg-white dark:bg-zinc-900 overflow-hidden text-left transition-all duration-200",
                "hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
                isSelected
                  ? "border-amber-500 shadow-lg shadow-amber-500/20 ring-2 ring-amber-500/30"
                  : "border-zinc-200 dark:border-zinc-800",
              )}
              data-testid={`vertical-card-${v.slug}`}
              data-selected={isSelected}
            >
              <div
                className={cn(
                  "h-24 bg-gradient-to-br flex items-center justify-between px-5",
                  v.coverGradient ?? "from-zinc-500 to-zinc-700",
                )}
              >
                <IconRenderer name={v.icon} className="w-10 h-10 text-white" />
                <ChevronRight className="w-5 h-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="p-5 space-y-1.5">
                <h3 className="font-bold text-base sm:text-lg">{v.name}</h3>
                {v.tagline && <p className="text-sm text-muted-foreground">{v.tagline}</p>}
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium pt-1">
                  {childCount} métier{childCount > 1 ? "s" : ""} disponible{childCount > 1 ? "s" : ""} →
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
