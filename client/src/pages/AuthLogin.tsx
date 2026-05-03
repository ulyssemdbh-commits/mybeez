/**
 * Nominative login page — PR #12.
 *
 * Minimal viable UI: email + password + submit. Resets, signups,
 * verifies live on the API but get their UI in a follow-up. The page
 * is intentionally framework-light (no Shadcn dialogs etc.) so it
 * loads before the user is auth'd, even if other code splits fail.
 */

import { useState, type FormEvent } from "react";
import { useUserSession } from "@/hooks/useUserSession";
import { Logo } from "@/components/Logo";
import { ArrowRight, Building2, ShieldCheck, LogOut } from "lucide-react";

export default function AuthLogin() {
  const { login, isLoggingIn, loginError, user, tenants, logout } = useUserSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError("Email et mot de passe requis");
      return;
    }
    try {
      await login({ email, password });
    } catch {
      // server-side message already in loginError
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      // Force a fresh page so all per-route guards re-evaluate.
      window.location.href = "/";
    } catch {
      setIsLoggingOut(false);
    }
  }

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
            <Logo variant="principal" className="h-28 mx-auto" />
          </a>

          <div className="bg-white/85 dark:bg-zinc-800/85 backdrop-blur rounded-2xl border p-6 space-y-5">
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted-foreground">Vous êtes déjà connecté</p>
              <p className="text-lg font-semibold">{user.fullName ?? user.email}</p>
              {user.fullName && <p className="text-xs text-muted-foreground">{user.email}</p>}
            </div>

            {(user.isSuperadmin || tenants.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Aller à
                </p>
                <div className="space-y-2">
                  {user.isSuperadmin && (
                    <a
                      href="/123admin"
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/10 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors"
                      data-testid="logged-in-admin-link"
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                        <div>
                          <p className="text-sm font-medium">Admin master</p>
                          <p className="text-xs text-muted-foreground">/123admin</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                    </a>
                  )}
                  {tenants.map((t) => (
                    <a
                      key={t.id}
                      href={t.url}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      data-testid={`logged-in-tenant-${t.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{t.slug}.mybeez-ai.com · {t.role}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!user.isSuperadmin && tenants.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-4 text-sm text-amber-900 dark:text-amber-200">
                Vous n'êtes rattaché à aucun espace pour le moment. Demandez à un administrateur de vous inviter, ou créez votre propre espace.
                <div className="mt-3">
                  <a href="/auth/signup" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:underline">
                    Créer un espace
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="logged-in-logout"
              >
                <LogOut className="w-4 h-4" />
                {isLoggingOut ? "Déconnexion…" : "Se déconnecter"}
              </button>
              <a href="/" className="text-sm text-primary hover:underline">
                Retour à l'accueil
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-28 mx-auto" />
        </a>

        <form
          onSubmit={onSubmit}
          className="space-y-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6"
          data-testid="auth-login-form"
        >
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Connexion</h1>
            <p className="text-sm text-muted-foreground">Accédez à votre espace myBeez.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="auth-login-email"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <a
                href="/auth/forgot-password"
                className="text-xs text-primary hover:underline"
                data-testid="auth-login-forgot"
              >
                Mot de passe oublié ?
              </a>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="auth-login-password"
            />
          </div>

          {(localError || loginError) && (
            <p className="text-sm text-destructive" role="alert">
              {localError ?? loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            data-testid="auth-login-submit"
          >
            {isLoggingIn ? "Connexion..." : "Se connecter"}
          </button>

          <p className="text-center text-sm text-muted-foreground pt-2 border-t">
            Pas encore de compte ?{" "}
            <a
              href="/auth/signup"
              className="text-primary font-medium hover:underline"
              data-testid="auth-login-signup-link"
            >
              S'inscrire
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
