import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Users as UsersIcon, Building2, LayoutGrid, LogOut } from "lucide-react";

interface SuperadminMe {
  id: number;
  email: string;
  fullName: string | null;
  isSuperadmin: boolean;
}

interface Stats {
  users: { total: number; active: number; verified: number };
  tenants: { total: number; active: number };
  templates: { total: number };
}

interface AdminUser {
  id: number;
  email: string;
  fullName: string | null;
  isSuperadmin: boolean;
  isActive: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  tenantCount: number;
}

interface AdminTenant {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  businessType: string;
  templateId: number | null;
  templateName: string | null;
  createdAt: string;
  memberCount: number;
}

function fmt(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const [me, setMe] = useState<SuperadminMe | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meData = await fetchJson<{ user: SuperadminMe }>("/api/admin/me");
        if (cancelled) return;
        setMe(meData.user);

        const [s, u, t] = await Promise.all([
          fetchJson<Stats>("/api/admin/stats"),
          fetchJson<{ users: AdminUser[] }>("/api/admin/users"),
          fetchJson<{ tenants: AdminTenant[] }>("/api/admin/tenants"),
        ]);
        if (cancelled) return;
        setStats(s);
        setUsers(u.users);
        setTenants(t.tenants);
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { status?: number };
        if (e.status === 401) {
          setLocation("/auth/login");
          return;
        }
        if (e.status === 403) {
          setError("Accès refusé. Cette page est réservée aux super-administrateurs.");
        } else {
          setError(e.message ?? "Erreur de chargement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  async function logout() {
    await fetch("/api/auth/user/logout", { method: "POST", credentials: "include" });
    setLocation("/auth/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{error}</h1>
          <a href="/" className="inline-block text-sm text-primary hover:underline">
            Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="bg-white dark:bg-zinc-900 border-b border-amber-100/60 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2" aria-label="Accueil myBeez">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
              <span className="text-base font-bold text-white">B</span>
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
              myBeez
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
              <ShieldCheck className="w-3 h-3" />
              Admin
            </span>
          </a>
          <div className="flex items-center gap-3">
            {me && (
              <span className="hidden sm:inline text-sm text-muted-foreground" data-testid="admin-me">
                {me.fullName ?? me.email}
              </span>
            )}
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              data-testid="admin-logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={UsersIcon} label="Utilisateurs" value={stats.users.total} sublabel={`${stats.users.active} actifs · ${stats.users.verified} vérifiés`} />
            <StatCard icon={Building2} label="Tenants" value={stats.tenants.total} sublabel={`${stats.tenants.active} actifs`} />
            <StatCard icon={LayoutGrid} label="Templates" value={stats.templates.total} sublabel="vertical disponibles" />
            <StatCard icon={ShieldCheck} label="Super-admins" value={users.filter((u) => u.isSuperadmin).length} sublabel="comptes" />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-amber-600" />
            Utilisateurs ({users.length})
          </h2>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Rôles</th>
                    <th className="px-4 py-3">Tenants</th>
                    <th className="px-4 py-3">Vérifié</th>
                    <th className="px-4 py-3">Dernière connexion</th>
                    <th className="px-4 py-3">Créé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun utilisateur.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{u.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.fullName ?? "—"}</td>
                        <td className="px-4 py-3 space-x-1">
                          {u.isSuperadmin && <Badge variant="amber">Superadmin</Badge>}
                          {!u.isActive && <Badge variant="red">Désactivé</Badge>}
                          {u.isActive && !u.isSuperadmin && <Badge variant="zinc">Standard</Badge>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{u.tenantCount}</td>
                        <td className="px-4 py-3">
                          {u.emailVerifiedAt ? <Badge variant="green">Oui</Badge> : <Badge variant="zinc">Non</Badge>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(u.lastLoginAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(u.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-600" />
            Tenants ({tenants.length})
          </h2>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Membres</th>
                    <th className="px-4 py-3">État</th>
                    <th className="px-4 py-3">Créé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {tenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun tenant.
                      </td>
                    </tr>
                  ) : (
                    tenants.map((t) => (
                      <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{t.slug}</td>
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.templateName ?? t.businessType ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums">{t.memberCount}</td>
                        <td className="px-4 py-3">
                          {t.isActive ? <Badge variant="green">Actif</Badge> : <Badge variant="red">Inactif</Badge>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(t.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-amber-600" />
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sublabel}</div>
    </div>
  );
}

function Badge({ variant, children }: { variant: "amber" | "green" | "red" | "zinc"; children: React.ReactNode }) {
  const styles = {
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
    red: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
