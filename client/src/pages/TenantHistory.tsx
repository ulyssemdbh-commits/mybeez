/**
 * TenantHistory — section "Suivi" of the tenant app shell.
 *
 * Currently a placeholder until PR #9 (history-cross : recherche
 * historique cross-modules + export CSV).
 */

import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { SectionPlaceholder } from "@/components/management/SectionPlaceholder";

export default function TenantHistory({ slug }: { slug: string }) {
  return (
    <TenantAppShell tenantSlug={slug} title="Historique" subtitle="Suivi">
      <SectionPlaceholder
        label="Historique"
        description="Recherche par date et par module + export CSV — disponible prochainement."
      />
    </TenantAppShell>
  );
}
