import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck,
  ShieldOff,
  Users as UsersIcon,
  Building2,
  LayoutGrid,
  LogOut,
  Pause,
  Play,
  KeyRound,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface Template {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
}

interface ApiTemplateNode {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  children?: ApiTemplateNode[];
}

function flattenTemplates(tree: ApiTemplateNode[]): Template[] {
  const out: Template[] = [];
  for (const top of tree) {
    out.push({ id: top.id, slug: top.slug, name: top.name, parentId: top.parentId });
    for (const child of top.children ?? []) {
      out.push({ id: child.id, slug: child.slug, name: child.name, parentId: child.parentId });
    }
  }
  return out;
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

async function mutate(url: string, method: "PATCH" | "DELETE" | "POST", body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [me, setMe] = useState<SuperadminMe | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const [editTenant, setEditTenant] = useState<AdminTenant | null>(null);

  async function refreshAll() {
    const [s, u, t] = await Promise.all([
      fetchJson<Stats>("/api/admin/stats"),
      fetchJson<{ users: AdminUser[] }>("/api/admin/users"),
      fetchJson<{ tenants: AdminTenant[] }>("/api/admin/tenants"),
    ]);
    setStats(s);
    setUsers(u.users);
    setTenants(t.tenants);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meData = await fetchJson<{ user: SuperadminMe }>("/api/admin/me");
        if (cancelled) return;
        setMe(meData.user);

        const [s, u, t, tpl] = await Promise.all([
          fetchJson<Stats>("/api/admin/stats"),
          fetchJson<{ users: AdminUser[] }>("/api/admin/users"),
          fetchJson<{ tenants: AdminTenant[] }>("/api/admin/tenants"),
          fetchJson<{ templates: ApiTemplateNode[] }>("/api/templates"),
        ]);
        if (cancelled) return;
        setStats(s);
        setUsers(u.users);
        setTenants(t.tenants);
        setTemplates(flattenTemplates(tpl.templates));
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

  async function runMutation(key: string, fn: () => Promise<void>, successMsg: string) {
    setPendingId(key);
    try {
      await fn();
      toast({ title: successMsg });
      await refreshAll();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Action impossible",
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  }

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
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun utilisateur.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = me?.id === u.id;
                      const busy = pendingId?.startsWith(`u${u.id}-`) ?? false;
                      return (
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
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                title={u.isActive ? "Désactiver" : "Réactiver"}
                                disabled={busy || isSelf}
                                onClick={() =>
                                  runMutation(
                                    `u${u.id}-active`,
                                    () => mutate(`/api/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive }),
                                    u.isActive ? "Utilisateur désactivé" : "Utilisateur réactivé",
                                  )
                                }
                              >
                                {u.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </IconButton>
                              <IconButton
                                title={u.isSuperadmin ? "Démoter" : "Promouvoir superadmin"}
                                disabled={busy || isSelf}
                                onClick={() =>
                                  runMutation(
                                    `u${u.id}-super`,
                                    () => mutate(`/api/admin/users/${u.id}`, "PATCH", { isSuperadmin: !u.isSuperadmin }),
                                    u.isSuperadmin ? "Démoté" : "Promu superadmin",
                                  )
                                }
                              >
                                {u.isSuperadmin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                              </IconButton>
                              <IconButton
                                title="Envoyer un lien de réinitialisation"
                                disabled={busy || !u.isActive}
                                onClick={() =>
                                  runMutation(
                                    `u${u.id}-reset`,
                                    () => mutate(`/api/admin/users/${u.id}/send-reset`, "POST"),
                                    "Lien de réinitialisation envoyé",
                                  )
                                }
                              >
                                <KeyRound className="w-4 h-4" />
                              </IconButton>
                              <IconButton
                                title="Supprimer"
                                variant="danger"
                                disabled={busy || isSelf}
                                onClick={() =>
                                  setConfirm({
                                    title: "Supprimer cet utilisateur ?",
                                    body: `${u.email} sera supprimé définitivement, ainsi que ses appartenances aux tenants. Cette action est irréversible.`,
                                    danger: true,
                                    onConfirm: () =>
                                      runMutation(
                                        `u${u.id}-del`,
                                        () => mutate(`/api/admin/users/${u.id}`, "DELETE"),
                                        "Utilisateur supprimé",
                                      ),
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {tenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun tenant.
                      </td>
                    </tr>
                  ) : (
                    tenants.map((t) => {
                      const busy = pendingId?.startsWith(`t${t.id}-`) ?? false;
                      return (
                        <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs">{t.slug}</td>
                          <td className="px-4 py-3 font-medium">{t.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{t.templateName ?? t.businessType ?? "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{t.memberCount}</td>
                          <td className="px-4 py-3">
                            {t.isActive ? <Badge variant="green">Actif</Badge> : <Badge variant="red">Inactif</Badge>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(t.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                title={t.isActive ? "Désactiver" : "Réactiver"}
                                disabled={busy}
                                onClick={() =>
                                  runMutation(
                                    `t${t.id}-active`,
                                    () => mutate(`/api/admin/tenants/${t.id}`, "PATCH", { isActive: !t.isActive }),
                                    t.isActive ? "Tenant désactivé" : "Tenant réactivé",
                                  )
                                }
                              >
                                {t.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </IconButton>
                              <IconButton title="Modifier" disabled={busy} onClick={() => setEditTenant(t)}>
                                <Pencil className="w-4 h-4" />
                              </IconButton>
                              <IconButton
                                title="Supprimer"
                                variant="danger"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    title: "Supprimer ce tenant ?",
                                    body: `Le tenant ${t.slug} (${t.name}) sera supprimé définitivement, ainsi que toutes les données associées (membres, checklists, etc). Cette action est irréversible.`,
                                    danger: true,
                                    onConfirm: () =>
                                      runMutation(
                                        `t${t.id}-del`,
                                        () => mutate(`/api/admin/tenants/${t.id}`, "DELETE"),
                                        "Tenant supprimé",
                                      ),
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const fn = confirm.onConfirm;
            setConfirm(null);
            fn();
          }}
        />
      )}

      {editTenant && (
        <EditTenantDialog
          tenant={editTenant}
          templates={templates}
          onCancel={() => setEditTenant(null)}
          onSave={async (patch) => {
            const id = editTenant.id;
            setEditTenant(null);
            await runMutation(
              `t${id}-edit`,
              () => mutate(`/api/admin/tenants/${id}`, "PATCH", patch),
              "Tenant mis à jour",
            );
          }}
        />
      )}
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

function Badge({ variant, children }: { variant: "amber" | "green" | "red" | "zinc"; children: ReactNode }) {
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

function IconButton({
  children,
  onClick,
  title,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const styles = variant === "danger"
    ? "text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
    : "text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  title,
  body,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 ${
              danger ? "bg-red-600" : "bg-primary"
            }`}
            data-testid="confirm-dialog-confirm"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTenantDialog({
  tenant,
  templates,
  onCancel,
  onSave,
}: {
  tenant: AdminTenant;
  templates: Template[];
  onCancel: () => void;
  onSave: (patch: { name?: string; templateId?: number | null }) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [templateId, setTemplateId] = useState<string>(tenant.templateId !== null ? String(tenant.templateId) : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Modifier le tenant</h3>
            <p className="text-xs text-muted-foreground">Slug : <span className="font-mono">{tenant.slug}</span> (non modifiable)</p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="edit-tenant-name" className="text-sm font-medium">Nom</label>
            <input
              id="edit-tenant-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-tenant-template" className="text-sm font-medium">Template</label>
            <select
              id="edit-tenant-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Aucun —</option>
              {templates
                .filter((t) => t.parentId !== null)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              const patch: { name?: string; templateId?: number | null } = {};
              if (name !== tenant.name) patch.name = name;
              const newTpl = templateId === "" ? null : Number(templateId);
              if (newTpl !== tenant.templateId) patch.templateId = newTpl;
              if (Object.keys(patch).length === 0) {
                onCancel();
                return;
              }
              onSave(patch);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
