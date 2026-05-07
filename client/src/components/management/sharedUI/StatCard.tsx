/**
 * StatCard — KPI compact avec icône, valeur, label et tendance optionnelle.
 *
 * Adapté de `ulysseclaude/client/src/pages/suguval/shared.tsx` (StatCard).
 * Différences :
 *   - Drop `useSuguDark` au profit de classes Tailwind `dark:`
 *   - 5 couleurs sémantiques : amber (par défaut, myBeez primary), green
 *     (positif), red (négatif), blue (info), purple (différenciation)
 *   - Pas de mode "compact" séparé — la card s'adapte à son conteneur
 *     (utiliser un grid responsive côté parent)
 */

import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardColor = "amber" | "green" | "red" | "blue" | "purple";

export interface TrendData {
  /** Pourcentage à afficher (déjà formaté, ex. "12,5"). */
  pct: string;
  /** True si la direction est favorable (croissance pour CA, décroissance pour coûts). */
  favorable: boolean;
  /** Direction réelle de la tendance (peut être défavorable). */
  dir: "up" | "down";
}

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: StatCardColor;
  trend?: TrendData | null;
  /** Si présent, affiche un badge ⚠ avec ce message en title. */
  warning?: string;
  className?: string;
  testId?: string;
}

const COLOR_LIGHT: Record<StatCardColor, string> = {
  amber: "from-amber-50 to-amber-100/60 border-amber-200",
  green: "from-green-50 to-green-100/60 border-green-200",
  red: "from-red-50 to-red-100/60 border-red-200",
  blue: "from-blue-50 to-blue-100/60 border-blue-200",
  purple: "from-purple-50 to-purple-100/60 border-purple-200",
};

const COLOR_DARK: Record<StatCardColor, string> = {
  amber: "dark:from-amber-500/15 dark:to-amber-600/5 dark:border-amber-500/20",
  green: "dark:from-green-500/15 dark:to-green-600/5 dark:border-green-500/20",
  red: "dark:from-red-500/15 dark:to-red-600/5 dark:border-red-500/20",
  blue: "dark:from-blue-500/15 dark:to-blue-600/5 dark:border-blue-500/20",
  purple: "dark:from-purple-500/15 dark:to-purple-600/5 dark:border-purple-500/20",
};

const ICON_COLOR: Record<StatCardColor, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  green: "text-green-600 dark:text-green-400",
  red: "text-red-600 dark:text-red-400",
  blue: "text-blue-600 dark:text-blue-400",
  purple: "text-purple-600 dark:text-purple-400",
};

function TrendBadge({ trend }: { trend: TrendData }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded",
        trend.favorable
          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
      )}
    >
      {trend.dir === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {trend.pct}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "amber",
  trend,
  warning,
  className,
  testId,
}: Props) {
  return (
    <div
      className={cn(
        "bg-gradient-to-br border rounded-lg px-3 py-2",
        COLOR_LIGHT[color],
        COLOR_DARK[color],
        className,
      )}
      data-testid={testId}
      title={warning || undefined}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4 shrink-0", ICON_COLOR[color])} />
        <p className="text-sm font-bold truncate flex-1">{value}</p>
        <div className="flex items-center gap-1 shrink-0">
          {warning && (
            <span className="text-amber-600 dark:text-amber-400 text-xs" title={warning} aria-label="Avertissement">
              ⚠
            </span>
          )}
          {trend && <TrendBadge trend={trend} />}
        </div>
      </div>
      <p className="text-[10px] mt-0.5 text-muted-foreground truncate">{label}</p>
    </div>
  );
}
