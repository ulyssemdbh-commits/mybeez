import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ShieldCheck,
  Building2,
  ArrowLeft,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  viewer: "Viewer",
};

interface TenantDetail {
  id: number;
  slug: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
  businessType: string;
  templateId: number | null;
  templateName: string | null;
  modulesEnabled: string[];
  email: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  userId: number;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isSuperadmin: boolean;
  role: string;
  invitedAt: string;
  acceptedAt: string | null;
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

export default function AdminTenant({ id }: { id: string }) {
  const tenantId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);

  async function refresh() {
    const data = await fetchJson<{ tenant: TenantDetail; members: Member[] }>(
      `/api/admin/tenants/${tenantId}/detail`,
    );
    setTenant(data.tenant);
    setMembers(data.members);
  }

  useEffect(() => {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      setError("Identifiant tenant invalide");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { status?: number };
        if (e.status === 401) {
          setLocation("/auth/login");
          return;
        }
        if (e.status === 403) {
          setError("Accès refusé.");
        } else if (e.status === 404) {
          setError("Tenant introuvable.");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function runMutation(key: string, fn: () => Promise<void>, successMsg: string) {
    setPendingId(key);
    try {
      await fn();
      toast({ title: successMsg });
      await refresh();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{error ?? "Tenant introuvable"}</h1>
          <a href="/123admin" className="inline-block text-sm text-primary hover:underline">
            Retour à l'admin
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="bg-white dark:bg-zinc-900 border-b border-amber-100/60 dark:border-zinc-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/123admin" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Retour à l'admin</span>
          </a>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <ShieldCheck className="w-3 h-3" />
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="bg-white dark:bg-zinc-900 rounded-2xl border p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{tenant.name}</h1>
                <p className="text-sm text-muted-foreground font-mono">{tenant.slug}.mybeez-ai.com</p>
              </div>
            </div>
            <div>
              {tenant.isActive ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Actif
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300">
                  Inactif
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 text-sm">
            <Field label="Template" value={tenant.templateName ?? tenant.businessType ?? "—"} />
            <Field label="Modules" value={tenant.modulesEnabled.length > 0 ? tenant.modulesEnabled.join(", ") : "—"} />
            <Field label="Fuseau" value={tenant.timezone} />
            <Field label="Email" value={tenant.email ?? "—"} />
            <Field label="Téléphone" value={tenant.phone ?? "—"} />
            <Field label="Créé" value={fmt(tenant.createdAt)} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              Membres ({members.length})
            </h2>
          </div>

          <AddMemberForm
            disabled={pendingId === "add"}
            onSubmit={async (email, role) => {
              await runMutation(
                "add",
                () => mutate(`/api/admin/tenants/${tenantId}/members`, "POST", { email, role }),
                "Membre ajouté",
              );
            }}
          />

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Rôle</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Ajouté</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun membre. Utilisez le formulaire ci-dessus pour en ajouter un.
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const busy = pendingId?.startsWith(`m${m.userId}-`) ?? false;
                      return (
                        <tr key={m.userId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{m.email}</td>
                          <td className="px-4 py-3 text-muted-foreground">{m.fullName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <select
                              value={m.role}
                              disabled={busy}
                              onChange={(e) =>
                                runMutation(
                                  `m${m.userId}-role`,
                                  () => mutate(`/api/admin/tenants/${tenantId}/members/${m.userId}`, "PATCH", { role: e.target.value }),
                                  "Rôle modifié",
                                )
                              }
                              className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {!m.isActive ? (
                              <span className="text-xs text-red-600">Compte désactivé</span>
                            ) : m.acceptedAt ? (
                              <span className="text-xs text-emerald-700 dark:text-emerald-400">Membre</span>
                            ) : (
                              <span className="text-xs text-amber-700 dark:text-amber-400">Invitation en attente</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(m.acceptedAt ?? m.invitedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                title="Retirer du tenant"
                                aria-label="Retirer du tenant"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    title: "Retirer ce membre ?",
                                    body: `${m.email} n'aura plus accès à ${tenant.name}. Le compte utilisateur n'est PAS supprimé — il garde l'accès à ses autres tenants.`,
                                    onConfirm: () =>
                                      runMutation(
                                        `m${m.userId}-del`,
                                        () => mutate(`/api/admin/tenants/${tenantId}/members/${m.userId}`, "DELETE"),
                                        "Membre retiré",
                                      ),
                                  })
                                }
                                className="p-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold">{confirm.title}</h3>
              <button onClick={() => setConfirm(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{confirm.body}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const fn = confirm.onConfirm;
                  setConfirm(null);
                  fn();
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:opacity-90 transition-opacity"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function AddMemberForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (email: string, role: Role) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    await onSubmit(email, role);
    setEmail("");
    setRole("staff");
  }

  return (
    <form
      onSubmit={handle}
      className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end"
    >
      <div className="flex-1 space-y-1 w-full">
        <label htmlFor="add-member-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Email d'un utilisateur existant
        </label>
        <input
          id="add-member-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto">
        <label htmlFor="add-member-role" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Rôle
        </label>
        <select
          id="add-member-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full sm:w-auto rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <UserPlus className="w-4 h-4" />
        Ajouter
      </button>
    </form>
  );
}
