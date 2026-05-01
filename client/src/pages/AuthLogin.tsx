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

export default function AuthLogin() {
  const { login, isLoggingIn, loginError, user } = useUserSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

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

  if (user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Connecté en tant que</p>
          <p className="font-medium">{user.fullName ?? user.email}</p>
          <a href="/" className="text-primary hover:underline text-sm">Retour à l'accueil</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 bg-card rounded-2xl border p-6"
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
          <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
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
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50"
          data-testid="auth-login-submit"
        >
          {isLoggingIn ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
