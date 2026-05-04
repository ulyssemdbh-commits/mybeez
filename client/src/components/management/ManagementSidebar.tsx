import { Link } from "wouter";
import {
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ManagementSection {
  slug: string;
  label: string;
  icon: LucideIcon;
}

export const MANAGEMENT_SECTIONS: ManagementSection[] = [
  { slug: "suppliers", label: "Fournisseurs", icon: Truck },
  { slug: "purchases", label: "Achats", icon: ShoppingCart },
  { slug: "expenses", label: "Dépenses", icon: Receipt },
  { slug: "bank", label: "Banque", icon: Landmark },
  { slug: "cash", label: "Caisse", icon: Wallet },
  { slug: "files", label: "Fichiers", icon: FolderOpen },
  { slug: "employees", label: "Employés", icon: Users },
  { slug: "payroll", label: "Paie", icon: Banknote },
  { slug: "absences", label: "Absences", icon: CalendarOff },
  { slug: "analytics", label: "Analytics", icon: BarChart3 },
];

export const DEFAULT_SECTION_SLUG = MANAGEMENT_SECTIONS[0].slug;

export function isValidSectionSlug(value: string | undefined): boolean {
  if (!value) return false;
  return MANAGEMENT_SECTIONS.some((s) => s.slug === value);
}

export function getSectionLabel(slug: string): string {
  return MANAGEMENT_SECTIONS.find((s) => s.slug === slug)?.label ?? slug;
}

interface Props {
  active: string;
  /**
   * Path prefix (without trailing slash) for section links.
   * - On a tenant subdomain: "/management"
   * - On legacy path-based access: `/${tenantSlug}/management`
   */
  basePath: string;
}

export function ManagementSidebar({ active, basePath }: Props) {
  return (
    <aside
      className="w-60 shrink-0 border-r bg-white dark:bg-zinc-900 hidden md:flex flex-col"
      aria-label="Navigation gestion"
    >
      <div className="px-4 py-5 border-b">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
          Gestion
        </p>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {MANAGEMENT_SECTIONS.map((s) => {
          const isActive = s.slug === active;
          const Icon = s.icon;
          return (
            <Link key={s.slug} href={`${basePath}/${s.slug}`}>
              <a
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
                data-testid={`management-nav-${s.slug}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{s.label}</span>
              </a>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function ManagementMobileTabs({
  active,
  basePath,
}: Props) {
  return (
    <div className="md:hidden border-b bg-white dark:bg-zinc-900 overflow-x-auto">
      <div className="flex gap-1 px-3 py-2 min-w-max">
        {MANAGEMENT_SECTIONS.map((s) => {
          const isActive = s.slug === active;
          const Icon = s.icon;
          return (
            <Link key={s.slug} href={`${basePath}/${s.slug}`}>
              <a
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
                data-testid={`management-mobile-nav-${s.slug}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{s.label}</span>
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
