/**
 * TenantAppShell — single layout for every tenant page accessed by a
 * logged-in nominative user.
 *
 * Provides:
 *   - left sidebar (TenantSidebar) on md+, mobile tabs on smaller screens
 *   - header with tenant name, current section title, user info, logout
 *   - membership gate (redirect to login if no session, "access denied"
 *     if logged-in but not a member)
 *
 * Pages render only their own content as `children`; the shell handles
 * everything else.
 */

import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { LogOut, ShieldAlert } from "lucide-react";
import { useUserSession } from "@/hooks/useUserSession";
import { Logo } from "@/components/Logo";
import { TenantSidebar, TenantMobileTabs } from "./TenantSidebar";

interface Props {
  tenantSlug: string;
  /** Title shown in the top header (e.g. "Fournisseurs", "Aujourd'hui"). */
  title: string;
  /** Optional subtitle shown under the title (e.g. tenant name, date). */
  subtitle?: string;
  /** Optional widget rendered to the right of title (e.g. a small KPI). */
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function TenantAppShell({ tenantSlug, title, subtitle, headerExtra, children }: Props) {
  const [currentPath, setLocation] = useLocation();
  const { user, tenants, isLoading, logout } = useUserSession();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (!user) return null;

  const membership = tenants.find((t) => t.slug === tenantSlug);
  const allowed = user.isSuperadmin || !!membership;

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold">Accès refusé</h1>
          <p className="text-sm text-muted-foreground">
            Vous n'êtes pas membre de l'espace <span className="font-mono">{tenantSlug}</span>.
            Contactez l'administrateur du compte pour être ajouté à l'équipe.
          </p>
          <a href="/auth/login" className="inline-block text-sm text-primary hover:underline">
            Retour à la connexion
          </a>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    setLocation("/auth/login");
  }

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <TenantSidebar tenantSlug={tenantSlug} currentPath={currentPath} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-zinc-900 border-b sticky top-0 z-20">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Logo variant="picto" className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate" data-testid="shell-tenant-name">
                  {membership?.name ?? tenantSlug}
                </p>
                <h1 className="text-sm font-semibold truncate" data-testid="shell-section-title">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {headerExtra}
              <span className="hidden sm:inline text-xs text-muted-foreground" data-testid="shell-user">
                {user.fullName ?? user.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                data-testid="shell-logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
          <TenantMobileTabs tenantSlug={tenantSlug} currentPath={currentPath} />
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
