import { useState, type FormEvent } from "react";

export default function AuthForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Email requis");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/user/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="block text-center space-y-3" aria-label="Retour à l'accueil myBeez">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-2xl font-bold text-white">B</span>
          </div>
          <span className="block text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            myBeez
          </span>
        </a>

        <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6 space-y-4">
          {submitted ? (
            <div className="space-y-3 text-center" data-testid="forgot-success">
              <h1 className="text-xl font-semibold">Email envoyé</h1>
              <p className="text-sm text-muted-foreground">
                Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier vos spams.
              </p>
              <a href="/auth/login" className="inline-block text-sm text-primary hover:underline pt-2">
                Retour à la connexion
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-form">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Mot de passe oublié</h1>
                <p className="text-sm text-muted-foreground">
                  Entrez votre email, nous vous enverrons un lien pour le réinitialiser.
                </p>
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
                  data-testid="forgot-email"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                data-testid="forgot-submit"
              >
                {isSubmitting ? "Envoi..." : "Recevoir le lien"}
              </button>

              <p className="text-center text-sm text-muted-foreground pt-2 border-t">
                <a href="/auth/login" className="text-primary font-medium hover:underline">
                  Retour à la connexion
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
