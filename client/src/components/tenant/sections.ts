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
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

const GESTION_LINKS: NavLink[] = [
  { path: "/management/suppliers", label: "Fournisseurs", icon: Truck, kind: "management", testId: "suppliers" },
  { path: "/management/purchases", label: "Achats", icon: ShoppingCart, kind: "management", testId: "purchases" },
  { path: "/management/expenses", label: "Dépenses", icon: Receipt, kind: "management", testId: "expenses" },
  { path: "/management/bank", label: "Banque", icon: Landmark, kind: "management", testId: "bank" },
  { path: "/management/cash", label: "Caisse", icon: Wallet, kind: "management", testId: "cash" },
  { path: "/management/files", label: "Fichiers", icon: FolderOpen, kind: "management", testId: "files" },
  { path: "/management/analytics", label: "Analytics", icon: BarChart3, kind: "management", testId: "analytics" },
];

const RH_LINKS: NavLink[] = [
  { path: "/management/employees", label: "Employés", icon: Users, kind: "management", testId: "employees" },
  { path: "/management/payroll", label: "Paie", icon: Banknote, kind: "management", testId: "payroll" },
  { path: "/management/absences", label: "Absences", icon: CalendarOff, kind: "management", testId: "absences" },
];

/** All management-section links flattened — used to validate :section URL params. */
export const MANAGEMENT_LINKS: NavLink[] = [...GESTION_LINKS, ...RH_LINKS];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Quotidien",
    links: [
      { path: "/", label: "Aujourd'hui", icon: CheckSquare, kind: "checklist", testId: "today" },
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
      { path: "/history", label: "Historique", icon: History, kind: "history", testId: "history" },
    ],
  },
  {
    label: "Paramètres",
    links: [
      { path: "/admin", label: "Paramètres tenant", icon: Settings, kind: "admin", testId: "admin" },
    ],
  },
];

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
