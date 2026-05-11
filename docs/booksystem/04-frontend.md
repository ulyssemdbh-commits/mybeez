# Chapitre 04 — Frontend

> **Résumé.** React 18 + Vite 7 + wouter (pas react-router) + TanStack Query 5
> + Shadcn/UI sur Tailwind. 13 pages lazy-loadées. Détection du host pour
> dispatch tenant vs apex. Composants UI partagés portés depuis ulysseclaude
> (`management/sharedUI/`). Sidebar dynamique selon `tenant.modulesEnabled`.
> Wizard signup 3 étapes. Theme HSL + dark mode.

---

## 4.1 Routing

Fichier : `client/src/App.tsx`.

### 4.1.1 Détection host vs path

`getTenantSlugFromHost()` (`client/src/lib/tenantHost.ts`) :

- **Subdomain** `<slug>.mybeez-ai.com` → render tenant routes (`TenantChecklist`,
  `TenantManagement`, …).
- **Apex** `mybeez-ai.com` → render landing/auth/admin.
- **Reserved subdomains** (apex behavior) :
  `www, api, admin, app, static, cdn, mail, blog, status, docs, support, help`.
- **Legacy path-based fallback** (`mybeez-ai.com/:slug`) toléré pour transition.

Helper `tenantPath(slug, section)` construit les liens internes selon le
contexte (subdomain → root-relative, sinon `/:slug/...`).

### 4.1.2 Library

**wouter** (3.3.5) — léger, pas react-router. Match pattern simple :

```tsx
<Route path="/:slug">{(params) => <TenantChecklist slug={params.slug} />}</Route>
```

### 4.1.3 Lazy loading

Toutes les pages sont lazy-loadées (`React.lazy()` + `Suspense`). Réduit le
bundle initial.

---

## 4.2 Pages

Fichier : `client/src/pages/`.

| Page | Statut | Endpoints consommés |
|---|---|---|
| `TenantChecklist.tsx` | ✅ implémentée | `/api/checklist/:slug/*` + SSE |
| `TenantManagement.tsx` | ✅ shell + dispatch sections | `/api/management/:slug/*` |
| `TenantHistory.tsx` | 🟡 stub | aucun |
| `TenantAdmin.tsx` | ✅ "Mon template" + vocabulary + modules toggle | `/api/management/:slug/{template,settings/*}` |
| `Landing.tsx` | ✅ implémentée (hero, verticals dynamiques, FAQ, pricing) | `/api/templates` |
| `Admin.tsx` (`/123admin`) | ✅ implémentée (users, tenants, templates, dialogs) | `/api/admin/*` |
| `AdminTenant.tsx` | 🟡 stub (route non chargée) | aucun |
| `AuthLogin.tsx` | ✅ avec écran MFA challenge intégré | `/api/auth/user/{login,me,logout,mfa/*}` |
| `AuthSignup.tsx` | ✅ wizard 3 étapes | `/api/auth/user/signup`, `/api/templates`, `/api/onboarding/*` |
| `AuthForgotPassword.tsx` | ✅ | `/api/auth/user/forgot-password` |
| `AuthResetPassword.tsx` | ✅ | `/api/auth/user/reset-password` |
| `AuthVerify.tsx` | ✅ | `/api/auth/user/verify-email` |
| `AuthSecurity.tsx` | ✅ enrolment MFA (QR + recovery codes affichés une fois) | `/api/auth/user/mfa/{status,setup,confirm,disable}` |

> **Note** : `TenantChecklist` ne propose plus que le mode nominatif depuis
> PR #55. Si pas de session, écran « Connexion requise ».

---

## 4.3 Composants

Fichier : `client/src/components/`.

### 4.3.1 `ui/` — Shadcn

`badge, button, card, checkbox, dialog, input, scroll-area, select, tabs,
textarea, toast, toaster, tooltip`.

Tous générés via Shadcn CLI, avec helper `cn()` (clsx + tailwind-merge).

### 4.3.2 `tenant/` — Layout tenant

| Composant | Rôle |
|---|---|
| `TenantAppShell.tsx` | Layout unifié (sidebar + content + AlfredChat) pour TenantChecklist/Management/History/Admin |
| `TenantSidebar.tsx` | Nav groupée + variante mobile tabs. **Filtre dynamique** selon `tenant.modulesEnabled` (PR #62) |
| `sections.ts` | Registre nav (id, label, icon, route, requiredModule) |

### 4.3.3 `management/` — Modules métier

| Composant | Rôle |
|---|---|
| `SectionPlaceholder.tsx` | Card "à venir" pour modules non encore livrés |
| `sharedUI/CategoryBadge.tsx` | Badge catégorie coloré par hash |
| `sharedUI/CollapsibleCard.tsx` | Card pliable avec header sticky |
| `sharedUI/PeriodFilter.tsx` | Sélecteur période (jour/semaine/mois/année + custom range) |
| `sharedUI/StatCard.tsx` | KPI card avec icône + delta |
| `sections/SuppliersSection.tsx` | CRUD fournisseurs |
| `sections/PurchasesSection.tsx` | CRUD achats + OCR upload + auto-match supplier |
| `sections/ExpensesSection.tsx` | CRUD dépenses générales |
| `sections/FilesSection.tsx` | Liste documents + upload + corbeille TTL 7j (countdown + restore/hard-delete). PR #78 (recovery commit `16b44d1`). |
| `sections/EmployeesSection.tsx` | Page Gestion RH : stats + table employés + détail collapsible (Documents RH / Absences / Fiches de Paie). PR #76. |
| `sections/BankSection.tsx` | Tabs internes "Comptes" / "Opérations". Comptes : table CRUD avec solde calculé. Opérations : stats credits/debits/net/reconciledRate + filtres date/account/reconciled + table CRUD signée. PR #90. |
| `sections/CashSection.tsx` | Caisse simple : stats in/out/net + filtres date/kind + table CRUD `kind` ('in'\|'out') + amount toujours positif. PR #90. |

> Le `sharedUI/` a été porté depuis ulysseclaude (PR #63). Voir
> `project_mybeez_sprint_plan` pour la stratégie d'adaptation
> (multi-tenant, RBAC, vertical-agnostic).

### 4.3.4 `templates/` — Catalogue verticals

| Composant | Rôle |
|---|---|
| `IconRenderer.tsx` | Whitelist Lucide icons tree-shakable (évite d'importer toute la lib) |
| `TenantTemplateSection.tsx` | Card template courant + picker modal + confirmation switch + TVA suggérée |
| `TenantModulesSection.tsx` | Toggle modules `enabled` par tenant |
| `TenantVocabularySection.tsx` | Edition vocabulary overrides (item → plat, etc.) |

### 4.3.5 `signup/` — Wizard 3 étapes

| Composant | Rôle |
|---|---|
| `SignupProgress.tsx` | Barre étapes 1/2/3 |
| `SignupStep1Vertical.tsx` | Choix vertical (cards visuelles) |
| `SignupStep2Template.tsx` | Choix sub-template + recherche + preview features |
| `SignupStep3Account.tsx` | Email + password + nom complet + nom tenant + slug |
| `TemplateCard.tsx` | Card template avec icon, tagline, idealFor, featuresHighlight, notIncluded |

### 4.3.6 `alfred/` — Chat IA

`AlfredChat.tsx` : toggle, messages, contexte checklist, prop `tenantSlug`. Bouton
flottant + drawer.

### 4.3.7 Standalone

| Composant | Rôle |
|---|---|
| `ErrorBoundary.tsx` | Boundary racine (catch errors, fallback UI) |
| `SkipLink.tsx` | A11y skip-to-content |
| `Logo.tsx` | Variants (small, full, mark) |
| `theme-provider.tsx` | Dark mode via classe `dark` sur `<html>` + localStorage |

---

## 4.4 Hooks

Fichier : `client/src/hooks/`.

| Hook | Rôle |
|---|---|
| `useUserSession.ts` | Session nominative — `useQuery /api/auth/user/me` + login/logout/MFA mutations |
| `useRealtimeSync.ts` | EventSource `/api/:slug/events`, callback `onChecklistUpdated` |
| `use-toast.ts` | Toast Shadcn (limit 1, reducer + listeners) |

> Le hook `use-auth.ts` (PIN legacy) a été supprimé en PR #55.

---

## 4.5 Lib

Fichier : `client/src/lib/`.

| Fichier | Rôle |
|---|---|
| `queryClient.ts` | QueryClient TanStack Query, defaults `refetchOnWindowFocus: true`, `staleTime: 30s`, `retry: 2` |
| `tenantHost.ts` | `getTenantSlugFromHost()`, `tenantPath()` |
| `utils.ts` | `cn()` (clsx + tailwind-merge) |
| `taxRulesLabels.ts` | Helpers UI pour `template.taxRules` (label, icone par taux) |

---

## 4.6 Data fetching pattern

### 4.6.1 Convention queryKey

`queryKey` = path API en array, par exemple :

```ts
queryKey: ["/api/management", slug, "purchases", { from, to, supplierId }]
```

Permet d'invalider toute la sous-arborescence purchases d'un slug avec :

```ts
queryClient.invalidateQueries({ queryKey: ["/api/management", slug, "purchases"] });
```

### 4.6.2 Convention fetch

`apiRequest()` (`lib/queryClient.ts`) :
- `credentials: "include"` partout (cookies session).
- Headers JSON par défaut.
- Throw sur status >= 400 avec message du body.

### 4.6.3 Mutations

`useMutation` + `onSuccess` qui invalide la queryKey racine. Pas d'optimistic
update pour l'instant (pourrait être ajouté sur la checklist).

### 4.6.4 ⚠️ Refresh redondant sur la checklist

3 mécanismes coexistent :
1. `refetchOnWindowFocus: true` (default queryClient).
2. `refetchInterval: 30000` (sur la query checklist).
3. SSE via `useRealtimeSync`.

À rationaliser : garder SSE seul + invalidation manuelle. Tracé comme dette
dans `09-roadmap-et-synthese.md`.

---

## 4.7 Design system

### 4.7.1 Stack UI

- **Shadcn/UI** — primitives Radix + Tailwind, code dans le repo (pas de
  package). Permet la customisation totale.
- **TailwindCSS 3** + plugin `tailwindcss-animate`.
- **framer-motion** pour transitions complexes (wizard signup, modal switch).
- **lucide-react** pour les icônes (whitelist via `IconRenderer.tsx`).
- **dnd-kit** pour drag & drop (tri checklist items).

### 4.7.2 Theme HSL

Variables CSS dans `client/src/index.css` :

```css
--background, --foreground
--primary, --primary-foreground
--muted, --muted-foreground
--destructive, --success
--accent, --border, --ring
```

Tailwind les consomme via `@apply bg-background text-foreground`.

Palette myBeez : amber/orange (primaire), zinc gray, sémantique destructive/success.

### 4.7.3 Dark mode

Via classe `dark` sur `<html>` + toggle dans `theme-provider.tsx`.
Persistance localStorage. Pas de SSR donc flash possible au premier paint
(acceptable pour le moment).

### 4.7.4 Responsive

Breakpoints Tailwind standards (sm 640, md 768, lg 1024, xl 1280).
`TenantSidebar` bascule en bottom tabs sur mobile (md breakpoint).

---

## 4.8 Tests frontend

### 4.8.1 Couverture actuelle

| Test | Couvre |
|---|---|
| `client/src/components/templates/__tests__/IconRenderer.test.tsx` | Whitelist + fallback |
| `client/src/lib/__tests__/taxRulesLabels.test.ts` | Helpers UI taux TVA |

### 4.8.2 Trous

- Aucun test sur les pages (Login, Signup wizard, Checklist, Management).
- Aucun test E2E (pas de Playwright/Cypress).
- Aucun test sur les hooks (useUserSession, useRealtimeSync).

> Tracé comme dette dans `09-roadmap-et-synthese.md`. Tests d'intégration
> prévus en parallèle des sprints modules.

---

## 4.9 Limitation Windows pour le dev

Le script `dev` dans `package.json` utilise la syntaxe Unix `NODE_ENV=development tsx ...`.
En PowerShell, lancer plutôt :

```powershell
$env:NODE_ENV="development"; npx tsx server/index.ts
```

ou ajouter `cross-env` aux deps et préfixer `cross-env NODE_ENV=development tsx ...`.

---

*Suite du livre → [05-donnees-et-multi-tenant.md](./05-donnees-et-multi-tenant.md)*
