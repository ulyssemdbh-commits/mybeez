/**
 * AuthSignup — wizard 3 étapes pour créer compte + tenant.
 *
 *   Step 1  Choix du grand domaine d'activité (vertical top-level)
 *   Step 2  Choix du métier précis (sub-template) avec recherche
 *   Step 3  Compte (email/password) + nom espace + slug, soumis à
 *           POST /api/onboarding/signup-with-tenant
 *
 * Le wizard est URL-stateless ; tout est en useState. La sortie
 * conduit à `data.tenantUrl` (subdomain) en cas de succès.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { SignupProgress } from "@/components/signup/SignupProgress";
import { SignupStep1Vertical } from "@/components/signup/SignupStep1Vertical";
import { SignupStep2Template } from "@/components/signup/SignupStep2Template";
import { SignupStep3Account, type FieldErrors } from "@/components/signup/SignupStep3Account";
import type {
  ApiTemplate,
  SignupAccountForm,
  WizardStep,
  WizardSelection,
} from "@/components/signup/types";

export default function AuthSignup() {
  const [step, setStep] = useState<WizardStep>(1);
  const [verticals, setVerticals] = useState<ApiTemplate[]>([]);
  const [selection, setSelection] = useState<WizardSelection>({
    vertical: null,
    template: null,
  });
  const [form, setForm] = useState<SignupAccountForm>({
    email: "",
    password: "",
    fullName: "",
    tenantName: "",
    tenantSlug: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Load templates tree at mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) return;
        const data = (await res.json()) as { templates: ApiTemplate[] };
        if (cancelled) return;
        setVerticals(data.templates);
      } catch {
        /* network silently failed; user will see no options */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectVertical(v: ApiTemplate) {
    setSelection({ vertical: v, template: null });
    setStep(2);
  }

  function selectTemplate(t: ApiTemplate) {
    setSelection((s) => ({ ...s, template: t }));
  }

  async function submitAccount() {
    if (!selection.template) return;

    // Local validation.
    const local: FieldErrors = {};
    if (!form.email) local.email = "Email requis";
    if (form.password.length < 12) local.password = "Au moins 12 caractères";
    if (!form.tenantName) local.tenantName = "Nom de l'entreprise requis";
    if (!form.tenantSlug) local.tenantSlug = "URL requise";
    setErrors(local);
    setGeneralError(null);
    if (Object.keys(local).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/signup-with-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          tenantName: form.tenantName,
          tenantSlug: form.tenantSlug,
          templateId: selection.template.id,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.field === "email") {
          setErrors({ email: data.error });
        } else if (data.field === "tenantSlug") {
          setErrors({
            tenantSlug: data.suggestion
              ? `${data.error}. Suggestion : ${data.suggestion}`
              : data.error,
          });
          if (data.suggestion) {
            setForm((f) => ({ ...f, tenantSlug: data.suggestion as string }));
          }
        } else {
          setGeneralError(data.error ?? "Erreur de création");
        }
        return;
      }

      // Success: redirect to the new tenant subdomain.
      if (data.tenantUrl) {
        window.location.href = data.tenantUrl;
      } else {
        window.location.href = "/auth/login";
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  function jumpTo(target: WizardStep) {
    if (target < step) setStep(target);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-3xl mx-auto space-y-6">
        <a href="/" className="block" aria-label="Retour à l'accueil myBeez">
          <Logo variant="principal" className="h-24 sm:h-32 mx-auto" />
        </a>

        <SignupProgress current={step} onJump={jumpTo} />

        <div className="bg-white/90 dark:bg-zinc-900/85 backdrop-blur rounded-2xl border p-5 sm:p-8 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {step === 1 && (
                <SignupStep1Vertical
                  verticals={verticals}
                  selected={selection.vertical}
                  onSelect={selectVertical}
                />
              )}
              {step === 2 && selection.vertical && (
                <SignupStep2Template
                  vertical={selection.vertical}
                  selected={selection.template}
                  onSelect={selectTemplate}
                  onBack={() => setStep(1)}
                  onContinue={() => setStep(3)}
                />
              )}
              {step === 3 && selection.template && (
                <SignupStep3Account
                  template={selection.template}
                  form={form}
                  onChange={setForm}
                  onBack={() => setStep(2)}
                  onSubmit={submitAccount}
                  submitting={submitting}
                  errors={errors}
                  generalError={generalError}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <a href="/auth/login" className="text-amber-700 dark:text-amber-400 font-medium hover:underline">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
