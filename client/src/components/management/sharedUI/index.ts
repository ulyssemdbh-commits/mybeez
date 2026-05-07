/**
 * sharedUI — composants génériques pour les pages Management.
 *
 * Adapté de `ulysseclaude/client/src/pages/suguval/shared.tsx` pour
 * coller au design system myBeez :
 *   - palette amber (au lieu de orange ulysseclaude)
 *   - dark-mode via classes Tailwind `dark:` (pas de hook custom)
 *   - localStorage prefix `mybeez-` (au lieu de `sugu-`)
 *   - aucun couplage métier (CategoryBadge prend ses couleurs en props
 *     plutôt que d'embarquer un dictionnaire restaurant-spécifique)
 *
 * Pour les primitives (Dialog, Input, Select, Label), on utilise
 * directement les composants Shadcn déjà installés (`@/components/ui/*`).
 */

export { CollapsibleCard } from "./CollapsibleCard";
export { StatCard, type StatCardColor, type TrendData } from "./StatCard";
export { CategoryBadge } from "./CategoryBadge";
export { PeriodFilter } from "./PeriodFilter";
export {
  computePeriodDates,
  usePeriodFilter,
  type PeriodKey,
  type PeriodDates,
  type UsePeriodFilterReturn,
} from "./period";
