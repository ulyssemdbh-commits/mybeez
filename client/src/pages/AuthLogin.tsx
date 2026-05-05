/**
 * Nominative login page — PR #12, MFA challenge added in PR #13.
 *
 * Two screens:
 *   - "credentials": email + password. Submits to /api/auth/user/login.
 *     If the response is { mfaRequired: true }, switches to "mfa".
 *   - "mfa": 6-digit TOTP code (or recovery code via toggle). On success
 *     the half-baked session is promoted and the page rerenders into
 *     the logged-in dashboard.
 */

import { useState, type FormEvent } from "react";
import { useUserSession } from "@/hooks/useUserSession";
import { Logo } from "@/components/Logo";
import { ArrowRight, Building2, ShieldCheck, LogOut, KeyRound } from "lucide-react";

type Screen = "credentials" | "mfa";

export default function AuthLogin() {
  const {
    login,
    isLoggingIn,
    loginError,
    user,
    tenants,
    logout,
    submitMfaChallenge,
    mfaChallengeError,
    isSubmittingMfaChallenge,
    submitMfaRecovery,
    mfaRecoveryError,
    isSubmittingMfaRecovery,
    cancelMfa,
  } = useUserSession();

  const [screen, setScreen] = useState<Screen>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [mfaMode, setMfaMode] = useState<"totp" | "recovery">("totp");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLocalError, setMfaLocalError] = useState<string | null>(null);

  async function onCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError("Email et mot de passe requis");
      return;
    }
    try {
      const result = await login({ email, password });
      if (result.kind === "mfa") {
        setScreen("mfa");
        setMfaCode("");
        setMfaMode("totp");
        setMfaLocalError(null);
      }
    } catch {
      // server-side message already in loginError
    }
  }

  async function onMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setMfaLocalError(null);
    const trimmed = mfaCode.trim();
    if (!trimmed) {
      setMfaLocalError("Code requis");
      return;
    }
    try {
      if (mfaMode === "totp") {
        await submitMfaChallenge({ code: trimmed });
      } else {
        await submitMfaRecovery({ code: trimmed });
      }
    } catch {
      // surfaced via mfaChallengeError / mfaRecoveryError
    }
  }

  async function onCancelMfa() {
    try {
      await cancelMfa();
    } catch {
      /* best effort */
    }
    setScreen("credentials");
    setMfaCode("");
    setPassword("");
    setMfaLocalError(null);
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
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
            <Logo variant="principal" className="h-80 mx-auto" />
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
              <a
                href="/auth/security"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="logged-in-security-link"
              >
                <KeyRound className="w-4 h-4" />
                Sécurité (MFA)
              </a>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="logged-in-logout"
              >
                <LogOut className="w-4 h-4" />
                {isLoggingOut ? "Déconnexion…" : "Se déconnecter"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "mfa") {
    const submittingMfa = mfaMode === "totp" ? isSubmittingMfaChallenge : isSubmittingMfaRecovery;
    const serverErr = mfaMode === "totp" ? mfaChallengeError : mfaRecoveryError;
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
            <Logo variant="principal" className="h-80 mx-auto" />
          </a>

          <form
            onSubmit={onMfaSubmit}
            className="space-y-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6"
            data-testid="auth-mfa-form"
          >
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Vérification en deux étapes</h1>
              <p className="text-sm text-muted-foreground">
                {mfaMode === "totp"
                  ? "Saisissez le code à 6 chiffres généré par votre application d'authentification."
                  : "Saisissez l'un de vos codes de récupération (chacun ne fonctionne qu'une fois)."}
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="mfa-code" className="text-sm font-medium">
                {mfaMode === "totp" ? "Code à 6 chiffres" : "Code de récupération"}
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode={mfaMode === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                autoFocus
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder={mfaMode === "totp" ? "123456" : "ABCD-EFGH-JKMN"}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="auth-mfa-code"
              />
            </div>

            {(mfaLocalError || serverErr) && (
              <p className="text-sm text-destructive" role="alert">
                {mfaLocalError ?? serverErr}
              </p>
            )}

            <button
              type="submit"
              disabled={submittingMfa}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              data-testid="auth-mfa-submit"
            >
              {submittingMfa ? "Vérification..." : "Vérifier"}
            </button>

            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <button
                type="button"
                onClick={() => {
                  setMfaMode((m) => (m === "totp" ? "recovery" : "totp"));
                  setMfaCode("");
                  setMfaLocalError(null);
                }}
                className="text-primary hover:underline"
                data-testid="auth-mfa-toggle-mode"
              >
                {mfaMode === "totp" ? "Utiliser un code de récupération" : "Utiliser l'application d'authentification"}
              </button>
              <button
                type="button"
                onClick={onCancelMfa}
                className="text-muted-foreground hover:text-foreground"
                data-testid="auth-mfa-cancel"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-80 mx-auto" />
        </a>

        <form
          onSubmit={onCredentialsSubmit}
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
