/**
 * CollapsibleCard — carte titrée avec collapse persistant via localStorage.
 *
 * Adapté de `ulysseclaude/client/src/pages/suguval/shared.tsx` (Card).
 * Différences :
 *   - localStorage key préfixé `mybeez-card-*` (au lieu de `sugu-card-*`)
 *   - Drop du hook `useSuguDark` : le dark-mode est géré via classes
 *     Tailwind `dark:` automatiques sur la racine `<html class="dark">`
 *   - Palette amber (myBeez) au lieu d'orange (ulysseclaude)
 *
 * Usage : enroule un bloc d'écran qui peut être plié pour gagner de
 * l'espace vertical, l'état est persisté entre sessions (par
 * navigateur).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  /** Action(s) à droite du header (boutons, toggles). */
  action?: ReactNode;
  /** Identifiant stable pour la persistance localStorage. Si absent,
   *  dérivé du `title` slugifié. */
  cardId?: string;
  /** État initial (avant lecture localStorage). Défaut : ouvert. */
  defaultCollapsed?: boolean;
  className?: string;
}

const STORAGE_PREFIX = "mybeez-card-";

export function CollapsibleCard({
  title,
  icon: Icon,
  children,
  action,
  cardId,
  defaultCollapsed,
  className,
}: Props) {
  const storageKey = useMemo(() => {
    const raw = cardId || title;
    return raw ? `${STORAGE_PREFIX}${raw.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
  }, [cardId, title]);

  const [collapsed, setCollapsed] = useState(() => {
    if (!storageKey || typeof window === "undefined") return defaultCollapsed ?? false;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "collapsed") return true;
    if (saved === "expanded") return false;
    return defaultCollapsed ?? false;
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded");
  }, [collapsed, storageKey]);

  return (
    <section
      className={cn(
        "bg-white dark:bg-zinc-900 border rounded-2xl shadow-sm overflow-hidden",
        className,
      )}
      data-testid={cardId ? `card-${cardId}` : undefined}
    >
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-5 h-5 text-amber-500 shrink-0" />
          <h2 className="font-semibold text-sm sm:text-base truncate">{title}</h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {action}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="p-2 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={collapsed ? "Agrandir la carte" : "Réduire la carte"}
            aria-label={collapsed ? "Agrandir la carte" : "Réduire la carte"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </header>
      {!collapsed && <div className="p-3 sm:p-5">{children}</div>}
    </section>
  );
}
