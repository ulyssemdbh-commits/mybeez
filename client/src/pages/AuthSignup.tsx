import { useEffect, useMemo, useState, type FormEvent } from "react";

interface ApiTemplateNode {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
  children?: ApiTemplateNode[];
}

interface FlatTemplate {
  id: number;
  slug: string;
  name: string;
  parentName: string;
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

function flattenTemplates(tree: ApiTemplateNode[]): FlatTemplate[] {
  const out: FlatTemplate[] = [];
  for (const top of tree) {
    for (const child of top.children ?? []) {
      out.push({ id: child.id, slug: child.slug, name: child.name, parentName: top.name });
    }
  }
  return out;
}

interface FieldErrors {
  email?: string;
  password?: string;
  tenantName?: string;
  tenantSlug?: string;
  templateId?: string;
  general?: string;
}

export default function AuthSignup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<FlatTemplate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Auto-generate slug from tenant name until the user manually edits it.
  useEffect(() => {
    if (!slugTouched) {
      setTenantSlug(slugify(tenantName));
    }
  }, [tenantName, slugTouched]);

  // Load templates for the picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) return;
        const data = (await res.json()) as { templates: ApiTemplateNode[] };
        if (cancelled) return;
        setTemplates(flattenTemplates(data.templates));
      } catch {
        /* network silently failed; the user will see no options */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, FlatTemplate[]>();
    for (const t of templates) {
      const arr = groups.get(t.parentName) ?? [];
      arr.push(t);
      groups.set(t.parentName, arr);
    }
    return Array.from(groups.entries());
  }, [templates]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const local: FieldErrors = {};
    if (!email) local.email = "Email requis";
    if (password.length < 12) local.password = "Au moins 12 caractères";
    if (!tenantName) local.tenantName = "Nom de l'entreprise requis";
    if (!tenantSlug) local.tenantSlug = "URL requise";
    if (!templateId) local.templateId = "Choisissez votre activité";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/signup-with-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          fullName: fullName || undefined,
          tenantName,
          tenantSlug,
          templateId: Number(templateId),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.field === "email") {
          setErrors({ email: data.error });
        } else if (data.field === "tenantSlug") {
          setErrors({
            tenantSlug:
              data.suggestion
                ? `${data.error}. Suggestion : ${data.suggestion}`
                : data.error,
          });
          if (data.suggestion) setTenantSlug(data.suggestion);
        } else {
          setErrors({ general: data.error ?? "Erreur de création" });
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
      setErrors({ general: err instanceof Error ? err.message : "Erreur réseau" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <a href="/" className="block text-center space-y-3" aria-label="Retour à l'accueil myBeez">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-2xl font-bold text-white">B</span>
          </div>
          <span className="block text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            myBeez
          </span>
        </a>

        <form
          onSubmit={onSubmit}
          className="bg-white/85 dark:bg-zinc-800/85 backdrop-blur rounded-2xl border p-6 sm:p-8 space-y-6"
          data-testid="signup-form"
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Créer votre espace myBeez</h1>
            <p className="text-sm text-muted-foreground">
              5 minutes pour démarrer. Sans carte bancaire, sans engagement.
            </p>
          </div>

          {/* ===== ACCOUNT ===== */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
              Votre compte
            </legend>

            <div className="space-y-1">
              <label htmlFor="signup-email" className="text-sm font-medium">Email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="signup-email"
              />
              {errors.email && <p className="text-xs text-destructive" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-fullname" className="text-sm font-medium">Nom complet <span className="text-muted-foreground font-normal">(optionnel)</span></label>
              <input
                id="signup-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-password" className="text-sm font-medium">Mot de passe</label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="signup-password"
              />
              <p className="text-xs text-muted-foreground">Au moins 12 caractères.</p>
              {errors.password && <p className="text-xs text-destructive" role="alert">{errors.password}</p>}
            </div>
          </fieldset>

          {/* ===== TENANT ===== */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
              Votre activité
            </legend>

            <div className="space-y-1">
              <label htmlFor="signup-tenant-name" className="text-sm font-medium">Nom de votre entreprise</label>
              <input
                id="signup-tenant-name"
                type="text"
                required
                maxLength={120}
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ex : Café Valentine"
                data-testid="signup-tenant-name"
              />
              {errors.tenantName && <p className="text-xs text-destructive" role="alert">{errors.tenantName}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-tenant-slug" className="text-sm font-medium">URL de votre espace</label>
              <div className="flex items-stretch rounded-lg border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                <input
                  id="signup-tenant-slug"
                  type="text"
                  required
                  pattern="[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?"
                  value={tenantSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setTenantSlug(e.target.value.toLowerCase());
                  }}
                  className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none font-mono"
                  placeholder="cafe-valentine"
                  data-testid="signup-tenant-slug"
                />
                <span className="bg-zinc-100 dark:bg-zinc-700/50 px-3 py-2 text-sm text-muted-foreground select-none">.mybeez-ai.com</span>
              </div>
              <p className="text-xs text-muted-foreground">
                3 à 30 caractères : lettres minuscules, chiffres et tirets.
              </p>
              {errors.tenantSlug && <p className="text-xs text-destructive" role="alert">{errors.tenantSlug}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-template" className="text-sm font-medium">Type d'activité</label>
              <select
                id="signup-template"
                required
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="signup-template"
              >
                <option value="">— Choisir —</option>
                {groupedOptions.map(([parentName, items]) => (
                  <optgroup key={parentName} label={parentName}>
                    {items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errors.templateId && <p className="text-xs text-destructive" role="alert">{errors.templateId}</p>}
            </div>
          </fieldset>

          {errors.general && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2" role="alert">
              {errors.general}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            data-testid="signup-submit"
          >
            {submitting ? "Création de votre espace…" : "Créer mon espace"}
          </button>

          <p className="text-center text-sm text-muted-foreground pt-2 border-t">
            Vous avez déjà un compte ?{" "}
            <a href="/auth/login" className="text-primary font-medium hover:underline">
              Se connecter
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
