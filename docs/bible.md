# myBeez — Bible technique

> Document de référence consolidé du projet myBeez. Synthèse honnête de l'architecture, de l'état réel du code, des forces, des faiblesses, et de la roadmap.
>
> **À jour au :** 2026-05-07
> **Branche :** `main` (commit `ce22962`)
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
| 3 | **Auth nominative la plus sécurisée raisonnable** | Phase 1 : email+password (Argon2id) + MFA TOTP + RBAC nominatif 5 rôles. Phase 2 : passkeys/WebAuthn, SSO. Pas de PIN partagé tenant-wide (purgé au sprint 1) — le PIN-on-tablet futur sera un per-staff device-paired token |

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
| ORM | Drizzle 0.45 + drizzle-zod, PostgreSQL via `pg` Pool |
| Frontend | React 18 + Vite 7, wouter, TanStack Query 5 |
| UI | TailwindCSS 3, Shadcn/UI (Radix), framer-motion, lucide-react, dnd-kit |
| Build prod | Vite (front → `dist/public/`) + esbuild (back → `dist/index.cjs` CJS) |
| Realtime | SSE (custom, pas socket.io) |
| AI | OpenAI SDK 6 + fallback Gemini → Grok (`server/services/core/openaiClient.ts`) |
| Auth crypto | argon2id (passwords + recovery codes), otplib (TOTP RFC 6238) |
| Validation | Zod 3 |
| Tests | Vitest |

### Mono-repo

```
mybeez/
├── client/         # React (Vite root = ./client)
├── server/         # Express
├── shared/         # Schémas + types partagés
├── scripts/        # Ops (backups, seeds, migrations one-off)
└── docs/           # Cette bible + autres docs
```

Aliases : `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

---

## 3. Backend

### 3.1 Bootstrap — `server/index.ts`

Ordre d'initialisation :

1. Garde-fous env (`SESSION_SECRET`, `APP_BASE_URL` requis en prod, exit 1 sinon).
2. Logs warn `SUPERADMIN_TOKEN` (≥16 chars) et `RESEND_API_KEY` si absents.
3. `helmet` (CSP désactivé), `compression`, `cookie-parser`, `express.json` (10mb).
4. Session Postgres-backed via `connect-pg-simple` (`createTableIfMissing: true`, table `user_sessions`, prune toutes les 15 min).
5. Cookie scope `domain: .mybeez-ai.com` en prod (cross-subdomain).
6. Rate limiters : global `/api/` (120 req/min), `/api/alfred/` (20 req/min).
7. `registerRoutes()` : import dynamiques (`SSE → userAuth → userAuthMfa → tenants → admin → onboarding → templates → alfred → checklist → management/suppliers`).
8. Endpoint `/api/health` (uptime + SSE stats + AI flags).
9. `serveStatic()` en prod : `dist/public/` (assets 1y, fallback SPA).
10. Listen sur `PORT` (default 3000).

**Hooks process** : `uncaughtException`, `unhandledRejection` loggués stderr.

### 3.2 Routes — `server/routes/`

Conventions : exporte `register<Module>Routes(app)`, importé en lazy depuis `index.ts`. Chaque route déclare son schéma Zod en haut. Erreurs FR + 500 générique. Tenant-scoped via `resolveTenant` middleware.

#### `server/routes/userAuth.ts` — auth nominative

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/user/signup` | ❌ | Argon2id + email verify token + Resend |
| POST | `/api/auth/user/login` | ❌ | Anti-enum, retourne `{mfaRequired:true}` si MFA actif |
| POST | `/api/auth/user/logout` | ❌ | Clear session.userId |
| GET | `/api/auth/user/me` | requireUser | Renvoie user + memberships |
| POST | `/api/auth/user/verify-email` | ❌ | Consomme token |
| POST | `/api/auth/user/forgot-password` | ❌ | Toujours 202 (anti-enum) |
| POST | `/api/auth/user/reset-password` | ❌ | Consomme token + set nouveau password |

#### `server/routes/userAuthMfa.ts` — MFA TOTP

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/auth/user/mfa/status` | requireUser | État (enrolled / confirmed) |
| POST | `/api/auth/user/mfa/setup` | requireUser | Génère secret + QR + 10 recovery codes |
| POST | `/api/auth/user/mfa/confirm` | requireUser | Valide TOTP, marque `confirmedAt` |
| POST | `/api/auth/user/mfa/disable` | requireUser | Re-auth + delete row |
| POST | `/api/auth/user/mfa/challenge` | requireMfaPending | TOTP code → promote pending → full session |
| POST | `/api/auth/user/mfa/recovery` | requireMfaPending | Recovery code single-use |
| POST | `/api/auth/user/mfa/cancel` | ❌ | Clear session mfaPending* keys |

#### `server/routes/tenants.ts` — admin legacy (Bearer)

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/tenants` | requireSuperadmin (Bearer) | Création tenant |
| GET | `/api/tenants` | idem | Liste |
| PATCH | `/api/tenants/:id` | idem | Update Zod strict (sans pin/admin code depuis #55) |

Mécanisme transitoire — sera retiré au profit des routes `/api/admin/*` (RBAC nominatif).

#### `server/routes/admin.ts` — back-office superadmin

| Méthode | Path | Notes |
|---|---|---|
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

Toutes les routes derrière `resolveTenant + requireUser + requireRole(...)` avec matrice rôles (PR #53). `requireTenantAuth` n'existe plus.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/checklist/:slug/categories` | tous (READ) | |
| GET | `/api/checklist/:slug/dashboard` | tous (READ) | |
| GET | `/api/checklist/:slug/comments` | tous (READ) | |
| GET | `/api/checklist/:slug/history` | tous (READ) | |
| POST | `/api/checklist/:slug/toggle` | owner/admin/manager/staff (STAFF) | Mutation quotidienne |
| POST | `/api/checklist/:slug/comments` | STAFF | |
| POST | `/api/checklist/:slug/reset` | owner/admin/manager (MANAGE) | Reset journée |
| POST/PATCH/DELETE | `/api/checklist/:slug/items[/:id]` | MANAGE | Soft-delete via `isActive` |
| POST | `/api/checklist/:slug/categories` | MANAGE | |

#### `server/routes/alfred.ts` — IA conversationnelle (PR #54)

URL imbriquée par tenant `:slug`, slug retiré du body, gates auth requireRole.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| POST | `/api/alfred/:slug/chat` | tous rôles tenant | Prompt + checklist context optionnel |
| POST | `/api/alfred/:slug/analyze` | idem | Analyse de la checklist du jour |
| POST | `/api/alfred/:slug/clear` | idem | Vide l'historique conversation |

#### `server/routes/management/suppliers.ts` — module Gestion (PR #2)

Pattern de référence pour les futurs modules CRUD. Toutes routes derrière `resolveTenant + requireUser + requireRole(...)`.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/management/:slug/suppliers[?includeInactive=true]` | READ (tous) | tri par nom asc |
| GET | `/api/management/:slug/suppliers/:id` | READ | |
| POST | `/api/management/:slug/suppliers` | owner/admin/manager | Zod strict |
| PATCH | `/api/management/:slug/suppliers/:id` | idem | |
| DELETE | `/api/management/:slug/suppliers/:id` | idem | Soft delete `isActive=false` |

#### `server/routes/onboarding.ts` — signup self-serve

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/onboarding/check-slug` | ❌ | Validation format + collision + suggestion |
| POST | `/api/onboarding/signup-with-tenant` | ❌ | Crée user + tenant + lien Owner + auto-login |

### 3.3 Middleware — `server/middleware/`

| Fichier | Exports | Rôle |
|---|---|---|
| `tenant.ts` | `resolveTenant` | Attache `req.tenantId` (hostname-first, fallback `:slug`) |
| `auth.ts` | `requireUser` | Session nominative présente |
| `auth.ts` | `requireRole(...allowed)` | Lookup `user_tenants.role`, validate vs allowed list |
| `auth.ts` | `requireSuperadminUser` | Nominatif + `users.isSuperadmin = true` |
| `auth.ts` | `requireMfaPending` | Session half-baked post-password (TTL 5 min) |
| `auth.ts` | `requireSuperadmin` | Bearer token timing-safe (legacy `/api/tenants/*`) |
| `auth.ts` | `getUserSession`, `getMfaPending`, `clearMfaPending` | Helpers session |

Toute la voie PIN (`requireAuth`, `requireAdmin`, `requireTenantAuth`, `getAuthSession`, `getSessionToken`, `AuthSession`) a été supprimée en PR #55.

### 3.4 Services — `server/services/`

| Service | Rôle | Cache | Cluster-safe ? |
|---|---|---|---|
| `tenantService` | CRUD tenants + génération clientCode 8 chiffres | `Map<slug, Tenant>` + `Map<clientCode, Tenant>`, invalidation manuelle | ❌ Process-local |
| `domainService` | Résolution tenant par hostname | `Map<hostname, …>` TTL 60s pour custom domains | ❌ Process-local |
| `templateService` | Catalog `business_templates` | `TemplatesIndex` (bySlug, byId) — invalidation manuelle | ❌ Process-local |
| `realtimeSync` | SSE par tenant + `emitChecklistUpdated` | `Map<clientId, SSEClient>` | ❌ Process-local |
| `alfred/alfredService` | Chat IA, history par tenant slug | History 20 messages en mémoire | ❌ Process-local + memory leak potentiel |
| `alfred/prompt` | `buildSystemPrompt(tenant)` pure function | — | ✓ Pure |
| `core/openaiClient` | Factory provider AI (OpenAI > Gemini > Grok) | — | ✓ |
| `auth/userService` | CRUD users + lifecycle tokens (verify + reset) | — | ✓ |
| `auth/userTenantService` | M2M user↔tenant + role | — | ✓ |
| `auth/passwordService` | Argon2id hash/verify + bornes longueur | — | ✓ |
| `auth/tokenService` | SHA-256 hash + TTL constants | — | ✓ |
| `auth/mfaService` | TOTP enrol/confirm/verify/disable + recovery codes (sha-256, single-use) | — | ✓ |
| `auth/mailService` | Resend client + templates verify/reset, fail-soft | — | ✓ |

### 3.5 Realtime / SSE

- **Endpoint** : `GET /api/:tenant/events` → upgrade `text/event-stream`, gaté par `resolveTenant + requireUser + requireRole(tous rôles tenant)` depuis PR #53
- **Headers** : `X-Accel-Buffering: no` pour Cloudflare
- **Keepalive** : 30s
- **Émetteurs** : routes `checklist.ts` après mutations (toggle/reset/items/categories/comments)
- **Payload** : `{ type: "checklist_updated", timestamp }`
- **Client** : `client/src/hooks/useRealtimeSync.ts` → invalidate query keys checklist

### 3.6 AI — Alfred

- **Modèles** : OpenAI `gpt-4o-mini`, Gemini `gemini-2.0-flash`, Grok `grok-3-mini`
- **Fallback chain** : OpenAI → Gemini → Grok → texte générique
- **System prompt** : `buildSystemPrompt(tenant)` dynamique, **vocabulary-neutral** (lit `tenant.vocabulary` keys `item`/`checklist`/`customer`)
- **Contexte runtime** : checklist du jour (total/checked/uncheckedItems)
- **History** : 20 derniers messages par tenant slug en mémoire (perdu au redéploiement)
- **Auth** : depuis #54 toutes les routes Alfred sont sous `/api/alfred/:slug/*` derrière `requireUser + requireRole`

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
| `TenantChecklist` | ✅ implémenté (mode nominatif uniquement depuis #55 ; écran "Connexion requise" sinon) | `/api/checklist/:slug/*` + SSE |
| `TenantManagement` | ✅ shell + dispatch sections (suppliers seul implémenté) | `/api/management/:slug/suppliers` |
| `TenantHistory` | 🟡 stub | aucun |
| `TenantAdmin` | 🟡 stub | aucun |
| `Landing` | ✅ implémenté (hero, features, mockups, FAQ, pricing) | `/api/templates` |
| `Admin` (`/123admin`) | ✅ implémenté (users, tenants, templates, dialogs) | `/api/admin/*` |
| `AdminTenant` | 🟡 stub | aucun |
| `AuthLogin` | ✅ (avec écran MFA challenge intégré) | `/api/auth/user/{login,me,logout,mfa/*}` |
| `AuthSignup` | ✅ | `/api/auth/user/signup`, `/api/templates`, `/api/onboarding/*` |
| `AuthForgotPassword` | ✅ | `/api/auth/user/forgot-password` |
| `AuthResetPassword` | ✅ | `/api/auth/user/reset-password` |
| `AuthVerify` | ✅ | `/api/auth/user/verify-email` |
| `AuthSecurity` | ✅ MFA enrolment (QR + recovery codes affichés une fois) | `/api/auth/user/mfa/{status,setup,confirm,disable}` |

### 4.3 Composants — `client/src/components/`

| Catégorie | Composants |
|---|---|
| `ui/` (Shadcn) | badge, button, card, checkbox, dialog, input, scroll-area, select, tabs, textarea, toast, toaster, tooltip |
| `tenant/` | `TenantAppShell` (layout unifié), `TenantSidebar` (nav groupée + mobile tabs), `sections.ts` (registre nav) |
| `management/` | `SectionPlaceholder`, `sections/SuppliersSection` |
| `alfred/` | `AlfredChat` (toggle, messages, contexte checklist, prop `tenantSlug`) |
| Standalone | `ErrorBoundary`, `SkipLink`, `Logo` (variants), `theme-provider` |

### 4.4 Hooks — `client/src/hooks/`

| Hook | Rôle |
|---|---|
| `useUserSession.ts` | Session nominative — `useQuery /api/auth/user/me` + login/logout/MFA mutations |
| `useRealtimeSync.ts` | EventSource `/api/:slug/events`, callback `onChecklistUpdated` |
| `use-toast.ts` | Toast Shadcn (limit 1, reducer + listeners) |

Le hook `use-auth.ts` (PIN legacy) a été supprimé en PR #55.

### 4.5 Lib — `client/src/lib/`

- `queryClient.ts` : QueryClient TanStack Query, default `refetchOnWindowFocus: true`, `staleTime: 30s`, `retry: 2`
- `tenantHost.ts` : `getTenantSlugFromHost()`, `tenantPath()`
- `utils.ts` : `cn()` (clsx + tailwind-merge)

### 4.6 Data fetching pattern

- `queryKey` = path API en array : `["/api/checklist", slug, "dashboard"]`
- `credentials: "include"` partout (cookies session)
- Mutations invalidate par `queryClient.invalidateQueries({ queryKey: [base, slug] })`
- ⚠️ Sur la checklist, **3 mécanismes redondants** : `refetchOnWindowFocus` + `refetchInterval: 30s` + SSE (à rationaliser)

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
| `mfa_secrets` | id serial | TOTP base32 + recovery codes hash sha-256 |
| `audit_log` | id serial | event, metadata jsonb, IP, UA. **Schéma seul, aucun write** |
| `business_templates` | id serial | Catalogue verticals, self-FK `parentId` (2 niveaux). 14 entrées |
| `tenant_domains` | id serial | `hostname` UNIQUE, FK cascade tenants, idx (hostname, tenantId) |
| `user_sessions` | sid varchar | Géré par connect-pg-simple |

#### Tenant-scoped (toutes ont `tenantId integer`)

| Table | Soft delete | Particularités | FK manquantes ⚠️ |
|---|---|---|---|
| `tenants` | `isActive` | `clientCode` UNIQUE, `slug` UNIQUE, FK `templateId`. `pinCode`/`adminCode` **nullable depuis #55** (purge code, drop SQL différé) | — |
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
| Auth + scope tenant | `session.userId` + `requireRole(...)` lookup `userTenants.role(userId, tenantId)` | ✓ Correct (depuis #53/#54/#55, plus de session.tenantId legacy) |

### 5.3 Migrations

- **Mode** : `drizzle-kit push` (sync direct du schéma à la DB) appelé par `deploy.sh`
- ⚠️ **Pas de migrations versionnées** dans `migrations/` — pas d'historique
- Risque en prod : `--force` peut dropper colonnes/tables silencieusement
- Convention : changes additifs et relaxations de contrainte (NULL/DEFAULT) passent en non-interactif. Un DROP demande confirmation et casserait `deploy.sh` → script SQL séparé pour ces cas (cf. drop pin_code/admin_code différé)
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

### 6.1 Modèle d'auth (depuis PR #55)

| Modèle | État | Usage cible |
|---|---|---|
| **Nominatif** (email + Argon2id) | ✅ Implémenté (PR #12) | Tous les rôles tenant : Owner / Admin / Manager / Staff / Viewer |
| **MFA TOTP** | ✅ Implémenté (PR #13a / #52) | Opt-in côté user, recommandé Owner/Admin |
| **Bearer SUPERADMIN_TOKEN** | ✅ En place, à retirer | Routes `/api/tenants/*` (legacy transitionnel) |
| **Superadmin nominatif** | ✅ Implémenté | Routes `/api/admin/*` |

L'auth PIN partagée tenant-wide (legacy `tenants.pinCode`/`adminCode`) a été **purgée en PR #55**. Plus aucun chemin d'authentification PIN dans le code applicatif. Les colonnes restent en DB en nullable jusqu'au DROP SQL définitif (différé pour ne pas casser `deploy.sh`).

Le tablet-PIN flow Phase-2 sera reconstruit **différemment** : per-staff device-paired token (le device s'authentifie d'abord nominativement, obtient un long-lived tenant-scoped token, puis chaque staff débloque une session courte avec un PIN court — pas un PIN partagé).

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
- `requireRole(...allowed)` valide à load-time, lookup `user_tenants.role(userId, tenantId)`
- Superadmin nominatif **bypass** la vérification de rôle tenant (toujours autorisé)
- **Couverture actuelle** :
  - ✅ `/api/admin/*` (requireSuperadminUser)
  - ✅ `/api/management/:slug/suppliers/*`
  - ✅ `/api/checklist/:slug/*` (matrice rôles : READ tous / STAFF ops / MANAGE structurel)
  - ✅ SSE `/api/:slug/events` (READ tous rôles)
  - ✅ `/api/alfred/:slug/{chat,analyze,clear}` (tous rôles)

### 6.5 MFA

- ✅ Schéma `mfa_secrets`
- ✅ Service `auth/mfaService.ts` : TOTP (RFC 6238, otplib, drift ±30s), recovery codes (sha-256, single-use, format `XXXX-XXXX-XXXX`)
- ✅ Routes `/api/auth/user/mfa/{status, setup, confirm, disable, challenge, recovery, cancel}`
- ✅ Login gate : si MFA actif, le password seul retourne `{ mfaRequired: true }` et pose une session `mfaPending*` (TTL 5 min, gatée par `requireMfaPending`) — promotion vers session nominative complète après TOTP/recovery valide
- ✅ UI : page `/auth/security` (enrolment QR + secret + 10 recovery codes affichés une fois) ; écran challenge intégré au flow `/auth/login`
- 🟡 Pas encore obligatoire pour Owner/Admin (opt-in côté user)

### 6.6 Audit log

- Schéma `audit_log` présent (event, metadata jsonb, userId, tenantId, IP, UA, timestamp)
- **Aucun `INSERT` dans le code** — fonctionnellement absent (PR #13b prévue dans le sprint plan)

### 6.7 Rate limiting / lockout

- Global API : 120 req/min ✓
- Alfred : 20 req/min ✓
- **Login lockout** : ❌ (PR #13b prévue)
- **Rate-limit dédié `/api/auth/*`** : ❌ (PR #13b prévue)

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

13 fichiers de test, 124 tests :

- `scripts/__tests__/backup.test.ts` — pipeline backup (key, retention, sort)
- `server/__tests__/smoke.test.ts`
- `server/middleware/__tests__/{auth,mfaPending,requireUserAndRole}.test.ts`
- `server/services/__tests__/domainService.test.ts`
- `server/services/auth/__tests__/{passwordService,tokenService,mailService,mfaService}.test.ts`
- `server/services/alfred/__tests__/alfredService.test.ts`
- `server/seed/__tests__/templates.test.ts`
- `shared/schema/__tests__/users.test.ts`

**Couverts** : modules purs (helpers backup, password, token, mail, mfa, RBAC middleware).
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
- ❌ **Cron systemd timer pas encore câblé en prod** — script prêt, à wirer (Sprint 4 sécu/ops)

### 7.8 Observabilité

| Aspect | État |
|---|---|
| `/api/health` (uptime, SSE stats, AI provider flags) | ✅ |
| Logger structuré (pino, winston, …) | ❌ `console.log` only, préfixes `[Module]` (Sprint 5 sécu/ops) |
| Metrics (Prometheus, OpenTelemetry) | ❌ (Sprint 7 sécu/ops) |
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
| Auth max-secure | Argon2id ✓, sessions Postgres ✓, RBAC nominatif ✓, MFA TOTP ✓, PIN purgé ✓. **Audit log absent**, **lockout absent** | 🟢 70% |

### 8.2 Modules métier

| Module | Schéma DB | API | UI | État |
|---|---|---|---|---|
| Checklist quotidienne | ✅ | ✅ | ✅ | **Production-ready** |
| Suppliers | ✅ | ✅ | ✅ | **Production-ready** (PR #2) |
| Purchases | ✅ | ❌ | ❌ | Schémé, planifié Sprint 1 module |
| General expenses | ✅ | ❌ | ❌ | Schémé, planifié Sprint 2 |
| Bank entries | ✅ | ❌ | ❌ | Schémé, planifié Sprint 2 |
| Cash entries | ✅ | ❌ | ❌ | Schémé, planifié Sprint 2 |
| Files | ✅ | ❌ | ❌ | Schémé, planifié Sprint 5 (R2 upload) |
| Employees | ✅ | ❌ | ❌ | Schémé, planifié Sprint 3 |
| Payroll | ✅ | ❌ | ❌ | Schémé, planifié Sprint 4 |
| Absences | ✅ | ❌ | ❌ | Schémé, planifié Sprint 4 |
| Analytics | ✅ | ❌ | ❌ | Schémé, planifié Sprint 6 |

### 8.3 Cycle de vie SaaS

| Étape | État |
|---|---|
| Self-serve signup (user + tenant) | ✅ `POST /api/onboarding/signup-with-tenant` |
| Email verify | ✅ |
| Forgot/reset password | ✅ |
| Onboarding wizard (template picker au signup) | ✅ |
| MFA opt-in | ✅ (page `/auth/security`) |
| Billing / abonnement | ❌ Stripe non intégré (phase 2) |
| Trial / quota / plan limits | ❌ |
| Cancellation / data export | ❌ |
| RGPD : right to be forgotten | ❌ (cascade FK incomplet) |
| Custom domain provisioning | 🟡 Schéma OK, automation ❌ |

### 8.4 Verdict global

> **myBeez est un MVP solide (~55%) sur une architecture saine, en cours de durcissement sécu et en attente des modules métier.**
>
> Les fondations (multi-tenant, auth nominative + MFA + RBAC, templates, deploy, CI) sont là. Le sprint 1 a soldé la moitié de la dette auth historique (matrice rôles checklist + Alfred gaté + purge PIN). Ce qui manque pour être *bankable* : modules métier (8 sur 11 à livrer via le sprint plan 7 sprints), audit log + rate-limit/lockout, billing, monitoring.

---

## 9. Points forts

1. **Architecture multi-tenant cohérente** — décisions structurelles écrites (subdomain + templates + auth nominative) et respectées dans le code.
2. **Stack moderne et maintenue** — TS strict, ESM, Drizzle, Vite 7, TanStack Query, Tailwind. Pas de framework legacy.
3. **Auth nominative bien construite** — Argon2id, sessions Postgres, RBAC `requireRole(...)`, anti-enumeration sur forgot-password, host-header injection guard, MFA TOTP avec recovery codes.
4. **Auth PIN purgée** — un seul modèle d'auth dans le code applicatif, plus de coexistence dette.
5. **CI/CD opérationnelle** — GitHub Actions exécute typecheck + lint + test + build sur chaque PR. Bloque les merges régressifs.
6. **Tests sur les fondations critiques** — Vitest sur password hashing, token crypto, MFA, RBAC middleware, backup pipeline, domain resolution.
7. **Backup pipeline production-grade** — pg_dump streamé vers R2, retention automatique, restore en dry-run par défaut.
8. **Realtime SSE proprement gaté** — keepalive, header `X-Accel-Buffering`, scope par tenant + `requireRole`, broadcast après mutations.
9. **Alfred AI vocabulary-neutral et sécurisé** — system prompt construit dynamiquement à partir de `tenant.vocabulary`, fallback chain provider robuste, routes slug-scoped + `requireRole` (depuis #54).
10. **Linter + formatter en place** — ESLint flat config, Prettier, exécutés en CI.
11. **Déploiement reproductible** — Docker compose + script `deploy.sh` idempotent + nginx vhost versionné.
12. **Documentation interne** — CLAUDE.md à jour décrit stack, architecture, conventions, dette connue. Cette bible aussi.
13. **Pattern UI cohérent** — Shadcn/UI, sidebar tenant unifiée, composant `TenantAppShell` partagé, registre `sections.ts`.

---

## 10. Points faibles et dette technique

### 10.1 Architecture

- **Pas de Row-Level Security PostgreSQL** — l'isolation multi-tenant repose entièrement sur les `where(eq(table.tenantId, ...))` Drizzle. Une seule omission = fuite.
- **Foreign keys logiques non contraintes** — `items.categoryId`, `checks.itemId`, `purchases.supplierId`, `payroll.employeeId`, `absences.employeeId` ne sont pas FK en DB. Orphelins possibles.
- **Caches process-local** (`tenantService`, `templateService`, `alfredService`) — non cluster-safe. Bloque le scale-out horizontal.
- **Pas de migrations versionnées** — `db:push` synchronise sans historique. `--force` peut dropper en prod.

### 10.2 Auth / sécurité

- ~~PIN codes en clair~~ ✅ Hashés en #51 puis purge complète #55. Colonnes nullable, drop SQL définitif différé.
- ~~MFA TOTP~~ ✅ Implémenté en #52.
- **Audit log** : schéma seul, aucun write (PR #13b prévue Sprint 2).
- **Lockout login** : pas de protection brute-force compte (PR #13b Sprint 3).
- **Pas de check HIBP** sur passwords.
- **CSP désactivé** dans helmet (compromis Vite dev — Sprint 6).
- **Pas de HSTS** côté nginx (Sprint 6).
- **MFA opt-in seulement** — pas encore obligatoire pour Owner/Admin.

### 10.3 Backend

- ~~GET checklist sans auth~~ ✅ Gaté PR #50 puis matrice rôles #53.
- ~~SSE sans auth~~ ✅ Gaté PR #50 puis #53.
- ~~Routes Alfred prennent slug en body~~ ✅ Refactoré PR #54.
- ~~`server/services/auth.ts` wrapper vide~~ ✅ Supprimé PR #55.
- ~~Type incohérent `AuthSession.tenantId`~~ ✅ Type supprimé avec PIN #55.
- **Persistence Alfred history** : en mémoire process-local, perdu au redéploiement (Sprint future).

### 10.4 Frontend

- **3 mécanismes de refresh redondants sur la checklist** : `refetchOnWindowFocus` + `refetchInterval: 30s` + SSE.
- ~~`useAuth` (PIN) coexiste avec `useUserSession`~~ ✅ `use-auth.ts` supprimé PR #55.
- **9 sections `/management/...` en placeholder** — UI à livrer (cf. sprint plan).
- **`AdminTenant` page stub** — route `/123admin/tenants/:id` ne charge rien.
- **Aucun test frontend** — 0 fichier `.test.tsx`.
- **Landing page monolithique** (~890 lignes).

### 10.5 Ops

- **Pas de `HEALTHCHECK` sur le service Docker `app`** — pas de restart auto si freeze silencieux (Sprint 4 sécu/ops).
- **Pas de logger structuré** (juste `console.log`), pas de persistence (Sprint 5 sécu/ops).
- **Aucune metrics applicative** (latence, error rate, DB pool) — Sprint 7.
- **Aucun alerting**.
- **Cron backups** pas encore câblé en prod (Sprint 4 sécu/ops).
- **Pas de chiffrement** des dumps R2.
- **Pas de pre-commit hooks** (Husky/lint-staged).

### 10.6 Code mort / orphelins

- ~~`server/services/auth.ts`~~ ✅ Supprimé #55.
- ~~Coexistence PIN ↔ nominatif~~ ✅ Purgée #55.
- `client/src/pages/AdminTenant.tsx` (stub non chargé) — laisser ou supprimer ?

---

## 11. Risques de sécurité priorisés

| # | Sévérité | Risque | Localisation | Effort fix | Statut |
|---|---|---|---|---|---|
| 1 | ~~🔴 critique~~ | GET checklist sans auth | `server/routes/checklist.ts` | S | ✅ #50 + #53 |
| 2 | ~~🔴 critique~~ | SSE `/api/:tenant/events` sans auth | `server/services/realtimeSync.ts` | S | ✅ #50 + #53 |
| 3 | ~~🔴 critique~~ | PIN codes stockés en clair | `tenants.pinCode/adminCode` | M | ✅ #51 hash, #55 purge complète |
| 4 | 🟡 moyen | MFA pas obligatoire pour Owner/Admin (opt-in) | politique de gate | M | partiel — implémenté #52, gating à brancher |
| 5 | 🟠 haut | FK manquantes (orphelins possibles) | items, checks, purchases, payroll, absences | M | à planifier |
| 6 | 🟠 haut | Audit log non écrit (compliance RGPD) | (à implémenter) | M | Sprint 2 sécu/ops (PR #13b) |
| 7 | 🟠 haut | Lockout login + rate-limit dédié `/api/auth/*` | rate-limiter | S | Sprint 3 sécu/ops |
| 8 | 🟡 moyen | CSP désactivé dans helmet | `server/index.ts` | M | Sprint 6 sécu/ops |
| 9 | 🟡 moyen | Pas de HSTS côté nginx | `deploy/nginx/mybeez-ai.com.conf` | XS | Sprint 6 sécu/ops |
| 10 | 🟡 moyen | Cache `tenantService` process-local | `services/tenantService.ts` | M | scale-out future |
| 11 | 🟡 moyen | Pas de check HIBP | `auth/passwordService.ts` | S | Sprint 6 sécu/ops |
| 12 | 🟡 moyen | `db:push` sans migrations versionnées | `drizzle.config.ts` | M | scale-out future |
| 13 | 🟡 moyen | Pas de healthcheck Docker `app` | `Dockerfile`, `docker-compose.yml` | XS | Sprint 4 sécu/ops |
| 14 | 🟡 moyen | Pas de logs structurés / persistence | `server/index.ts` | M | Sprint 5 sécu/ops |
| 15 | ~~🟢 faible~~ | Routes Alfred slug en body | `server/routes/alfred.ts` | S | ✅ #54 |
| 16 | ~~🟢 faible~~ | Code mort `services/auth.ts` | — | XS | ✅ #55 |
| 17 | 🟢 faible | Drop SQL définitif `tenants.pin_code/admin_code` | migration script | XS | différé (deploy.sh non interactif) |

---

## 12. Roadmap et intégrations futures

### 12.1 Sprint plan validé (option C, 2026-05-05)

7 sprints, 1 module métier + 1 chantier sécu/ops par sprint.

| Sprint | Module métier | Sécu / Ops | Statut |
|---|---|---|---|
| 1 | feat/purchases | MFA TOTP | sécu ✅ #52 + bonus #53/#54/#55 ; module ⏳ à venir |
| 2 | feat/cashflow (bank + cash + general expenses) | Audit log writes | à venir |
| 3 | feat/employees | Lockout login + rate-limit dédié `/api/auth/*` | à venir |
| 4 | feat/payroll-absences | Healthcheck Docker app + cron systemd backup R2 | à venir |
| 5 | feat/files | Logger structuré pino (stdout JSON) | à venir |
| 6 | feat/analytics | HSTS nginx + CSP helmet + check HIBP | à venir |
| 7 | feat/history-cross | Metrics Prometheus + Sentry frontend | à venir |

Règles : les 2 PRs d'un sprint touchent des zones disjointes. Quality gates (`npm run check` + lint + test + CI) verts avant merge. Squash-merge sur main.

**Stratégie d'implémentation des modules métier** : adaptation depuis macommande.shop (qui a déjà du tissu prod restaurant) plutôt que from-scratch. 3 garde-fous lors du port : vertical-agnostic (purger restaurant-isme), auth nominative + RBAC (ne PAS porter le PIN partagé), multi-tenancy host-based.

### 12.2 Hors-200% (phase 2)

- **Stripe** : abonnements, plan limits (nombre d'employees / tenants / users), trial 14 jours
- **Custom domain provisioning automatisé** : Let's Encrypt DNS-01 ou Cloudflare on-demand TLS
- **Passkeys / WebAuthn** : phase 2 auth (remplace MFA TOTP comme primary)
- **SSO Google/Microsoft** : pour Owner uniquement
- **Mobile** : PWA d'abord (manifest + service worker), app native plus tard
- **Intégrations comptables** : export FEC (France), liaison Pennylane / QuickBooks
- **Marketplace de templates** : verticals contribués par la communauté
- **MFA obligatoire pour Owner/Admin** (gating selon politique)
- **RLS Postgres** comme défense en profondeur

### 12.3 Scale-out (avant 100+ tenants)

- Redis pour `tenantService` + `templateService` + sessions partagées
- Cluster mode Node (`pm2` ou Kubernetes)
- Read replica Postgres
- CDN Cloudflare devant les assets statiques (déjà en place via CF proxy)
- Migrations versionnées (`drizzle-kit generate` + `migrate`) pour remplacer `db:push`

### 12.4 IA / Alfred

- Persistence chat history en DB (actuellement en mémoire, perdu au déploiement)
- Embeddings + RAG sur la doc de gestion du tenant
- Multimodal : OCR sur factures uploadées (Files module Sprint 5)

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
POST   /api/auth/user/login                  connexion email + password (+ MFA si activé)
POST   /api/auth/user/mfa/challenge          finit le login si MFA actif
GET    /api/auth/user/me                     session courante + tenants
POST   /api/onboarding/signup-with-tenant    self-serve signup user + tenant
GET    /api/templates                        catalog verticals (public)
GET    /api/management/:slug/suppliers       liste fournisseurs (RBAC)
POST   /api/checklist/:slug/toggle           coche un item (rôle STAFF+)
GET    /api/:slug/events                     SSE realtime (rôle tenant)
POST   /api/alfred/:slug/chat                Alfred chat (rôle tenant)
GET    /api/health                           uptime + status
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
| **MFA pending** | Session half-baked entre password et TOTP/recovery, TTL 5 min, gatée par `requireMfaPending`. |
| **Slug** | Nom URL-friendly du tenant (`valentine`, `meyer`). UNIQUE. |
| **Client code** | Code 8 chiffres généré au signup, montré à l'utilisateur (pas un secret). |
| **~~PIN code~~** | ⚠ Retiré PR #55. Colonnes `tenants.pin_code/admin_code` laissées nullable, plus aucune écriture. Le PIN-on-tablet Phase-2 sera reconstruit comme un per-staff device-paired token. |
| **Checklist** | Liste d'items à cocher chaque jour, par catégorie/zone. Source du POC. |
| **Alfred** | Assistant IA conversationnel contextualisé sur la checklist. URL `/api/alfred/:slug/*`. |
| **SSE** | Server-Sent Events, canal `/api/:slug/events` pour la sync temps réel. |

---

*Fin de bible. Mettre à jour à chaque évolution structurelle.*
