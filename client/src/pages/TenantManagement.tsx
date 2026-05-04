/**
 * TenantManagement — back-office gestion d'un tenant.
 *
 * Layout : sidebar gauche (md+) ou onglets horizontaux (mobile) qui
 * rassemble les 10 sections opérationnelles (suppliers, purchases,
 * expenses, bank, cash, files, employees, payroll, absences, analytics).
 *
 * Route accessible via :
 *   - subdomain : /management/:section
 *   - legacy    : /:tenantSlug/management/:section
 *
 * Les sections sont des placeholders dans cette PR (#1) et sont remplacées
 * progressivement par les vraies UI dans les PRs #2-#8.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LogOut, ShieldAlert } from "lucide-react";
import { useUserSession } from "@/hooks/useUserSession";
import { Logo } from "@/components/Logo";
import {
  ManagementSidebar,
  ManagementMobileTabs,
  MANAGEMENT_SECTIONS,
  DEFAULT_SECTION_SLUG,
  isValidSectionSlug,
  getSectionLabel,
} from "@/components/management/ManagementSidebar";
import { SectionPlaceholder } from "@/components/management/SectionPlaceholder";
import { SuppliersSection } from "@/components/management/sections/SuppliersSection";

interface Props {
  slug: string;
  section?: string;
  /**
   * `true` when accessed via tenant subdomain (`/management/:section`),
   * `false` when accessed via legacy path-based (`/:slug/management/:section`).
   * Drives whether section links are root-relative or slug-prefixed.
   */
  isSubdomain: boolean;
}

export default function TenantManagement({ slug, section, isSubdomain }: Props) {
  const [, setLocation] = useLocation();
  const { user, tenants, isLoading, logout } = useUserSession();

  const basePath = isSubdomain ? "/management" : `/${slug}/management`;
  const homePath = isSubdomain ? "/" : `/${slug}`;

  const requestedSection = section?.toLowerCase();
  const activeSection = isValidSectionSlug(requestedSection)
    ? requestedSection!
    : DEFAULT_SECTION_SLUG;

  // Normalize URL: missing or invalid section → redirect to default.
  useEffect(() => {
    if (section === undefined) {
      setLocation(`${basePath}/${DEFAULT_SECTION_SLUG}`, { replace: true });
      return;
    }
    if (!isValidSectionSlug(requestedSection)) {
      setLocation(`${basePath}/${DEFAULT_SECTION_SLUG}`, { replace: true });
    }
  }, [section, requestedSection, basePath, setLocation]);

  // Auth gate: redirect to login if not authenticated.
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

  if (!user) {
    // Redirect is in-flight; render nothing.
    return null;
  }

  // Membership gate: superadmins bypass; everyone else must be in user_tenants.
  const membership = tenants.find((t) => t.slug === slug);
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
            Vous n'êtes pas membre de l'espace <span className="font-mono">{slug}</span>.
            Contactez l'administrateur du compte pour être ajouté à l'équipe.
          </p>
          <a href="/auth/login" className="inline-block text-sm text-primary hover:underline">
            Retour à la connexion
          </a>
        </div>
      </div>
    );
  }

  const sectionLabel = getSectionLabel(activeSection);

  async function handleLogout() {
    await logout();
    setLocation("/auth/login");
  }

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <ManagementSidebar active={activeSection} basePath={basePath} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-zinc-900 border-b sticky top-0 z-10">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <a
                href={homePath}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="management-back"
                aria-label="Retour à la checklist"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Retour</span>
              </a>
              <Logo variant="picto" className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate" data-testid="management-tenant-name">
                  {membership?.name ?? slug}
                </p>
                <h1 className="text-sm font-semibold truncate" data-testid="management-section-title">
                  {sectionLabel}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline text-xs text-muted-foreground" data-testid="management-user">
                {user.fullName ?? user.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                data-testid="management-logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
          <ManagementMobileTabs active={activeSection} basePath={basePath} />
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-7xl w-full mx-auto">
          <SectionContent section={activeSection} tenantSlug={slug} />
        </main>
      </div>
    </div>
  );
}

function SectionContent({ section, tenantSlug }: { section: string; tenantSlug: string }) {
  if (section === "suppliers") {
    return <SuppliersSection tenantSlug={tenantSlug} />;
  }

  const meta = MANAGEMENT_SECTIONS.find((s) => s.slug === section);
  if (!meta) return <SectionPlaceholder label="Section inconnue" />;

  const descriptions: Record<string, string> = {
    purchases: "Suivi des factures fournisseurs : montants, échéances, statut de paiement.",
    expenses: "Dépenses générales hors fournisseurs : abonnements, frais récurrents.",
    bank: "Mouvements bancaires : encaissements, prélèvements, rapprochement.",
    cash: "Caisse : entrées et sorties d'espèces, fonds de caisse.",
    files: "Fichiers : factures, contrats, documents administratifs.",
    employees: "Employés : fiches contact, contrats, salaires.",
    payroll: "Paie mensuelle : brut, net, charges sociales, primes.",
    absences: "Congés et absences : demandes, validation, calendrier.",
    analytics: "Tableau de bord : KPIs, tendances, top fournisseurs.",
  };

  return (
    <SectionPlaceholder
      label={meta.label}
      description={descriptions[section] ?? undefined}
    />
  );
}
