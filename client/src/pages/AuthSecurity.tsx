/**
 * Security settings page — MFA enrolment, confirmation and disable.
 *
 * Backend endpoints used:
 *   GET  /api/auth/user/mfa/status
 *   POST /api/auth/user/mfa/setup    (re-auth with password)
 *   POST /api/auth/user/mfa/confirm  (verify first TOTP code)
 *   POST /api/auth/user/mfa/disable  (re-auth with password)
 *
 * State machine:
 *   loading → off | on
 *   off  → "ask-setup-password" → "show-secret-and-codes" → "confirming" → on
 *   on   → "ask-disable-password" → off
 *
 * The recovery codes returned by /setup are shown ONCE on the screen.
 * The user is forced to acknowledge they've copied them before they
 * can move to the QR confirm step.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useUserSession } from "@/hooks/useUserSession";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

interface MfaStatus {
  enabled: boolean;
  confirmedAt: string | null;
  pendingEnrolment: boolean;
  recoveryCodesRemaining: number;
}

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
  recoveryCodes: string[];
  digits: number;
  period: number;
}

type Mode =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "ask-setup-password" }
  | { kind: "show-codes"; data: SetupResponse }
  | { kind: "on" }
  | { kind: "ask-disable-password" };

async function fetchStatus(): Promise<MfaStatus> {
  const res = await fetch("/api/auth/user/mfa/status", { credentials: "include" });
  if (res.status === 401) throw new Error("UNAUTH");
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as MfaStatus;
}

async function postJson<TBody, TResp>(url: string, body: TBody): Promise<TResp> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `${url} ${res.status}`);
  }
  return (await res.json()) as TResp;
}

export default function AuthSecurity() {
  const { user, isLoading: sessionLoading, logout } = useUserSession();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [confirmCode, setConfirmCode] = useState("");
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoadError("Vous devez être connecté pour gérer la sécurité du compte.");
      setMode({ kind: "off" });
      return;
    }
    void reload();
  }, [sessionLoading, user]);

  async function reload() {
    setLoadError(null);
    try {
      const s = await fetchStatus();
      setStatus(s);
      setMode({ kind: s.enabled ? "on" : "off" });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "UNAUTH") setLoadError("Session expirée — reconnectez-vous.");
      else setLoadError("Impossible de récupérer le statut MFA.");
      setMode({ kind: "off" });
    }
  }

  async function onSetupPassword(e: FormEvent) {
    e.preventDefault();
    setPwdErr(null);
    setPwdSubmitting(true);
    try {
      const data = await postJson<{ password: string }, SetupResponse>(
        "/api/auth/user/mfa/setup",
        { password: pwd },
      );
      setMode({ kind: "show-codes", data });
      setPwd("");
      setAcknowledged(false);
      setConfirmCode("");
      setConfirmErr(null);
    } catch (e) {
      setPwdErr((e as Error).message);
    } finally {
      setPwdSubmitting(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setConfirmErr(null);
    setConfirming(true);
    try {
      await postJson<{ code: string }, { success: true }>(
        "/api/auth/user/mfa/confirm",
        { code: confirmCode.trim() },
      );
      await reload();
    } catch (e) {
      setConfirmErr((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function onDisablePassword(e: FormEvent) {
    e.preventDefault();
    setPwdErr(null);
    setPwdSubmitting(true);
    try {
      await postJson<{ password: string }, { success: true }>(
        "/api/auth/user/mfa/disable",
        { password: pwd },
      );
      setPwd("");
      await reload();
    } catch (e) {
      setPwdErr((e as Error).message);
    } finally {
      setPwdSubmitting(false);
    }
  }

  async function copyRecoveryCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user must copy manually */
    }
  }

  if (sessionLoading || mode.kind === "loading") {
    return <PageShell><p className="text-sm text-muted-foreground">Chargement…</p></PageShell>;
  }

  if (!user) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">{loadError ?? "Connexion requise."}</p>
        <a href="/auth/login" className="inline-block mt-4 text-primary hover:underline">Se connecter</a>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <a href="/auth/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </a>
          <button
            onClick={() => logout().then(() => (window.location.href = "/auth/login"))}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Se déconnecter
          </button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-amber-600" />
            Sécurité du compte
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        <section className="rounded-2xl border bg-white/80 dark:bg-zinc-900/60 backdrop-blur p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className={status?.enabled ? "w-5 h-5 text-emerald-600" : "w-5 h-5 text-zinc-400"} />
                Vérification en deux étapes (TOTP)
              </h2>
              <p className="text-sm text-muted-foreground">
                Ajoute un code à 6 chiffres généré par votre application d'authentification (Google Authenticator, 1Password, Authy…) à chaque connexion.
              </p>
            </div>
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold " +
                (status?.enabled
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
              }
              data-testid="mfa-status-badge"
            >
              {status?.enabled ? "Activée" : "Désactivée"}
            </span>
          </div>

          {status?.enabled && (
            <p className="text-xs text-muted-foreground">
              Codes de récupération restants : <span className="font-mono font-semibold">{status.recoveryCodesRemaining}</span>
            </p>
          )}

          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          {/* === OFF: invite to enrol === */}
          {mode.kind === "off" && (
            <button
              onClick={() => {
                setPwdErr(null);
                setPwd("");
                setMode({ kind: "ask-setup-password" });
              }}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
              data-testid="mfa-enable-button"
            >
              Activer la vérification en deux étapes
            </button>
          )}

          {/* === STEP 1: ask password before generating secret === */}
          {mode.kind === "ask-setup-password" && (
            <form onSubmit={onSetupPassword} className="space-y-3" data-testid="mfa-setup-password-form">
              <p className="text-sm text-muted-foreground">Confirmez votre mot de passe pour générer un nouveau secret.</p>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Mot de passe"
                data-testid="mfa-setup-password"
              />
              {pwdErr && <p className="text-sm text-destructive">{pwdErr}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pwdSubmitting}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {pwdSubmitting ? "Génération…" : "Continuer"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode({ kind: "off" })}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* === STEP 2: show QR + recovery codes, then ask first TOTP === */}
          {mode.kind === "show-codes" && (
            <div className="space-y-5" data-testid="mfa-setup-confirm">
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Scannez ce QR code avec votre application d'authentification
                </p>
                <img
                  src={mode.data.qrDataUrl}
                  alt="QR code TOTP"
                  className="w-48 h-48 mx-auto rounded bg-white p-2"
                  data-testid="mfa-qr"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Ou saisissez ce secret manuellement :
                </p>
                <code className="block text-center font-mono text-sm break-all bg-white dark:bg-zinc-900 rounded px-3 py-2 border">
                  {mode.data.secret}
                </code>
              </div>

              <div className="rounded-lg border-2 border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                      Codes de récupération (à conserver précieusement)
                    </p>
                    <p className="text-xs text-rose-800 dark:text-rose-300 mt-1">
                      Ces 10 codes ne s'afficheront plus. Chacun est utilisable une seule fois si vous perdez votre application.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyRecoveryCodes(mode.data.recoveryCodes)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-white/60 dark:hover:bg-zinc-900/60"
                    data-testid="mfa-copy-codes"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copié" : "Copier"}
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {mode.data.recoveryCodes.map((c) => (
                    <li key={c} className="bg-white dark:bg-zinc-900 rounded px-2 py-1 border text-center">
                      {c}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-sm text-rose-900 dark:text-rose-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    data-testid="mfa-ack-codes"
                  />
                  J'ai sauvegardé ces codes en lieu sûr.
                </label>
              </div>

              <form onSubmit={onConfirm} className="space-y-3">
                <label className="text-sm font-medium" htmlFor="mfa-first-code">
                  Pour terminer, saisissez le code à 6 chiffres affiché par votre application
                </label>
                <input
                  id="mfa-first-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  disabled={!acknowledged}
                  placeholder="123456"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono tracking-widest disabled:opacity-50"
                  data-testid="mfa-first-code"
                />
                {confirmErr && <p className="text-sm text-destructive">{confirmErr}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!acknowledged || confirming}
                    className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    data-testid="mfa-confirm"
                  >
                    {confirming ? "Activation…" : "Activer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode({ kind: "off" });
                      setConfirmCode("");
                    }}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* === ON: offer disable === */}
          {mode.kind === "on" && (
            <button
              onClick={() => {
                setPwdErr(null);
                setPwd("");
                setMode({ kind: "ask-disable-password" });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-300"
              data-testid="mfa-disable-button"
            >
              <ShieldOff className="w-4 h-4" />
              Désactiver la vérification en deux étapes
            </button>
          )}

          {/* === DISABLE: ask password === */}
          {mode.kind === "ask-disable-password" && (
            <form onSubmit={onDisablePassword} className="space-y-3" data-testid="mfa-disable-form">
              <p className="text-sm text-muted-foreground">Confirmez votre mot de passe pour désactiver la MFA.</p>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Mot de passe"
                data-testid="mfa-disable-password"
              />
              {pwdErr && <p className="text-sm text-destructive">{pwdErr}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pwdSubmitting}
                  className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {pwdSubmitting ? "Désactivation…" : "Désactiver"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode({ kind: "on" })}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4">
      <div className="max-w-2xl mx-auto pt-8 space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-32 mx-auto" />
        </a>
        {children}
      </div>
    </div>
  );
}
