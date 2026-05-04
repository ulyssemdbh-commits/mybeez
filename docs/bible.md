# myBeez — Bible technique

> Document de référence consolidé du projet myBeez. Synthèse honnête de l'architecture, de l'état réel du code, des forces, des faiblesses, et de la roadmap.
>
> **À jour au :** 2026-05-04
> **Branche :** `main` (commit `7fe6b60`)
> **Domaine prod :** https://mybeez-ai.com
> **Repo :** https://github.com/ulyssemdbh-commits/mybeez

---

## Table des matières

1. [Vision produit](#1-vision-produit)
2. [Architecture haut-niveau](#2-architecture-haut-niveau)
3. [Backend](#3-backend)
4. [Frontend](#4-frontend)
5. [Schéma DB et isolation multi-tenant](#5-schéma-db-et-isolation-multi-tenant)
6. [Authentification et sécurité](#6-authentification-et-sécurité)
7. [Ops, déploiement et observabilité](#7-ops-déploiement-et-observabilité)
8. [Évaluation : projet vs réalité](#8-évaluation--projet-vs-réalité)
9. [Points forts](#9-points-forts)
10. [Points faibles et dette technique](#10-points-faibles-et-dette-technique)
11. [Risques de sécurité priorisés](#11-risques-de-sécurité-priorisés)
12. [Roadmap et intégrations futures](#12-roadmap-et-intégrations-futures)
13. [Cheatsheet opérationnelle](#13-cheatsheet-opérationnelle)

---

## 1. Vision produit

### Pitch

myBeez est un SaaS multi-tenant **multi-vertical** : un même socle applicatif sert une boulangerie, un salon de coiffure, un garage ou une boutique. Au signup, le client choisit un *template* d'activité qui pré-configure modules activés, vocabulaire, taux de TVA et KPIs.

### Positionnement

- **Cible** : TPE/PME tous secteurs (B2B). Pas restaurant-only.
- **Ambition** : produit *bankable* — vendable, multi-tenant, RGPD-aware, monétisable par abonnement (Stripe envisagé).
- **Différenciateur** : assistant IA *Alfred* contextualisé sur les opérations du tenant (checklist quotidienne, achats, RH).

### Décisions foundationnelles (2026-04-28)

| # | Décision | Implications techniques |
|---|---|---|
| 1 | **Multi-vertical via templates** | Schéma vocabulary-neutral, registre `business_templates`, `tenant_modules` enable/disable, vocabulary overrides per tenant |
| 2 | **Tenancy par subdomain + custom domain** | `slug.mybeez-ai.com` par défaut (wildcard DNS+TLS), `tenant_domains` table pour custom domains payants. Path-based legacy `mybeez-ai.com/:slug` toléré en transition |
| 3 | **Auth la plus sécurisée raisonnable** | Phase 1 : email+password (Argon2id) + MFA TOTP pour Owner/Admin + RBAC nominatif. Phase 2 : passkeys/WebAuthn, SSO. PIN tablette = re-unlock device, pas auth principale |

### Modèle commercial implicite

- Abonnement par tenant
- Custom domain = feature payante (industrie norm)
- Modules à la carte selon vertical (déjà schématisé via `tenant_modules`)

---

## 2. Architecture haut-niveau

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT                                                          │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Apex landing   │  │ <slug>.mybeez-…  │  │ custom-domain   │  │
│  │ /auth/login    │  │ tenant app shell │  │ <tenant>.com    │  │
│  │ /123admin      │  │ - checklist      │  │ (pricing tier)  │  │
│  │                │  │ - /management/*  │  │                 │  │
│  └────────────────┘  └──────────────────┘  └─────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Cloudflare (proxy ON, Full strict)
┌──────────────────────────────▼──────────────────────────────────┐
│  HETZNER AX422 — 65.21.209.102                                   │
│  ┌────────────┐                                                  │
│  │ nginx 80/443 ── CF Origin Cert (apex + wildcard)              │
│  │   └─ proxy_pass 127.0.0.1:3000                                │
│  └─────┬──────┘                                                  │
│        │                                                         │
│  ┌─────▼─────────────────────────┐  ┌─────────────────────────┐  │
│  │ Docker: mybeez-app  (Node 20) │  │ Docker: mybeez-db       │  │
│  │  - Express + TanStack Query   │  │   postgres:16-alpine    │  │
│  │  - Drizzle ORM                │  │   port 5434:5432        │  │
│  │  - SSE realtime               │  │   volume pgdata         │  │
│  │  - Alfred AI fallback chain   │  │   healthcheck pg_isready│  │
│  └────────┬──────────────────────┘  └─────────────────────────┘  │
└───────────┼──────────────────────────────────────────────────────┘
            │
            ├── OpenAI / Gemini / Grok (Alfred)
            ├── Resend (transactional email)
            └── Cloudflare R2 (Postgres dumps offsite, prefix mybeezdb/)
```

### Stack

| Couche | Tech |
|---|---|
| Langage | TypeScript 5.6 (strict, ESM `"type": "module"`) |
| Runtime | Node 20+ (Docker), Node 22 dev local |
| Backend | Express 4, helmet, compression, cookie-parser, express-session, express-rate-limit |
| ORM/DB | Drizzle ORM 0.45 + drizzle-zod, PostgreSQL 16 (driver `pg`) |
| Frontend | React 18, Vite 7, wouter (routing), TanStack Query 5 |
| UI | TailwindCSS 3, Shadcn/UI (Radix), framer-motion, lucide-react, dnd-kit |
| Validation | Zod 3 (côté serveur sur chaque route) |
| Build prod | Vite (front → `dist/public`) + esbuild (back → `dist/index.cjs` CJS) |
| Realtime | SSE custom (pas socket.io) |
| AI | OpenAI SDK 6, fallback chain Gemini → Grok |
| Auth | argon2id, connect-pg-simple, Resend (email) |
| Tests | Vitest 2 |
| Lint | ESLint 9 (flat config) + Prettier 3 |
| CI/CD | GitHub Actions |
| Container | Docker multi-stage (alpine) + docker compose |
| Reverse proxy | nginx (host-installed, Cloudflare Origin Cert) |
| Storage | Cloudflare R2 (S3-compatible, backups offsite) |

### Layers

```
                    ┌─────────────────────────────┐
                    │   client/src/  (React SPA)  │
                    │   pages/ components/ hooks/ │
                    └──────────────┬──────────────┘
                                   │ HTTP /api/*  + SSE
                    ┌──────────────▼──────────────┐
                    │   server/  (Express)        │
                    │   ┌───────────────────────┐ │
                    │   │ middleware/           │ │  resolveTenant, requireUser,
                    │   │                       │ │  requireRole, requireSuperadmin
                    │   ├───────────────────────┤ │
                    │   │ routes/               │ │  9 modules (auth, userAuth,
                    │   │                       │ │  tenants, admin, templates,
                    │   │                       │ │  alfred, checklist, onboarding,
                    │   │                       │ │  management/suppliers)
                    │   ├───────────────────────┤ │
                    │   │ services/             │ │  tenantService, domainService,
                    │   │                       │ │  templateService, realtimeSync,
                    │   │                       │ │  alfred/, auth/{user,password,
                    │   │                       │ │  token,mail,userTenant}Service
                    │   ├───────────────────────┤ │
                    │   │ db.ts (drizzle pool)  │ │
                    │   └───────────────────────┘ │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   shared/schema/  (Drizzle) │  Source de vérité DB,
                    │   tenants users domains     │  re-exporté côté front
                    │   templates checklist       │  pour types partagés.
                    └─────────────────────────────┘
```

### Multi-tenant strategy

- **Single DB, single schema, colonne `tenant_id`** sur toutes les tables business.
- **Aucune Row-Level Security PostgreSQL.** L'isolation est garantie *uniquement* par les `where(eq(table.tenantId, tid))` côté Drizzle. Toute requête manquant ce filtre = fuite trans-tenant.
- **Résolution** : middleware `resolveTenant` lit `req.hostname` :
  - subdomain `<slug>.<root>` (`ROOT_DOMAINS` env, default `mybeez-ai.com,localhost`)
  - custom domain via `tenant_domains.verifiedAt IS NOT NULL`
  - fallback legacy : `req.params.slug`
- **400** si `:slug` URL ne matche pas le tenant résolu par host.
- **Dev local** : `*.localhost` est résolu par les navigateurs vers `127.0.0.1` (RFC 6761), pas besoin de toucher `/etc/hosts`.

---

## 3. Backend

### 3.1 Bootstrap — `server/index.ts`

**Ordre de mounting :**

1. `trust proxy` (Cloudflare)
2. `helmet` — CSP et COEP désactivés (compromis Vite)
3. `compression` (level 6, threshold 1KB)
4. `cookie-parser`
5. `express.json` / `urlencoded` (limit 10MB)
6. **Session store Postgres** via `connect-pg-simple` — table `user_sessions` auto-provisionnée
7. **Rate-limiter global** : 120 req/min sur `/api/*`
8. **Rate-limiter Alfred** : 20 req/min sur `/api/alfred/*`
9. Lazy import + register routes (cf. inventaire ci-dessous)
10. `/api/health` (uptime, SSE stats, AI provider flags)
11. SPA fallback en prod (sert `dist/public/index.html`)

**Validations fatales au boot (prod) :**

- `SESSION_SECRET` requis → exit 1 sinon
- `APP_BASE_URL` requis → exit 1 sinon (prévient host-header injection sur les liens email verify/reset)

**Validations warning :**

- `DATABASE_URL` (warn, pas exit)
- `SUPERADMIN_TOKEN` < 16 chars → routes admin répondent 503 (fail-closed)

**Cookie de session :**

- `secure: true` en prod
- `httpOnly: true`, `sameSite: "lax"`
- `domain: .<primary-root-domain>` en prod (cross-subdomain), undefined en dev
- `maxAge: 24h`, `rolling: true` (rolling expiry)

### 3.2 Inventaire des routes

#### `server/routes/auth.ts` — PIN legacy

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/pin-login` | ❌ | Compare PIN clair contre `tenants.pinCode`/`adminCode` |
| POST | `/api/auth/logout` | session | Détruit la session |
| GET | `/api/auth/me` | session optionnelle | Retourne 200 même non-authentifié |

#### `server/routes/userAuth.ts` — auth nominative (PR #12)

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/user/signup` | ❌ | Email enum évité (erreur générique) |
| POST | `/api/auth/user/login` | ❌ | Argon2id verify, Zod strict |
| POST | `/api/auth/user/logout` | requireUser | Supprime juste `userId` |
| GET | `/api/auth/user/me` | requireUser | User + tenants/memberships |
| POST | `/api/auth/user/verify-email` | ❌ (token) | TTL 24h, token single-use |
| POST | `/api/auth/user/forgot-password` | ❌ | **202 toujours** (anti-enumeration) ✓ |
| POST | `/api/auth/user/reset-password` | ❌ (token) | TTL 1h |

#### `server/routes/tenants.ts` — admin Bearer (à retirer)

Toutes gates par `requireSuperadmin` (Bearer `SUPERADMIN_TOKEN` constant-time compare). Mécanisme **temporaire** remplacé par `/api/admin/*` (nominatif).

#### `server/routes/admin.ts` — admin nominatif

| Méthode | Path | Notes |
|---|---|---|
| GET | `/api/admin/me` | superadmin nominatif |
| GET | `/api/admin/stats` | comptes users + tenants |
| GET/POST/PATCH/DELETE | `/api/admin/users[/...]` | CRUD users + last-superadmin protection |
| POST | `/api/admin/users/:id/send-reset` | émet token reset + email |
| GET/PATCH/DELETE | `/api/admin/tenants[/...]` | CRUD tenants |
| GET | `/api/admin/tenants/:id/detail` | tenant + members |
| POST/PATCH/DELETE | `/api/admin/tenants/:id/members[/:userId]` | gestion équipe |

Toutes gatées par `requireSuperadminUser` (session nominative + `users.isSuperadmin`).

#### `server/routes/templates.ts` — catalogue

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/templates` | ❌ | Catalog public read-only (verticals) |
| GET | `/api/templates/:slug` | ❌ | Détail + enfants |

#### `server/routes/checklist.ts` — checklist quotidienne

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/checklist/:slug/categories` | ⚠️ resolveTenant **only** | **Lisible sans auth** |
| GET | `/api/checklist/:slug/dashboard` | ⚠️ resolveTenant only | **Lisible sans auth** |
| GET | `/api/checklist/:slug/comments` | ⚠️ resolveTenant only | **Lisible sans auth** |
| GET | `/api/checklist/:slug/history` | ⚠️ resolveTenant only | **Lisible sans auth** |
| POST | `/api/checklist/:slug/toggle` | requireTenantAuth | Mutation OK |
| POST | `/api/checklist/:slug/reset` | requireTenantAuth | |
| POST/PATCH/DELETE | `/api/checklist/:slug/items[/:id]` | requireTenantAuth | Soft-delete via `isActive` |
| POST | `/api/checklist/:slug/categories` | requireTenantAuth | |
| POST | `/api/checklist/:slug/comments` | requireTenantAuth | |

#### `server/routes/alfred.ts` — IA conversationnelle

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/alfred/chat` | ❌ | Slug en body — devrait passer par `:slug/*` |
| POST | `/api/alfred/analyze` | ❌ | Idem |
| POST | `/api/alfred/clear` | ❌ | Idem |

#### `server/routes/management/suppliers.ts` — module Gestion (PR #2)

Pattern de référence pour les futurs modules CRUD.

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/suppliers[?includeInactive=true]` | requireUser + requireRole | tous rôles |
| GET | `/api/management/:slug/suppliers/:id` | idem | |
| POST | `/api/management/:slug/suppliers` | requireRole(owner/admin/manager) | Zod strict |
| PATCH | `/api/management/:slug/suppliers/:id` | idem | |
| DELETE | `/api/management/:slug/suppliers/:id` | idem | Soft delete `isActive=false` |

#### `server/routes/onboarding.ts` — signup self-serve

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/onboarding/check-slug` | ❌ | Validation slug |
| POST | `/api/onboarding/signup-with-tenant` | ❌ | Crée user + tenant + auto-login |

### 3.3 Middleware — `server/middleware/`

| Fichier | Exports | Rôle |
|---|---|---|
| `tenant.ts` | `resolveTenant` | Attache `req.tenantId` (hostname-first, fallback `:slug`) |
| `auth.ts` | `requireAuth`, `requireAdmin` | PIN session legacy |
| `auth.ts` | `requireSuperadmin` | Bearer token timing-safe |
| `auth.ts` | `requireUser` | Session nominative présente |
| `auth.ts` | `requireSuperadminUser` | Nominatif + `isSuperadmin=true` |
| `auth.ts` | `requireRole(...allowed)` | Lookup `user_tenants.role`, superadmin bypass |
| `auth.ts` | `requireTenantAuth` | PIN OR nominatif membre du tenant courant |

### 3.4 Services — `server/services/`

| Service | Rôle | Cache | Cluster-safe ? |
|---|---|---|---|
| `tenantService` | CRUD tenants + génération clientCode 8 chiffres | `Map<slug, Tenant>` + `Map<clientCode, Tenant>`, invalidation manuelle | ❌ Process-local |
| `domainService` | Résolution tenant par hostname | `Map<hostname, …>` TTL 60s pour custom domains | ❌ Process-local |
| `templateService` | Catalog `business_templates` | `TemplatesIndex` (bySlug, byId) — invalidation manuelle | ❌ Process-local |
| `realtimeSync` | SSE par tenant | `Map<clientId, SSEClient>` | ❌ Process-local |
| `alfred/alfredService` | Chat IA, history par tenant slug | History 20 messages en mémoire | ❌ Process-local + memory leak potentiel |
| `alfred/prompt` | `buildSystemPrompt(tenant)` pure function | — | ✓ Pure |
| `core/openaiClient` | Factory provider AI | — | ✓ |
| `auth/userService` | CRUD users + tokens | — | ✓ |
| `auth/passwordService` | Argon2id hash/verify | — | ✓ |
| `auth/tokenService` | SHA-256 hash + TTL | — | ✓ |
| `auth/userTenantService` | M2M user↔tenant + role | — | ✓ |
| `auth/mailService` | Resend client + templates fail-soft | — | ✓ |
| `auth.ts` (orphelin) | Wrapper vide délégant à tenantService | — | À retirer |

### 3.5 Realtime / SSE

- **Endpoint** : `GET /api/:tenant/events` → upgrade `text/event-stream`
- **Headers** : `X-Accel-Buffering: no` pour Cloudflare
- **Keepalive** : 30s
- **Émetteurs** : routes `checklist.ts` après mutations (toggle/reset/items/categories/comments)
- **Payload** : `{ type: "checklist_updated", timestamp }`
- **Client** : `client/src/hooks/useRealtimeSync.ts` → invalidate query keys checklist
- ⚠️ **Pas d'auth sur la connexion SSE** — n'importe qui connaissant le slug peut écouter les notifications.

### 3.6 AI — Alfred

- **Modèles** : OpenAI `gpt-4o-mini`, Gemini `gemini-2.0-flash`, Grok `grok-3-mini`
- **Fallback chain** : OpenAI → Gemini → Grok → texte générique
- **System prompt** : `buildSystemPrompt(tenant)` dynamique, **vocabulary-neutral** (lit `tenant.vocabulary` keys `item`/`checklist`/`customer`)
- **Contexte runtime** : checklist du jour (total/checked/uncheckedItems)
- **History** : 20 derniers messages par tenant slug en mémoire (perdu au redéploiement)

---

## 4. Frontend

### 4.1 Routing — `client/src/App.tsx`

Détection `getTenantSlugFromHost()` (`client/src/lib/tenantHost.ts`) :

- Subdomain `<slug>.mybeez-ai.com` → render tenant routes
- Apex `mybeez-ai.com` → render landing/auth/admin
- Reserved subdomains (apex behavior) : `www, api, admin, app, static, cdn, mail, blog, status, docs, support, help`
- Legacy path-based fallback (`mybeez-ai.com/:slug`) toléré

Helper `tenantPath(slug, section)` construit les liens internes selon le contexte (subdomain → root-relative, sinon `/:slug/...`).

Routing **wouter** (léger, pas react-router). Pages **lazy-loadées** (`React.lazy()` + Suspense).

### 4.2 Pages — `client/src/pages/`

| Page | État | Endpoints consommés |
|---|---|---|
| `TenantChecklist` | ✅ implémenté (3 modes : nominatif shell, PIN tablette, PIN gate) | `/api/checklist/:slug/*` + SSE |
| `TenantManagement` | ✅ shell + dispatch sections (suppliers seul implémenté) | `/api/management/:slug/suppliers` |
| `TenantHistory` | 🟡 stub | aucun |
| `TenantAdmin` | 🟡 stub | aucun |
| `Landing` | ✅ implémenté (hero, features, mockups, FAQ, pricing) | `/api/templates` |
| `Admin` (`/123admin`) | ✅ implémenté (users, tenants, templates, dialogs) | `/api/admin/*` |
| `AdminTenant` | 🟡 stub | aucun |
| `AuthLogin` | ✅ | `/api/auth/user/{login,me,logout}` |
| `AuthSignup` | ✅ | `/api/auth/user/signup`, `/api/templates` |
| `AuthForgotPassword` | ✅ | `/api/auth/user/forgot-password` |
| `AuthResetPassword` | ✅ | `/api/auth/user/reset-password` |
| `AuthVerify` | ✅ | `/api/auth/user/verify-email` |

### 4.3 Composants — `client/src/components/`

| Catégorie | Composants |
|---|---|
| `ui/` (Shadcn) | badge, button, card, checkbox, dialog, input, scroll-area, select, tabs, textarea, toast, toaster, tooltip |
| `tenant/` | `TenantAppShell` (layout unifié), `TenantSidebar` (nav groupée + mobile tabs), `sections.ts` (registre nav) |
| `management/` | `SectionPlaceholder`, `sections/SuppliersSection` |
| `alfred/` | `AlfredChat` (toggle, messages, contexte checklist) |
| Standalone | `ErrorBoundary`, `SkipLink`, `Logo` (5 variants), `theme-provider` |

### 4.4 Hooks — `client/src/hooks/`

| Hook | Rôle |
|---|---|
| `use-auth.ts` | Legacy PIN — `useAuth()` retourne `{user, authenticated, login(pin, slug), logout()}` |
| `useUserSession.ts` | Nominative — `useQuery /api/auth/user/me` + login/logout mutations |
| `useRealtimeSync.ts` | EventSource `/api/:slug/events`, callback `onChecklistUpdated` |
| `use-toast.ts` | Toast Shadcn (limit 1, reducer + listeners) |

### 4.5 Lib — `client/src/lib/`

- `queryClient.ts` : QueryClient TanStack Query, default `refetchOnWindowFocus: true`, `staleTime: 30s`, `retry: 2`
- `tenantHost.ts` : `getTenantSlugFromHost()`, `tenantPath()`
- `utils.ts` : `cn()` (clsx + tailwind-merge)

### 4.6 Data fetching pattern

- `queryKey` = path API en array : `["/api/checklist", slug, "dashboard"]`
- `credentials: "include"` partout (cookies session)
- Mutations invalidate par `queryClient.invalidateQueries({ queryKey: [base, slug] })`
- ⚠️ Sur la checklist, **3 mécanismes redondants** : `refetchOnWindowFocus` + `refetchInterval: 30s` + SSE

### 4.7 Design system

- Shadcn/UI (Radix primitives + Tailwind)
- Variables CSS HSL pour theme (`--background`, `--primary`, `--muted-foreground`)
- Dark mode via classe `dark` sur `<html>` + localStorage toggle
- Palette : amber/orange (primaire myBeez), zinc gray, sémantique destructive/success

---

## 5. Schéma DB et isolation multi-tenant

### 5.1 Tables — `shared/schema/`

#### Identité / cross-tenant

| Table | PK | Notes |
|---|---|---|
| `users` | id serial | `email` UNIQUE, `isSuperadmin`, `isActive`. Cross-tenant. |
| `user_tenants` | (userId, tenantId) | M2M role. FK cascade vers users + tenants. Index `tenantId`. |
| `password_reset_tokens` / `email_verification_tokens` | id serial | Hash SHA-256, TTL |
| `mfa_secrets` | id serial | TOTP + recovery codes hash. **Schéma seul, code absent.** |
| `audit_log` | id serial | event, metadata jsonb, IP, UA. **Schéma seul, aucun write.** |
| `business_templates` | id serial | Catalogue verticals, self-FK `parentId` (2 niveaux). 14 entrées. |
| `tenant_domains` | id serial | `hostname` UNIQUE, FK cascade tenants, idx (hostname, tenantId) |

#### Tenant-scoped (toutes ont `tenantId integer`)

| Table | Soft delete | Particularités | FK manquantes ⚠️ |
|---|---|---|---|
| `tenants` | `isActive` | `clientCode` UNIQUE, `slug` UNIQUE, FK `templateId` | — |
| `categories` | — | sheet, zone, sortOrder | — |
| `items` | `isActive` | categoryId | **categoryId non FK** |
| `checks` | — | itemId, checkDate texte | **itemId non FK** |
| `futureItems` | — | itemId | **itemId non FK** |
| `comments` | — | author, message | — |
| `emailLogs` | — | logs envois checklist | — |
| `suppliers` | `isActive` | identité + paiement + IBAN | — |
| `purchases` | — | supplierId, totalHt/Ttc, tvaRate default 20 | **supplierId non FK** |
| `generalExpenses` | — | recurring | — |
| `bankEntries` / `cashEntries` | — | reconciled, type | — |
| `employees` | `isActive` | nom, contrat, salaire | — |
| `payroll` | — | employeeId, month, brut/net | **employeeId non FK** |
| `absences` | — | employeeId, type, dates | **employeeId non FK** |
| `files` | — | category, supplier, mime, size | — |
| `analytics` | — | date, metric, value, metadata jsonb | — |

### 5.2 Isolation multi-tenant

| Aspect | Implémentation | Risque |
|---|---|---|
| Pattern | Filtre Drizzle `where(eq(table.tenantId, tid))` sur **chaque** requête | 🔴 Une seule requête sans filtre = fuite trans-tenant |
| RLS Postgres | ❌ Désactivé | Repose 100% sur le code applicatif |
| Résolution | `resolveTenant` middleware (host > slug) | ✓ Correct |
| Propagation | `req.tenantId: number` injecté | ✓ Correct |
| Coexistence PIN ↔ nominatif | `requireTenantAuth` accepte les deux | ✓ Correct, avec garde-fou `userTenants.getRole()` |

### 5.3 Migrations

- **Mode** : `drizzle-kit push` (sync direct du schéma à la DB)
- ⚠️ **Pas de migrations versionnées** dans `migrations/` — pas d'historique
- Risque en prod : `--force` peut dropper colonnes/tables silencieusement
- Mitigation : backup `pg_dump` avant deploy (cf. §7)

### 5.4 Seeds

- `server/seed/templates.ts` : 14 verticals (3 top-level + 11 enfants). Idempotent via `seed:templates` (upsert sur slug).
- Pas d'autre seed.

### 5.5 Caches in-memory

| Service | Cache | TTL | Risque cluster |
|---|---|---|---|
| `tenantService` | bySlug + byClientCode | infini, invalidation manuelle | 🔴 critique en multi-noeud |
| `domainService` | custom domains | 60s | acceptable |
| `templateService` | bySlug + byId | infini | modéré |
| `alfredService` | history par slug | session lifetime | memory leak potentiel |

---

## 6. Authentification et sécurité

### 6.1 Modèles d'auth coexistants

| Modèle | État | Usage cible |
|---|---|---|
| **PIN** (legacy, `tenants.pinCode/adminCode` clair) | ⚠️ Toujours en place | Tablette partagée staff (re-unlock device) |
| **Nominatif** (email + Argon2id) | ✅ Implémenté (PR #12) | Owner / Admin / Manager / Staff / Viewer |
| **Bearer SUPERADMIN_TOKEN** | ✅ En place, à retirer | Routes `/api/tenants/*` (legacy) |
| **Superadmin nominatif** | ✅ Implémenté | Routes `/api/admin/*` |

### 6.2 Sessions

- **Store** : Postgres via `connect-pg-simple`, table `user_sessions` auto-provisionnée
- **Cookie** : `secure` prod, `httpOnly`, `sameSite: lax`, `domain: .mybeez-ai.com` prod
- **Rolling** : oui (`rolling: true`)
- **Logout-everywhere** : non implémenté

### 6.3 Hashing mots de passe

- Algo : **argon2id** (OWASP 2024 compliant)
- Params : `memoryCost: 19456 KiB`, `timeCost: 2`, `parallelism: 1`
- Length : min 12, max 256 (NIST passphrase-friendly)
- **Pas de complexité forcée** (intentionnel, NIST SP 800-63B)
- **Pas de check HIBP** (recommandé d'ajouter)

### 6.4 RBAC

- Rôles : `owner > admin > manager > staff > viewer`
- `requireRole(...allowed)` valide à load-time, lookup `user_tenants.role`
- Superadmin nominatif **bypass** la vérification de rôle tenant
- Couverture : routes `/api/admin/*` ✓, `/api/management/:slug/suppliers/*` ✓ ; reste à appliquer aux routes checklist (encore en `requireTenantAuth` PIN-friendly)

### 6.5 MFA

- Schéma `mfa_secrets` présent
- **Aucun endpoint, aucun middleware** — fonctionnellement absent

### 6.6 Audit log

- Schéma `audit_log` présent (event, metadata jsonb, userId, tenantId, IP, UA, timestamp)
- **Aucun `INSERT` dans le code** — fonctionnellement absent

### 6.7 Rate limiting / lockout

- Global API : 120 req/min ✓
- Alfred : 20 req/min ✓
- **Login lockout** : ❌
- **PIN brute-force** : ❌ (4 chiffres + global limit = trivial à brute-forcer)

### 6.8 Email transactionnel

- Provider : **Resend**
- Fail-soft : si `RESEND_API_KEY` absent → logs stdout (dev OK), boot warn en prod
- Templates : verify (TTL 24h), reset password (TTL 1h)

### 6.9 Headers de sécurité

- `helmet` activé MAIS **CSP désactivé** + **COEP désactivé** (compatibilité Vite dev)
- **Pas d'HSTS côté nginx**
- **Pas de CSRF token** (mitigation : `sameSite: lax` + `httpOnly`)
- Host-header injection mitigé via `APP_BASE_URL` requis en prod

---

## 7. Ops, déploiement et observabilité

### 7.1 Docker

| Aspect | État |
|---|---|
| Multi-stage Dockerfile (`node:20-alpine`) | ✅ |
| `.dockerignore` complet | ✅ |
| Service `db` : `postgres:16-alpine`, healthcheck `pg_isready` interval 5s | ✅ |
| Volume `pgdata` persistant | ✅ |
| Network bridge isolé `mybeez-net` | ✅ |
| Service `app` HEALTHCHECK | ❌ **manquant** |
| User non-root explicite | ❌ (utilise `node` par défaut, non documenté) |

### 7.2 Hetzner / nginx

- **Host** : AX422 `65.21.209.102` (mutualisé avec macommande, ulyssepro.org, etc.)
- **Path** : `/opt/mybeez/`
- **Reverse proxy** : nginx host-installed, vhost `/etc/nginx/sites-enabled/mybeez-ai.com.conf` (symlink vers le repo)
- **TLS** : Cloudflare Origin Cert apex + wildcard à `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}`
- **Cloudflare SSL mode** : Full (strict) requis
- **WebSocket / SSE** : `Upgrade`/`Connection`/`proxy_read_timeout 86400s` ✓
- **HSTS** : ❌ pas configuré

### 7.3 Deploy

- Script `deploy/deploy.sh` : `git pull` → `docker compose up -d --build` → `npm run db:push` → `nginx reload`
- Idempotent ✓
- **Rollback** : manuel (git reset + redeploy ancien tag)
- **Re-deploy** : `cd /opt/mybeez && bash deploy/deploy.sh`

### 7.4 CI/CD — `.github/workflows/ci.yml`

| Step | Cmd |
|---|---|
| 1 | `actions/checkout@v4` |
| 2 | `setup-node@v4` (Node 20, cache npm) |
| 3 | `npm ci` |
| 4 | `npm run check` (typecheck) |
| 5 | `npm run lint` |
| 6 | `npm test` (vitest) |
| 7 | `npm run build` |

Déclenchée sur push `main` + PR vers `main`. Bloque le merge si une étape échoue.

⚠️ **Branch protection GitHub côté repo** : à vérifier (assumée).

### 7.5 Tests — Vitest

13 fichiers de test :

- `scripts/__tests__/backup.test.ts` — pipeline backup (key, retention, sort)
- `server/__tests__/smoke.test.ts`
- `server/middleware/__tests__/{auth,requireTenantAuth,requireUserAndRole}.test.ts`
- `server/services/__tests__/domainService.test.ts`
- `server/services/auth/__tests__/{passwordService,tokenService,mailService}.test.ts`
- `server/services/alfred/__tests__/alfredService.test.ts`
- `server/seed/__tests__/templates.test.ts`
- `shared/schema/__tests__/users.test.ts`

**Couverts** : modules purs (helpers backup, password, token, mail, RBAC middleware).
**Non couverts** : routes API integration, frontend (0 tests), tenant isolation cross-table, SSE.

### 7.6 Lint / Format

- ESLint 9 flat config (`eslint.config.js`) : recommended TS + React + react-hooks. `no-explicit-any` warn, `no-unused-vars` warn (pattern `^_`).
- Prettier : `printWidth: 100`, `singleQuote: false`, `trailingComma: all`.
- CI exécute `npm run lint` (bloquant).
- ❌ Pas de pre-commit hooks (Husky / lint-staged) — repose sur la CI.

### 7.7 Backups Postgres → Cloudflare R2

- Pipeline : `pg_dump --no-owner --no-privileges` | `gzip` | upload multipart R2 (bucket `r2mybeez`, prefix `mybeezdb/`)
- Clé : `mybeezdb/YYYY-MM-DD/postgres-YYYY-MM-DDTHH-MM-SS.sql.gz`
- Streaming (constant memory) ✓
- Retention auto : `BACKUP_RETENTION_DAYS` (default 30)
- Restore : `npm run restore` liste les 20 derniers ; **dry-run par défaut** ; `RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING` pour exécuter
- Logs : passwords masqués
- ❌ **Pas de chiffrement R2** (côté serveur ou client)
- ❌ **Cron systemd timer pas encore câblé en prod** — script prêt, à wirer

### 7.8 Observabilité

| Aspect | État |
|---|---|
| `/api/health` (uptime, SSE stats, AI provider flags) | ✅ |
| Logger structuré (pino, winston, …) | ❌ `console.log` only, préfixes `[Module]` |
| Metrics (Prometheus, OpenTelemetry) | ❌ |
| Alerting | ❌ |
| `process.on("uncaughtException"/"unhandledRejection")` | ✅ logs stderr |
| Persistence logs (ELK, Datadog, Loki…) | ❌ |

---

## 8. Évaluation : projet vs réalité

### 8.1 Décisions foundationnelles

| Décision | État réel | Note |
|---|---|---|
| Multi-vertical via templates | Catalog seedé (14), `tenants.templateId`, vocabulary par tenant ✓. Alfred lit `tenant.vocabulary` ✓. | 🟢 80% |
| Subdomain + custom domain | Subdomain résolution ✓, table `tenant_domains` ✓, custom domain provisioning automatisé ❌ | 🟡 60% |
| Auth max-secure | Argon2id ✓, sessions Postgres ✓, RBAC nominatif ✓. **MFA absent**, **audit log absent**, **lockout absent**, **PIN clair toujours actif** | 🟠 40% |

### 8.2 Modules métier

| Module | Schéma DB | API | UI | État |
|---|---|---|---|---|
| Checklist quotidienne | ✅ | ✅ | ✅ | **Production-ready** |
| Suppliers | ✅ | ✅ | ✅ | **Production-ready** (PR #2) |
| Purchases | ✅ | ❌ | ❌ | Schémé, planifié PR #3 |
| General expenses | ✅ | ❌ | ❌ | Schémé, planifié PR #4 |
| Bank entries | ✅ | ❌ | ❌ | Schémé, planifié PR #4 |
| Cash entries | ✅ | ❌ | ❌ | Schémé, planifié PR #4 |
| Files | ✅ | ❌ | ❌ | Schémé, planifié PR #7 (R2 upload) |
| Employees | ✅ | ❌ | ❌ | Schémé, planifié PR #5 |
| Payroll | ✅ | ❌ | ❌ | Schémé, planifié PR #6 |
| Absences | ✅ | ❌ | ❌ | Schémé, planifié PR #6 |
| Analytics | ✅ | ❌ | ❌ | Schémé, planifié PR #8 |

### 8.3 Cycle de vie SaaS

| Étape | État |
|---|---|
| Self-serve signup (user + tenant) | ✅ `POST /api/onboarding/signup-with-tenant` |
| Email verify | ✅ |
| Forgot/reset password | ✅ |
| Onboarding wizard (template picker au signup) | ✅ |
| Billing / abonnement | ❌ Stripe non intégré |
| Trial / quota / plan limits | ❌ |
| Cancellation / data export | ❌ |
| RGPD : right to be forgotten | ❌ (cascade FK incomplet) |
| Custom domain provisioning | 🟡 Schéma OK, automation ❌ |

### 8.4 Verdict global

> **myBeez est un MVP solide (~50%) sur une architecture saine, prêt à scaler verticalement (modules) mais pas encore prêt à ouvrir au public payant.**
>
> Les fondations (multi-tenant, auth nominative, templates, deploy, CI) sont là. Ce qui manque pour être *bankable* : modules métier (8 sur 11 à livrer), MFA + audit log, billing, monitoring.

---

## 9. Points forts

1. **Architecture multi-tenant cohérente** — décisions structurelles écrites (subdomain + templates + auth nominative) et respectées dans le code.
2. **Stack moderne et maintenue** — TS strict, ESM, Drizzle, Vite 7, TanStack Query, Tailwind. Pas de framework legacy.
3. **Auth nominative bien construite** — Argon2id, sessions Postgres, RBAC `requireRole`, anti-enumeration sur forgot-password, host-header injection guard.
4. **CI/CD opérationnelle** — GitHub Actions exécute typecheck + lint + test + build sur chaque PR. Bloque les merges régressifs.
5. **Tests sur les fondations critiques** — Vitest sur password hashing, token crypto, RBAC middleware, backup pipeline, domain resolution.
6. **Backup pipeline production-grade** — pg_dump streamé vers R2, retention automatique, restore en dry-run par défaut.
7. **Realtime SSE proprement implémenté** — keepalive, header `X-Accel-Buffering`, scope par tenant, broadcast après mutations.
8. **Alfred AI vocabulary-neutral** — system prompt construit dynamiquement à partir de `tenant.vocabulary`, fallback chain provider robuste (OpenAI → Gemini → Grok).
9. **Linter + formatter en place** — ESLint flat config, Prettier, exécutés en CI.
10. **Déploiement reproductible** — Docker compose + script `deploy.sh` idempotent + nginx vhost versionné.
11. **Documentation interne** — CLAUDE.md à jour décrit stack, architecture, conventions, dette connue.
12. **Pattern UI cohérent** — Shadcn/UI, sidebar tenant unifiée, composant `TenantAppShell` partagé, registre `sections.ts`.

---

## 10. Points faibles et dette technique

### 10.1 Architecture

- **Pas de Row-Level Security PostgreSQL** — l'isolation multi-tenant repose entièrement sur les `where(eq(table.tenantId, ...))` Drizzle. Une seule omission = fuite.
- **Foreign keys logiques non contraintes** — `items.categoryId`, `checks.itemId`, `purchases.supplierId`, `payroll.employeeId`, `absences.employeeId` ne sont pas FK en DB. Orphelins possibles.
- **Caches process-local** (`tenantService`, `templateService`, `alfredService`) — non cluster-safe. Bloque le scale-out horizontal.
- **Pas de migrations versionnées** — `db:push` synchronise sans historique. `--force` peut dropper en prod.

### 10.2 Auth / sécurité

- **PIN codes en clair** dans `tenants.pinCode/adminCode` (DB-leak = compromission staff).
- **MFA TOTP** : schéma seul, fonctionnellement absent.
- **Audit log** : schéma seul, aucun write.
- **Lockout login** : pas de protection brute-force compte.
- **Pas de check HIBP** sur passwords.
- **CSP désactivé** dans helmet (compromis Vite dev).
- **Pas de HSTS** côté nginx.

### 10.3 Backend

- **Routes GET checklist sans auth** — `/categories`, `/dashboard`, `/comments`, `/history` lisibles par tout connaisseur du slug.
- **SSE `/api/:tenant/events` sans auth** — fuite des notifications de mutation.
- **Routes Alfred prennent le slug en body** — incohérent avec le pattern `/api/.../:slug/...` du reste.
- **`server/services/auth.ts`** : wrapper vide à supprimer.
- **Type incohérent `AuthSession.tenantId: string` vs session value `number`**.

### 10.4 Frontend

- **3 mécanismes de refresh redondants sur la checklist** : `refetchOnWindowFocus` + `refetchInterval: 30s` + SSE.
- **`useAuth` (PIN) coexiste avec `useUserSession`** — code dupliqué, migration non finalisée.
- **9 sections `/management/...` en placeholder** — UI à livrer (cf. roadmap PR #3-#9).
- **`AdminTenant` page stub** — route `/123admin/tenants/:id` ne charge rien.
- **Aucun test frontend** — 0 fichier `.test.tsx`.
- **Landing page monolithique** (~890 lignes).

### 10.5 Ops

- **Pas de `HEALTHCHECK` sur le service Docker `app`** — pas de restart auto si freeze silencieux.
- **Pas de logger structuré** (juste `console.log`), pas de persistence (logs perdus au redémarrage container).
- **Aucune metrics applicative** (latence, error rate, DB pool).
- **Aucun alerting**.
- **Cron backups** pas encore câblé en prod.
- **Pas de chiffrement** des dumps R2.
- **Pas de pre-commit hooks** (Husky/lint-staged).

### 10.6 Code mort / orphelins

- `server/services/auth.ts` (wrapper vide).
- `client/src/pages/AdminTenant.tsx` (stub non chargé).
- Coexistence PIN ↔ nominatif (à purger après migration complète).

---

## 11. Risques de sécurité priorisés

| # | Sévérité | Risque | Localisation | Effort fix |
|---|---|---|---|---|
| 1 | 🔴 critique | GET checklist sans auth (categories/dashboard/comments/history) | `server/routes/checklist.ts` | S — ajouter `requireTenantAuth` |
| 2 | 🔴 critique | SSE `/api/:tenant/events` sans auth | `server/services/realtimeSync.ts` | S |
| 3 | 🔴 critique | PIN codes stockés en clair | `shared/schema/tenants.ts` (`pinCode`, `adminCode`) | M — hasher + migrer données existantes |
| 4 | 🔴 critique | MFA absent pour Owner/Admin | (à implémenter) | L — TOTP + recovery codes + UI |
| 5 | 🟠 haut | FK manquantes (orphelins possibles) | items, checks, purchases, payroll, absences | M — migration + cleanup orphelins |
| 6 | 🟠 haut | Audit log non écrit (compliance RGPD) | (à implémenter) | M — wrapper + writes sur events critiques |
| 7 | 🟠 haut | PIN brute-force non rate-limité spécifiquement | `server/routes/auth.ts` | S — rate-limit dédié + délai exponentiel |
| 8 | 🟡 moyen | CSP désactivé dans helmet | `server/index.ts` L63 | M — config CSP avec nonce Vite |
| 9 | 🟡 moyen | Pas de HSTS côté nginx | `deploy/nginx/mybeez-ai.com.conf` | XS — ajouter `Strict-Transport-Security` |
| 10 | 🟡 moyen | Cache `tenantService` process-local | `server/services/tenantService.ts` | M — Redis ou pub/sub |
| 11 | 🟡 moyen | Pas de check HIBP | `auth/passwordService.ts` | S — appel à HIBP API au signup/reset |
| 12 | 🟡 moyen | `db:push` sans migrations versionnées | `drizzle.config.ts` | M — workflow generate/migrate + backup avant prod push |
| 13 | 🟡 moyen | Pas de healthcheck Docker `app` | `Dockerfile`, `docker-compose.yml` | XS |
| 14 | 🟡 moyen | Pas de logs structurés / persistence | `server/index.ts` | M — pino + Loki/Datadog |
| 15 | 🟢 faible | Routes Alfred slug en body | `server/routes/alfred.ts` | S — refactor `/api/alfred/:slug/...` |
| 16 | 🟢 faible | Code mort `services/auth.ts` | — | XS — supprimer |

---

## 12. Roadmap et intégrations futures

### 12.1 Roadmap immédiate (déjà cadrée)

| PR | Branche | Périmètre |
|---|---|---|
| #3 | `feat/purchases` | CRUD achats + UI (lien fournisseur optionnel) |
| #4 | `feat/cashflow` | bank + cash + general expenses |
| #5 | `feat/employees` | Employees + UI |
| #6 | `feat/payroll-absences` | Paie + absences |
| #7 | `feat/files` | Stockage R2 + UI uploader |
| #8 | `feat/analytics` | Dashboard read-only (KPIs, top fournisseurs) |
| #9 | `feat/history-cross` | Recherche + export CSV cross-modules |

### 12.2 Sécurité Phase 1 (avant ouverture publique)

1. Gater toutes les routes GET checklist + SSE (issue #1, #2 du tableau).
2. Hasher les PIN codes (issue #3).
3. Implémenter MFA TOTP pour Owner/Admin (issue #4).
4. Activer audit log sur les events critiques : login success/fail, password reset, role changes, tenant creation/deletion (issue #6).
5. Lockout login après 5 tentatives échouées (issue #7).

### 12.3 Sécurité Phase 2

- HIBP check au signup/reset
- CSP config-aware (nonce Vite)
- HSTS nginx
- Migrations versionnées (`drizzle-kit generate` + `migrate`)

### 12.4 Scale-out (avant 100+ tenants)

- Redis pour `tenantService` + `templateService` + sessions partagées
- Cluster mode Node (`pm2` ou Kubernetes)
- Read replica Postgres
- CDN Cloudflare devant les assets statiques (déjà en place via CF proxy)

### 12.5 Produit

- **Stripe** : abonnements, plan limits (nombre d'employees / tenants / users), trial 14 jours
- **Custom domain provisioning automatisé** : Let's Encrypt DNS-01 ou Cloudflare on-demand TLS
- **Passkeys / WebAuthn** : phase 2 auth (remplace MFA TOTP comme primary)
- **SSO Google/Microsoft** : pour Owner uniquement
- **Mobile** : PWA d'abord (manifest + service worker), app native plus tard
- **Intégrations comptables** : export FEC (France), liaison Pennylane / QuickBooks
- **Marketplace de templates** : verticals contribués par la communauté

### 12.6 IA / Alfred

- Persistence chat history en DB (actuellement en mémoire, perdu au déploiement)
- Embeddings + RAG sur la doc de gestion du tenant
- Multimodal : OCR sur factures uploadées (Files module)

### 12.7 Observabilité

- Logger structuré pino → Loki / Datadog
- Metrics Prometheus (req/s, latence p95, DB pool, AI provider hit rate)
- Sentry pour erreurs frontend
- Healthcheck Docker `app` + auto-restart compose
- Cron backup systemd timer
- Chiffrement R2 (server-side ou client-side)

---

## 13. Cheatsheet opérationnelle

### Commandes locales

```bash
npm install              # install deps
npm run dev              # dev server (PowerShell : $env:NODE_ENV="development"; npx tsx server/index.ts)
npm run check            # tsc typecheck
npm run lint             # ESLint
npm run lint:fix
npm run format           # Prettier write
npm test                 # Vitest run
npm run build            # Vite + esbuild bundle prod
npm run db:push          # drizzle-kit sync schema → DB
npm run backup           # pg_dump → R2
npm run restore -- <key|latest>   # liste / restore (dry-run par défaut)
npm run seed:templates   # upsert business_templates
```

### Variables d'environnement (prod)

| Var | Requis | Effet |
|---|---|---|
| `DATABASE_URL` | ✅ | postgres://... (sinon warn) |
| `SESSION_SECRET` | ✅ fatal | exit 1 si absent en prod |
| `APP_BASE_URL` | ✅ fatal | exit 1 si absent en prod (Host-header guard) |
| `POSTGRES_PASSWORD` | ✅ | DB Docker |
| `SUPERADMIN_TOKEN` | ⚠️ | ≥16 chars, sinon `/api/tenants/*` répond 503 |
| `ROOT_DOMAINS` | — | default `mybeez-ai.com,localhost` |
| `RESEND_API_KEY` | optionnel | sinon emails loggés stdout (dev) |
| `MAIL_FROM` | optionnel | default `myBeez <noreply@mybeez-ai.com>` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `XAI_API_KEY` | ≥1 | au moins un pour Alfred |
| `R2_ENDPOINT` / `R2_BUCKET` / `R2_PREFIX` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | optionnel | backups R2 |
| `BACKUP_RETENTION_DAYS` | optionnel | default 30 |
| `PORT` | optionnel | default 3000 |

### Déploiement

```bash
# Re-deploy (Hetzner)
ssh root@65.21.209.102 "cd /opt/mybeez && bash deploy/deploy.sh"

# Logs
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose logs -f app"

# DB shell
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose exec -T db psql -U mybeez -d mybeez"

# Backup manuel
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose exec -T app npm run backup"
```

### Conventions Git

- Branches : `feat/*`, `fix/*`, `refactor/*`, `chore/*`, `docs/*`
- Commits : Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.)
- Merge : **squash** sur main
- Pas de force-push sur main

### Routes API les plus utilisées (récap)

```
POST   /api/auth/user/login            connexion email + password
GET    /api/auth/user/me               session courante + tenants
POST   /api/onboarding/signup-with-tenant   self-serve signup
GET    /api/templates                  catalog verticals (public)
GET    /api/management/:slug/suppliers liste fournisseurs (RBAC)
POST   /api/checklist/:slug/toggle     coche un item
GET    /api/:slug/events               SSE realtime (à gater !)
GET    /api/health                     uptime + status
```

### Glossaire métier

| Terme | Définition |
|---|---|
| **Tenant** | Un compte client. Une row dans `tenants`. Peut être restaurant, salon, garage, boutique. |
| **Template** | Archétype d'activité (restaurant, coiffure, retail…). Détermine modules, vocabulaire, TVA. |
| **Vertical** | Catégorie top-level de templates : `commerce_de_bouche`, `entreprise_services`, `retail_b2c`. |
| **User** | Personne réelle (compte nominatif). Cross-tenant : peut être Owner d'un tenant et Manager d'un autre. |
| **Role tenant** | `owner > admin > manager > staff > viewer`, stocké dans `user_tenants.role`. |
| **Superadmin** | `users.isSuperadmin = true` — équipe interne myBeez, distinct de `SUPERADMIN_TOKEN` (Bearer legacy). |
| **Slug** | Nom URL-friendly du tenant (`valentine`, `meyer`). UNIQUE. |
| **Client code** | Code 8 chiffres généré au signup, montré à l'utilisateur (pas un secret). |
| **PIN code** | Code staff 4-8 chiffres (legacy) — accès checklist quotidienne sur tablette. |
| **Checklist** | Liste d'items à cocher chaque jour, par catégorie/zone. Source du POC. |
| **Alfred** | Assistant IA conversationnel contextualisé sur la checklist. |
| **SSE** | Server-Sent Events, canal `/api/:slug/events` pour la sync temps réel. |

---

*Fin de bible. Mettre à jour à chaque évolution structurelle.*
