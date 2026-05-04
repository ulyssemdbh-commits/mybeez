/**
 * TenantAdmin — section "Paramètres" of the tenant app shell.
 *
 * Currently a placeholder ; reserved for tenant-level configuration
 * (vocabulary overrides, modules enabled, branding, integrations…).
 */

import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { SectionPlaceholder } from "@/components/management/SectionPlaceholder";

export default function TenantAdmin({ slug }: { slug: string }) {
  return (
    <TenantAppShell tenantSlug={slug} title="Paramètres tenant" subtitle="Paramétrage de l'espace">
      <SectionPlaceholder
        label="Paramètres tenant"
        description="Configuration de l'espace : vocabulaire, modules activés, intégrations — disponible prochainement."
      />
    </TenantAppShell>
  );
}
