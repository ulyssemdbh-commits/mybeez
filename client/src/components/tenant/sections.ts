/**
 * Tenant navigation registry.
 *
 * Single source of truth for the unified left sidebar shown to logged-in
 * tenant members. Groups link entries by domain (Quotidien / Gestion /
 * Suivi / Paramètres). Reused by TenantSidebar.
 */

import {
  CheckSquare,
  Truck,
  ShoppingCart,
  Receipt,
  Landmark,
  Wallet,
  FolderOpen,
  Users,
  Banknote,
  CalendarOff,
  BarChart3,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type LinkKind = "checklist" | "management" | "history" | "admin";

export interface NavLink {
  /** URL fragment relative to the tenant root (eg. "/management/suppliers"). */
  path: string;
  label: string;
  icon: LucideIcon;
  /** Coarse category — drives `data-testid` and active-link matching. */
  kind: LinkKind;
  /** Stable id used in `data-testid="tenant-nav-<id>"`. */
  testId: string;
  /**
   * Module governing the visibility of this link. If set, the link is
   * shown only when `tenant.modulesEnabled` includes this slug. Links
   * without a `moduleSlug` are always visible (admin, history attached
   * to checklist already enforced by `moduleSlug: "checklist"`).
   */
  moduleSlug?: string;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

const GESTION_LINKS: NavLink[] = [
  { path: "/management/suppliers", label: "Fournisseurs", icon: Truck, kind: "management", testId: "suppliers", moduleSlug: "suppliers" },
  { path: "/management/purchases", label: "Achats", icon: ShoppingCart, kind: "management", testId: "purchases", moduleSlug: "purchases" },
  { path: "/management/expenses", label: "Dépenses", icon: Receipt, kind: "management", testId: "expenses", moduleSlug: "expenses" },
  { path: "/management/bank", label: "Banque", icon: Landmark, kind: "management", testId: "bank", moduleSlug: "bank" },
  { path: "/management/cash", label: "Caisse", icon: Wallet, kind: "management", testId: "cash", moduleSlug: "cash" },
  { path: "/management/files", label: "Fichiers", icon: FolderOpen, kind: "management", testId: "files", moduleSlug: "files" },
  { path: "/management/analytics", label: "Analytics", icon: BarChart3, kind: "management", testId: "analytics", moduleSlug: "analytics" },
];

const RH_LINKS: NavLink[] = [
  { path: "/management/employees", label: "Employés", icon: Users, kind: "management", testId: "employees", moduleSlug: "employees" },
  { path: "/management/payroll", label: "Paie", icon: Banknote, kind: "management", testId: "payroll", moduleSlug: "payroll" },
  { path: "/management/absences", label: "Absences", icon: CalendarOff, kind: "management", testId: "absences", moduleSlug: "absences" },
];

/** All management-section links flattened — used to validate :section URL params. */
export const MANAGEMENT_LINKS: NavLink[] = [...GESTION_LINKS, ...RH_LINKS];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Quotidien",
    links: [
      { path: "/", label: "Aujourd'hui", icon: CheckSquare, kind: "checklist", testId: "today", moduleSlug: "checklist" },
    ],
  },
  {
    label: "Gestion",
    links: GESTION_LINKS,
  },
  {
    label: "Gestion RH",
    links: RH_LINKS,
  },
  {
    label: "Suivi",
    links: [
      { path: "/history", label: "Historique", icon: History, kind: "history", testId: "history", moduleSlug: "checklist" },
    ],
  },
  {
    label: "Paramètres",
    links: [
      { path: "/admin", label: "Paramètres tenant", icon: Settings, kind: "admin", testId: "admin" },
    ],
  },
];

/**
 * Filtre les NAV_GROUPS pour ne garder que les links dont le moduleSlug
 * est dans `enabledModules`. Les links sans `moduleSlug` (ex. admin)
 * passent toujours. Un groupe vide après filtrage est retiré.
 *
 * `enabledModules === null` (settings pas encore chargés) → on retourne
 * NAV_GROUPS tel quel pour éviter un flash de sidebar vide.
 */
export function filterNavGroupsByModules(
  groups: NavGroup[],
  enabledModules: Set<string> | null,
): NavGroup[] {
  if (enabledModules === null) return groups;
  const out: NavGroup[] = [];
  for (const g of groups) {
    const links = g.links.filter((l) => !l.moduleSlug || enabledModules.has(l.moduleSlug));
    if (links.length > 0) out.push({ ...g, links });
  }
  return out;
}

export const DEFAULT_MANAGEMENT_SECTION = "suppliers";

/** Returns the management section slug if the path is /management/<slug>, else null. */
export function managementSection(path: string): string | null {
  const m = path.match(/^\/management(?:\/([^/]+))?$/);
  if (!m) return null;
  return m[1] ?? DEFAULT_MANAGEMENT_SECTION;
}

export function isManagementSection(slug: string): boolean {
  return MANAGEMENT_LINKS.some((l) => l.path === `/management/${slug}`);
}

export function managementSectionLabel(slug: string): string {
  return MANAGEMENT_LINKS.find((l) => l.path === `/management/${slug}`)?.label ?? slug;
}
