import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

type Status = "pending" | "success" | "error";

export default function AuthVerify() {
  const [status, setStatus] = useState<Status>("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setErrorMessage("Aucun jeton dans le lien.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/user/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setErrorMessage(body.error ?? "Lien invalide ou expiré.");
          return;
        }
        setStatus("success");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Erreur réseau.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-28 mx-auto" />
        </a>

        <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur rounded-2xl border p-6 space-y-4 text-center" data-testid="verify-card">
          {status === "pending" && (
            <>
              <h1 className="text-xl font-semibold">Vérification…</h1>
              <p className="text-sm text-muted-foreground">Validation de votre email en cours.</p>
            </>
          )}
          {status === "success" && (
            <>
              <h1 className="text-xl font-semibold">Email vérifié</h1>
              <p className="text-sm text-muted-foreground">Votre adresse est confirmée. Vous pouvez maintenant vous connecter.</p>
              <a href="/auth/login" className="inline-block bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
                Se connecter
              </a>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-xl font-semibold">Lien invalide</h1>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <a href="/auth/login" className="inline-block text-sm text-primary hover:underline pt-2">
                Retour à la connexion
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
