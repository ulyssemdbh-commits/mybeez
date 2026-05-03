import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";

export default function AuthResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Lien invalide");
      return;
    }
    if (password.length < 12) {
      setError("Le mot de passe doit faire au moins 12 caractères");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Lien invalide ou expiré");
      }
      setSuccess(true);
      setTimeout(() => setLocation("/auth/login"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (token === null) {
    // Still parsing the URL — render nothing for one frame.
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-28 mx-auto" />
        </a>

        <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6 space-y-4">
          {!token ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-semibold">Lien invalide</h1>
              <p className="text-sm text-muted-foreground">
                Aucun jeton trouvé. Vérifiez le lien dans votre email ou demandez un nouveau lien.
              </p>
              <a href="/auth/forgot-password" className="inline-block text-sm text-primary hover:underline pt-2">
                Demander un nouveau lien
              </a>
            </div>
          ) : success ? (
            <div className="space-y-3 text-center" data-testid="reset-success">
              <h1 className="text-xl font-semibold">Mot de passe mis à jour</h1>
              <p className="text-sm text-muted-foreground">Redirection vers la connexion…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" data-testid="reset-form">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Nouveau mot de passe</h1>
                <p className="text-sm text-muted-foreground">Au moins 12 caractères.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium">Nouveau mot de passe</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="reset-password"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm" className="text-sm font-medium">Confirmer</label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="reset-confirm"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                data-testid="reset-submit"
              >
                {isSubmitting ? "Validation..." : "Réinitialiser"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
