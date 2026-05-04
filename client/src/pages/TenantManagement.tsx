/**
 * TenantManagement — section "Gestion" of the tenant app shell.
 *
 * Routes :
 *   - /management              → redirect to /management/<default>
 *   - /management/:section     → renders the matching section UI
 *
 * The shell (sidebar, header, auth gate, membership gate) is provided by
 * TenantAppShell. This file just dispatches the right section component.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { SectionPlaceholder } from "@/components/management/SectionPlaceholder";
import { SuppliersSection } from "@/components/management/sections/SuppliersSection";
import {
  DEFAULT_MANAGEMENT_SECTION,
  isManagementSection,
  managementSectionLabel,
} from "@/components/tenant/sections";
import { tenantPath } from "@/lib/tenantHost";

interface Props {
  slug: string;
  section?: string;
  isSubdomain: boolean;
}

export default function TenantManagement({ slug, section }: Props) {
  const [, setLocation] = useLocation();

  const requested = section?.toLowerCase();
  const activeSection = requested && isManagementSection(requested) ? requested : DEFAULT_MANAGEMENT_SECTION;

  useEffect(() => {
    if (section === undefined || (requested && !isManagementSection(requested))) {
      setLocation(tenantPath(slug, `/management/${DEFAULT_MANAGEMENT_SECTION}`), { replace: true });
    }
  }, [section, requested, slug, setLocation]);

  return (
    <TenantAppShell tenantSlug={slug} title={managementSectionLabel(activeSection)} subtitle="Gestion">
      <SectionContent section={activeSection} tenantSlug={slug} />
    </TenantAppShell>
  );
}

function SectionContent({ section, tenantSlug }: { section: string; tenantSlug: string }) {
  if (section === "suppliers") {
    return <SuppliersSection tenantSlug={tenantSlug} />;
  }

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
      label={managementSectionLabel(section)}
      description={descriptions[section]}
    />
  );
}
