/**
 * TenantChecklist — daily checklist for a tenant.
 *
 * Three rendering modes :
 *   1. Logged-in nominative member → full TenantAppShell with sidebar
 *      (the user has access to Management/History/Admin via the sidebar).
 *   2. PIN-authenticated session (tablet shared by staff) → standalone
 *      full-screen tablet view, no sidebar, no header links.
 *   3. No auth → PIN gate. Once submitted successfully, the session is
 *      a PIN session → mode 2.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useUserSession } from "@/hooks/useUserSession";
import { AlfredChat } from "@/components/alfred/AlfredChat";
import { Logo } from "@/components/Logo";
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
  const { user: pinUser, isAuthenticated: pinAuth, isLoading: pinLoading, login } = useAuth();
  const { user: nomUser, tenants: nomTenants, isLoading: nomLoading } = useUserSession();

  if (nomLoading || pinLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  const isNominativeMember = !!nomUser && (nomUser.isSuperadmin || nomTenants.some((t) => t.slug === slug));

  // Mode 1: nominative member — render inside the unified app shell.
  if (isNominativeMember) {
    return (
      <TenantAppShell
        tenantSlug={slug}
        title="Aujourd'hui"
        subtitle="Checklist du jour"
        headerExtra={<ChecklistProgress slug={slug} />}
      >
        <ChecklistContent slug={slug} clientCode={null} />
      </TenantAppShell>
    );
  }

  // Mode 2: PIN-authenticated — standalone tablet view (no sidebar).
  if (pinAuth) {
    return <ChecklistTabletView slug={slug} clientCode={pinUser?.clientCode ?? null} />;
  }

  // Mode 3: no auth — PIN gate.
  return <PinGate slug={slug} login={login} />;
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

function ChecklistContent({ slug }: { slug: string; clientCode: string | null }) {
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

      <AlfredChat tenantId={slug} checklistContext={dashboard || undefined} />
    </div>
  );
}

function ChecklistTabletView({ slug, clientCode }: { slug: string; clientCode: string | null }) {
  const { data: dashboard } = useQuery<Dashboard>({
    queryKey: ["/api/checklist", slug, "dashboard"],
    queryFn: () => fetch(`/api/checklist/${slug}/dashboard`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const pct = dashboard && dashboard.total > 0 ? Math.round((dashboard.checked / dashboard.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="font-bold text-lg capitalize">{slug}</h1>
            {dashboard && (
              <p className="text-xs text-muted-foreground">
                {dashboard.checked}/{dashboard.total} ({pct}%) — {dashboard.date}
              </p>
            )}
          </div>
          {clientCode && (
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded" data-testid="client-code">
              {clientCode}
            </span>
          )}
        </div>
        {dashboard && (
          <div className="max-w-2xl mx-auto mt-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <ChecklistContent slug={slug} clientCode={clientCode} />
      </div>
    </div>
  );
}

function PinGate({ slug, login }: { slug: string; login: (pin: string, slug: string) => Promise<{ success: boolean; error?: string }> }) {
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const handlePinDigit = (digit: string) => {
    const newPin = pin + digit;
    setPinError("");
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => {
        login(newPin, slug).then((result) => {
          if (!result.success) {
            setPinError(result.error || "Code incorrect");
            setPin("");
          }
        });
      }, 200);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <Logo variant="principal" className="h-72 mx-auto" />
        <h1 className="text-xl font-bold text-foreground capitalize">{slug}</h1>
        <p className="text-sm text-muted-foreground">Entrez votre code PIN</p>

        <div className="flex justify-center gap-2 my-4" data-testid="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all",
                i < pin.length ? "bg-amber-500 border-amber-500 scale-110" : "border-muted-foreground/30",
                pinError && "border-red-500",
              )}
            />
          ))}
        </div>

        {pinError && <p className="text-sm text-red-500" data-testid="pin-error">{pinError}</p>}

        <div className="grid grid-cols-3 gap-3 max-w-[220px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((digit, i) => {
            if (digit === null) return <div key={i} />;
            if (digit === "del") {
              return (
                <button
                  key="del"
                  onClick={() => setPin((p) => p.slice(0, -1))}
                  className="h-14 rounded-xl text-sm text-muted-foreground hover:bg-muted/50 transition"
                  data-testid="pin-delete"
                >
                  ←
                </button>
              );
            }
            return (
              <button
                key={digit}
                onClick={() => handlePinDigit(String(digit))}
                className="h-14 rounded-xl text-lg font-medium hover:bg-amber-500/10 active:bg-amber-500/20 transition"
                data-testid={`pin-digit-${digit}`}
              >
                {digit}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          <a href="/auth/login" className="text-primary hover:underline">Connexion par email</a>
          <span className="mx-2">·</span>
          <span>Compte nominatif (équipe)</span>
        </p>
      </div>
    </div>
  );
}
