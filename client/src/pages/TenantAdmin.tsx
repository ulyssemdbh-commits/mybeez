/**
 * TenantAdmin — section "Paramètres tenant" du shell.
 *
 * Trois blocs de configuration tenant :
 *   1. Mon template (template courant + switch)
 *   2. Vocabulaire (overrides item / checklist / customer)
 *   3. Modules (toggle des modules métier disponibles)
 */

import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { TenantTemplateSection } from "@/components/templates/TenantTemplateSection";
import { TenantVocabularySection } from "@/components/templates/TenantVocabularySection";
import { TenantModulesSection } from "@/components/templates/TenantModulesSection";

export default function TenantAdmin({ slug }: { slug: string }) {
  return (
    <TenantAppShell tenantSlug={slug} title="Paramètres tenant" subtitle="Paramétrage de l'espace">
      <div className="space-y-8">
        <TenantTemplateSection tenantSlug={slug} />
        <TenantVocabularySection tenantSlug={slug} />
        <TenantModulesSection tenantSlug={slug} />
      </div>
    </TenantAppShell>
  );
}
