/**
 * PeriodFilter — barre de tabs all / année / trimestre / mois dernier /
 * mois en cours / custom (date range).
 *
 * Branchée à `usePeriodFilter()` (`./period.ts`) côté parent. Tout-en-un :
 * le composant ne sait pas si le mode est custom ou pas — il délègue
 * aux props. Quand `periodKey === "custom"`, deux inputs date apparaissent.
 *
 * UX : tabs amber (myBeez palette) avec pills compactes ; dark-mode
 * géré via Tailwind `dark:` (pas de hook custom comme `useSuguDark`).
 */

import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodKey } from "./period";

interface Props {
  periodKey: PeriodKey;
  setPeriod: (k: PeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}

const TABS: { key: PeriodKey; label: string; icon?: boolean }[] = [
  { key: "all", label: "Tout" },
  { key: "year", label: "Année" },
  { key: "quarter", label: "Trimestre" },
  { key: "last_month", label: "Mois dernier" },
  { key: "month", label: "Mois en cours" },
  { key: "custom", label: "", icon: true },
];

export function PeriodFilter({
  periodKey,
  setPeriod,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" data-testid="period-filter">
      {TABS.map((t) => {
        const active = periodKey === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setPeriod(t.key)}
            className={cn(
              "px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all",
              active
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
            )}
            data-testid={`btn-period-${t.key}`}
            aria-pressed={active}
          >
            {t.icon ? <CalendarRange className="w-3.5 h-3.5" /> : t.label}
          </button>
        );
      })}
      {periodKey === "custom" && (
        <div className="flex items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2 py-1 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-xs flex-1 sm:flex-none"
            data-testid="input-period-from"
            aria-label="Date de début"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2 py-1 rounded-lg border bg-white dark:bg-zinc-800 dark:border-zinc-700 text-xs flex-1 sm:flex-none"
            data-testid="input-period-to"
            aria-label="Date de fin"
          />
        </div>
      )}
    </div>
  );
}
