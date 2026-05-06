/**
 * TemplateCard — affiche un sub-template dans le picker (Step 2).
 *
 * Carte cliquable, état "selected" mis en évidence, contenu :
 *   - bandeau gradient avec icône Lucide + nom + tagline
 *   - "Idéal pour" (idealFor)
 *   - bullets featuresHighlight avec icône Check
 *   - notIncluded en repli (toggle "Voir ce qui n'est pas inclus")
 */

import { useState } from "react";
import { Check, Info, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconRenderer } from "./IconRenderer";
import type { ApiTemplate } from "./types";

interface Props {
  template: ApiTemplate;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, selected, onSelect }: Props) {
  const [showNotIncluded, setShowNotIncluded] = useState(false);

  return (
    <article
      className={cn(
        "group relative rounded-2xl border-2 bg-white dark:bg-zinc-900 overflow-hidden transition-all duration-200",
        "hover:border-amber-400 hover:shadow-lg hover:-translate-y-0.5",
        selected
          ? "border-amber-500 shadow-lg shadow-amber-500/20 ring-2 ring-amber-500/30"
          : "border-zinc-200 dark:border-zinc-800",
      )}
      data-testid={`template-card-${template.slug}`}
      data-selected={selected}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 rounded-2xl"
      >
        {/* Cover gradient */}
        <div
          className={cn(
            "h-20 sm:h-24 bg-gradient-to-br flex items-center justify-between px-4 sm:px-5 relative overflow-hidden",
            template.coverGradient ?? "from-zinc-500 to-zinc-700",
          )}
        >
          <div className="text-white space-y-0.5 z-10 min-w-0 flex-1">
            <h3 className="font-bold text-base sm:text-lg leading-tight truncate">{template.name}</h3>
            {template.tagline && (
              <p className="text-xs text-white/85 truncate">{template.tagline}</p>
            )}
          </div>
          <IconRenderer
            name={template.icon}
            className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 text-white/90 z-10"
          />
          {selected && (
            <span className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-amber-600 shadow">
              <Check className="w-4 h-4" />
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3">
          {template.idealFor && (
            <p className="text-xs text-muted-foreground italic flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{template.idealFor}</span>
            </p>
          )}

          {template.featuresHighlight.length > 0 && (
            <ul className="space-y-1.5">
              {template.featuresHighlight.map((f, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-zinc-700 dark:text-zinc-300">{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </button>

      {/* notIncluded - non clickable inside the main button to keep it accessible */}
      {template.notIncluded.length > 0 && (
        <div className="border-t bg-zinc-50/60 dark:bg-zinc-800/40 px-4 sm:px-5 py-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowNotIncluded((v) => !v);
            }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            data-testid={`template-not-included-toggle-${template.slug}`}
          >
            {showNotIncluded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ce qui n'est pas inclus ({template.notIncluded.length})
          </button>
          {showNotIncluded && (
            <ul className="mt-2 space-y-0.5">
              {template.notIncluded.map((n, i) => (
                <li key={i} className="text-xs text-muted-foreground pl-4">
                  · {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
