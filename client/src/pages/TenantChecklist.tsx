/**
 * TenantChecklist — daily checklist for a tenant.
 *
 * Auth model :
 *   - Nominative member (user has a `user_tenants` row for this slug, or is
 *     superadmin) → full `TenantAppShell` with sidebar.
 *   - Anyone else → "Connexion requise" screen with a link to /auth/login.
 *
 * The legacy PIN gate (shared device-paired tablet flow) was removed
 * with chore/purge-pin-auth ; it will be re-introduced later as a
 * per-staff device-paired token (cf. project_mybeez_decisions Phase 2).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserSession } from "@/hooks/useUserSession";
import { AlfredChat } from "@/components/alfred/AlfredChat";
import { TenantAppShell } from "@/components/tenant/TenantAppShell";
import { cn } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
  zone?: number;
  items: Item[];
}

interface Item {
  id: number;
  name: string;
  isChecked: boolean;
}

interface Dashboard {
  total: number;
  checked: number;
  unchecked: number;
  uncheckedItems: string[];
  date: string;
}

export default function TenantChecklist({ slug }: { slug: string }) {
  const { user: nomUser, tenants: nomTenants, isLoading: nomLoading } = useUserSession();

  if (nomLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  const isNominativeMember = !!nomUser && (nomUser.isSuperadmin || nomTenants.some((t) => t.slug === slug));

  if (isNominativeMember) {
    return (
      <TenantAppShell
        tenantSlug={slug}
        title="Aujourd'hui"
        subtitle="Checklist du jour"
        headerExtra={<ChecklistProgress slug={slug} />}
      >
        <ChecklistContent slug={slug} />
      </TenantAppShell>
    );
  }

  return <AuthRequired slug={slug} />;
}

function AuthRequired({ slug }: { slug: string }) {
  const target = `/auth/login?redirect=${encodeURIComponent(`/${slug}`)}`;
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-bold capitalize">{slug}</h1>
        <p className="text-sm text-muted-foreground">
          Vous devez être connecté à votre compte myBeez pour accéder à la checklist.
        </p>
        <a
          href={target}
          className="inline-block px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
          data-testid="login-link"
        >
          Se connecter
        </a>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ChecklistProgress({ slug }: { slug: string }) {
  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ["/api/checklist", slug, "dashboard"],
    queryFn: () => fetch(`/api/checklist/${slug}/dashboard`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30000,
  });
  if (!dashboard) return null;
  const pct = dashboard.total > 0 ? Math.round((dashboard.checked / dashboard.total) * 100) : 0;
  return (
    <div className="hidden sm:flex flex-col items-end gap-1 mr-2">
      <span className="text-xs tabular-nums text-muted-foreground" data-testid="shell-progress-pct">
        {dashboard.checked}/{dashboard.total} ({pct}%)
      </span>
      <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChecklistContent({ slug }: { slug: string }) {
  const queryClient = useQueryClient();

  const { data: categories, isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ["/api/checklist", slug, "categories"],
    queryFn: () => fetch(`/api/checklist/${slug}/categories`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ["/api/checklist", slug, "dashboard"],
    queryFn: () => fetch(`/api/checklist/${slug}/dashboard`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: (data: { itemId: number; isChecked: boolean }) =>
      fetch(`/api/checklist/${slug}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist", slug] });
    },
  });

  return (
    <div className="space-y-6 pb-20">
      {catsLoading && <div className="text-center text-muted-foreground animate-pulse py-8">Chargement...</div>}

      {categories?.map((cat) => (
        <div key={cat.id} className="space-y-1" data-testid={`category-${cat.id}`}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {cat.name}
          </h2>
          <div className="bg-card rounded-xl border divide-y">
            {cat.items.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleMutation.mutate({ itemId: item.id, isChecked: !item.isChecked })}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                  item.isChecked ? "bg-green-50/50 dark:bg-green-950/20" : "hover:bg-muted/30",
                )}
                data-testid={`item-${item.id}`}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  item.isChecked ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/30",
                )}>
                  {item.isChecked && <span className="text-xs">✓</span>}
                </div>
                <span className={cn(
                  "text-sm flex-1",
                  item.isChecked && "line-through text-muted-foreground",
                )}>
                  {item.name}
                </span>
              </button>
            ))}
            {cat.items.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">Aucun item</div>
            )}
          </div>
        </div>
      ))}

      <AlfredChat tenantSlug={slug} checklistContext={dashboard || undefined} />
    </div>
  );
}
