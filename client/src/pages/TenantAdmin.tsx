/**
 * TenantAdmin — section "Paramètres tenant" du shell.
 *
 * Premier bloc concret : "Mon template" (lecture + switch). Plus tard :
 * vocabulary overrides, modules toggle, branding, intégrations.
 */

import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { TenantTemplateSection } from "@/components/templates/TenantTemplateSection";

export default function TenantAdmin({ slug }: { slug: string }) {
  return (
    <TenantAppShell tenantSlug={slug} title="Paramètres tenant" subtitle="Paramétrage de l'espace">
      <div className="space-y-8">
        <TenantTemplateSection tenantSlug={slug} />
      </div>
    </TenantAppShell>
  );
}
