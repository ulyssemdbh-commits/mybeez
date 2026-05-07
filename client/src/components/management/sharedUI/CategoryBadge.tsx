/**
 * CategoryBadge — pillule de catégorie générique.
 *
 * Découplé de tout dictionnaire métier : prend `{ label, color }` en props.
 * Chaque module (purchases, expenses, bank…) maintient sa propre table de
 * catégories adaptée au template du tenant — la table peut elle-même être
 * driven par `business_templates.defaultCategories` plus tard.
 *
 * `color` est une chaîne tailwind du genre "bg-amber-500/20 text-amber-700"
 * — laisser le module appelant choisir sa palette pour rester
 * vertical-agnostic (un fournisseur de fournitures et une mission de
 * conseil n'ont rien en commun, le badge non plus).
 */

import { cn } from "@/lib/utils";

interface Props {
  /** Libellé court visible. Si null/undefined, rend un tiret discret. */
  label: string | null | undefined;
  /** Classes Tailwind background+text (cf. JSDoc). Défaut = palette neutre. */
  color?: string;
  className?: string;
}

const NEUTRAL_COLOR =
  "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

export function CategoryBadge({ label, color, className }: Props) {
  if (!label) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
        color || NEUTRAL_COLOR,
        className,
      )}
    >
      {label}
    </span>
  );
}
