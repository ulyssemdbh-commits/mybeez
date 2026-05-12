/**
 * TenantHistory — section "Suivi" of the tenant app shell.
 *
 * Routes `/history` to the unified audit_log feed (PR #88 backend,
 * PR #92 UI). Filters by module / action / date range / userId,
 * paginated, with deep-link to the underlying business row when the
 * event carries one.
 */

import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { HistorySection } from "@/components/management/sections/HistorySection";

export default function TenantHistory({ slug }: { slug: string }) {
  return (
    <TenantAppShell tenantSlug={slug} title="Historique" subtitle="Suivi">
      <HistorySection tenantSlug={slug} />
    </TenantAppShell>
  );
}
