/**
 * Period filter — logique pure de calcul des bornes de date.
 *
 * Adapté de `ulysseclaude/client/src/pages/suguval/shared.tsx` (porté
 * tel quel — la logique n'a aucun couplage métier ; restaurant ou non,
 * les périodes sont les mêmes). 6 modes :
 *   - all          → "depuis le début" (2024-01-01 à fin année courante)
 *   - year         → année courante (01-01 à 12-31)
 *   - quarter      → trimestre courant
 *   - last_month   → mois précédent (1er au dernier jour)
 *   - month        → mois courant
 *   - custom       → bornes user-définies (from/to)
 *
 * Les sorties sont des chaînes ISO `YYYY-MM-DD` (pas des Date) parce
 * que les filtres de date côté backend (Drizzle, schema text) attendent
 * ce format. Évite les drifts timezone.
 */

import { useState, useMemo, useCallback } from "react";

export type PeriodKey = "all" | "year" | "quarter" | "last_month" | "month" | "custom";

export interface PeriodDates {
  /** Borne inférieure incluse, format `YYYY-MM-DD`. */
  from: string;
  /** Borne supérieure incluse, format `YYYY-MM-DD`. */
  to: string;
  /** Année principale couverte (utile pour les KPI annuels). */
  year: string;
  /** Libellé localisé court (`Année 2026`, `T2 2026`, `mai 2026`, …). */
  label: string;
  /** Le mode courant — pour distinguer custom des autres en UI. */
  key: PeriodKey;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function computePeriodDates(
  key: PeriodKey,
  customFrom?: string,
  customTo?: string,
): PeriodDates {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "all":
      return { from: "2024-01-01", to: `${y}-12-31`, year: `${y}`, label: "Depuis le début", key };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31`, year: `${y}`, label: `Année ${y}`, key };
    case "quarter": {
      const qStartMonth = m - (m % 3);
      const qStart = new Date(y, qStartMonth, 1);
      const qEnd = new Date(y, qStartMonth + 3, 0);
      const qNum = Math.floor(m / 3) + 1;
      return {
        from: `${qStart.getFullYear()}-${pad2(qStart.getMonth() + 1)}-01`,
        to: `${qEnd.getFullYear()}-${pad2(qEnd.getMonth() + 1)}-${pad2(qEnd.getDate())}`,
        year: `${qStart.getFullYear()}`,
        label: `T${qNum} ${y}`,
        key,
      };
    }
    case "last_month": {
      const lm = new Date(y, m - 1, 1);
      const lmEnd = new Date(y, m, 0);
      return {
        from: `${lm.getFullYear()}-${pad2(lm.getMonth() + 1)}-01`,
        to: `${lmEnd.getFullYear()}-${pad2(lmEnd.getMonth() + 1)}-${pad2(lmEnd.getDate())}`,
        year: `${lm.getFullYear()}`,
        label: lm.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        key,
      };
    }
    case "month":
      return {
        from: `${y}-${pad2(m + 1)}-01`,
        to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
        year: `${y}`,
        label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        key,
      };
    case "custom":
      return {
        from: customFrom || `${y}-${pad2(m + 1)}-01`,
        to: customTo || `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
        year: (customFrom || `${y}`).slice(0, 4),
        label: "Personnalisé",
        key,
      };
  }
}

export interface UsePeriodFilterReturn {
  period: PeriodDates;
  periodKey: PeriodKey;
  setPeriod: (k: PeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}

export function usePeriodFilter(defaultKey: PeriodKey = "all"): UsePeriodFilterReturn {
  const [periodKey, setPeriodKey] = useState<PeriodKey>(defaultKey);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const period = useMemo(
    () => computePeriodDates(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );
  const setPeriod = useCallback((k: PeriodKey) => setPeriodKey(k), []);
  return { period, periodKey, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo };
}
