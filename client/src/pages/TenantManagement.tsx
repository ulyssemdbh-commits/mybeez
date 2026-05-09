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
import { PurchasesSection } from "@/components/management/sections/PurchasesSection";
import { ExpensesSection } from "@/components/management/sections/ExpensesSection";
import { EmployeesSection } from "@/components/management/sections/EmployeesSection";
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
  if (section === "purchases") {
    return <PurchasesSection tenantSlug={tenantSlug} />;
  }
  if (section === "expenses") {
    return <ExpensesSection tenantSlug={tenantSlug} />;
  }
  if (section === "employees") {
    return <EmployeesSection tenantSlug={tenantSlug} />;
  }

  const descriptions: Record<string, string> = {
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
