/**
 * Étape 3 — Création du compte (formulaire) + résumé du template choisi.
 *
 * Affiche un récap du template sélectionné en haut (icône + nom + 3-4
 * featuresHighlight) avec un lien "Choisir une autre activité" qui
 * ramène à l'étape 2.
 *
 * Slug auto-généré depuis tenantName tant que l'utilisateur ne l'a pas
 * touché manuellement. Validation côté backend (anti-conflit) déléguée
 * à `/api/onboarding/signup-with-tenant`.
 */

import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, Edit3, Check } from "lucide-react";
import { IconRenderer } from "./IconRenderer";
import type { ApiTemplate, SignupAccountForm } from "./types";

interface Props {
  template: ApiTemplate;
  form: SignupAccountForm;
  onChange: (next: SignupAccountForm) => void;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  errors: FieldErrors;
  generalError: string | null;
}

export interface FieldErrors {
  email?: string;
  password?: string;
  tenantName?: string;
  tenantSlug?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
}

export function SignupStep3Account({
  template,
  form,
  onChange,
  onBack,
  onSubmit,
  submitting,
  errors,
  generalError,
}: Props) {
  const [slugTouched, setSlugTouched] = useState(false);

  // Auto-generate slug from tenantName as long as user hasn't manually edited it.
  useEffect(() => {
    if (!slugTouched) {
      onChange({ ...form, tenantSlug: slugify(form.tenantName) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tenantName, slugTouched]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit();
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          data-testid="step3-back"
        >
          <ChevronLeft className="w-4 h-4" />
          Changer d'activité
        </button>

        {/* Template recap */}
        <div className="rounded-2xl border bg-gradient-to-br from-amber-50/80 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className={`shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${template.coverGradient ?? "from-zinc-500 to-zinc-700"} flex items-center justify-center shadow-sm`}
            >
              <IconRenderer name={template.icon} className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Check className="w-3 h-3" /> Activité choisie
              </p>
              <h3 className="font-bold text-base sm:text-lg leading-tight mt-0.5">{template.name}</h3>
              {template.tagline && <p className="text-sm text-muted-foreground mt-0.5">{template.tagline}</p>}
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-amber-700 dark:text-amber-400 hover:underline mt-1.5 inline-flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                Choisir une autre activité
              </button>
            </div>
          </div>

          {template.featuresHighlight.length > 0 && (
            <ul className="mt-3 sm:mt-4 grid sm:grid-cols-2 gap-1.5 pt-3 border-t border-amber-200/50 dark:border-amber-800/30">
              {template.featuresHighlight.slice(0, 4).map((f, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-center pt-1">
          <h2 className="text-2xl sm:text-3xl font-bold">Votre compte</h2>
          <p className="text-sm text-muted-foreground">
            Dernière étape. Sans carte bancaire, sans engagement.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="signup-form">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Vous
          </legend>

          <Field label="Email" htmlFor="signup-email" error={errors.email}>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              className={inputCls}
              data-testid="signup-email"
            />
          </Field>

          <Field label="Nom complet (optionnel)" htmlFor="signup-fullname">
            <input
              id="signup-fullname"
              type="text"
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => onChange({ ...form, fullName: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="Mot de passe" htmlFor="signup-password" hint="Au moins 12 caractères." error={errors.password}>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={form.password}
              onChange={(e) => onChange({ ...form, password: e.target.value })}
              className={inputCls}
              data-testid="signup-password"
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Votre espace
          </legend>

          <Field label="Nom de votre entreprise" htmlFor="signup-tenant-name" error={errors.tenantName}>
            <input
              id="signup-tenant-name"
              type="text"
              required
              maxLength={120}
              value={form.tenantName}
              onChange={(e) => onChange({ ...form, tenantName: e.target.value })}
              className={inputCls}
              placeholder="Ex : Café Valentine"
              data-testid="signup-tenant-name"
            />
          </Field>

          <Field
            label="URL de votre espace"
            htmlFor="signup-tenant-slug"
            hint="3 à 30 caractères : lettres minuscules, chiffres et tirets."
            error={errors.tenantSlug}
          >
            <div className="flex items-stretch rounded-lg border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-amber-500">
              <input
                id="signup-tenant-slug"
                type="text"
                required
                pattern="[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?"
                value={form.tenantSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  onChange({ ...form, tenantSlug: e.target.value.toLowerCase() });
                }}
                className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none font-mono"
                placeholder="cafe-valentine"
                data-testid="signup-tenant-slug"
              />
              <span className="bg-zinc-100 dark:bg-zinc-700/50 px-3 py-2 text-sm text-muted-foreground select-none">
                .mybeez-ai.com
              </span>
            </div>
          </Field>
        </fieldset>

        {generalError && (
          <p
            className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2"
            role="alert"
          >
            {generalError}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Précédent
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors"
            data-testid="signup-submit"
          >
            {submitting ? "Création de votre espace…" : "Créer mon espace"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
