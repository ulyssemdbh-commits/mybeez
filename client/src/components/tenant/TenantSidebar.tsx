/**
 * TenantSidebar — left sidebar shown inside the tenant app shell.
 *
 * Groups links by domain: Quotidien / Gestion / Suivi / Paramètres.
 * Highlights the active link based on the current path; for the management
 * group, any /management/<section> path lights up the matching section.
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { tenantPath } from "@/lib/tenantHost";
import { NAV_GROUPS, type NavLink } from "./sections";

interface Props {
  tenantSlug: string;
  /** Current pathname (e.g. "/management/suppliers"). */
  currentPath: string;
}

function isLinkActive(link: NavLink, currentPath: string): boolean {
  if (link.kind === "checklist") return currentPath === "/" || currentPath === "";
  if (link.kind === "management") {
    // /management → matches the default link (suppliers).
    if (currentPath === "/management") {
      return link.path === "/management/suppliers";
    }
    return currentPath === link.path;
  }
  return currentPath === link.path;
}

export function TenantSidebar({ tenantSlug, currentPath }: Props) {
  return (
    <aside
      className="w-60 shrink-0 border-r bg-white dark:bg-zinc-900 hidden md:flex flex-col"
      aria-label="Navigation tenant"
    >
      <div className="px-4 py-4 border-b">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider truncate">
          {tenantSlug}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </p>
            {group.links.map((link) => {
              const active = isLinkActive(link, currentPath);
              const Icon = link.icon;
              return (
                <Link key={link.path} href={tenantPath(tenantSlug, link.path)}>
                  <a
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    )}
                    data-testid={`tenant-nav-${link.testId}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </a>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** Horizontal scrollable tabs shown below the header on mobile. */
export function TenantMobileTabs({ tenantSlug, currentPath }: Props) {
  // Flatten all links for the mobile bar.
  const allLinks = NAV_GROUPS.flatMap((g) => g.links);

  return (
    <div className="md:hidden border-b bg-white dark:bg-zinc-900 overflow-x-auto">
      <div className="flex gap-1 px-3 py-2 min-w-max">
        {allLinks.map((link) => {
          const active = isLinkActive(link, currentPath);
          const Icon = link.icon;
          return (
            <Link key={link.path} href={tenantPath(tenantSlug, link.path)}>
              <a
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                  active
                    ? "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
                data-testid={`tenant-mobile-nav-${link.testId}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{link.label}</span>
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
