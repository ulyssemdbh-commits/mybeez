# Chapitre 02 — Architecture générale

> **Résumé.** myBeez est un mono-repo TypeScript avec 3 dossiers (`client`,
> `server`, `shared`) servis par un seul process Node 20+ derrière nginx, avec
> Postgres dans un container voisin, le tout sur un Hetzner AX422 derrière
> Cloudflare. Stack moderne (React 18 + Vite 7, Express 4, Drizzle ORM,
> TanStack Query 5). Le pattern multi-tenant est **single DB single schema**
> avec colonne `tenant_id` et résolution **hostname-first**.

---

## 2.1 Vue d'ensemble système

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENT (navigateur)                                                  │
│  ┌────────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
│  │ Apex landing   │  │ <slug>.mybeez-ai.com │  │ custom-domain    │   │
│  │ /auth/login    │  │ tenant app shell     │  │ <tenant>.com     │   │
│  │ /123admin      │  │  - checklist         │  │ (pricing tier)   │   │
│  │                │  │  - /management/*     │  │                  │   │
│  └────────────────┘  └──────────────────────┘  └──────────────────┘   │
└─────────────────────────────────┬────────────────────────────────────┘
                                  │ Cloudflare (proxy ON, Full strict)
┌─────────────────────────────────▼────────────────────────────────────┐
│  HETZNER AX422 — 65.21.209.102                                        │
│  ┌────────────┐                                                       │
│  │ nginx 80/443 ── CF Origin Cert (apex + wildcard)                   │
│  │   └─ proxy_pass 127.0.0.1:3000                                     │
│  └─────┬──────┘                                                       │
│        │                                                              │
│  ┌─────▼──────────────────────────┐  ┌────────────────────────────┐   │
│  │ Docker: mybeez-app (Node 20)   │  │ Docker: mybeez-db          │   │
│  │  - Express + TanStack Query    │  │   postgres:16-alpine       │   │
│  │  - Drizzle ORM                 │  │   port 5434:5432           │   │
│  │  - SSE realtime                │  │   volume pgdata            │   │
│  │  - Alfred AI fallback chain    │  │   healthcheck pg_isready   │   │
│  └────────┬───────────────────────┘  └────────────────────────────┘   │
└───────────┼───────────────────────────────────────────────────────────┘
            │
            ├── OpenAI / Gemini / Grok (Alfred)
            ├── Resend (transactional email)
            └── Cloudflare R2 (Postgres dumps offsite + uploads Files futurs)
```

---

## 2.2 Stack technique

| Couche | Tech | Version |
|---|---|---|
| Langage | TypeScript (strict, ESM `"type": "module"`) | 5.6.3 |
| Runtime | Node | 20+ (Docker), 22 dev local |
| Backend | Express, helmet, compression, cookie-parser, express-session, express-rate-limit | 4.21 |
| ORM | Drizzle + drizzle-zod (driver `pg` Pool) | 0.45.2 |
| DB | PostgreSQL | 16-alpine |
| Frontend | React, Vite, wouter, TanStack Query | 18 / 7 / 3 / 5 |
| UI | TailwindCSS, Shadcn/UI (Radix), framer-motion, lucide-react, dnd-kit | 3 |
| Realtime | SSE custom (pas de socket.io) | — |
| AI | OpenAI SDK + fallback Gemini → Grok | 6 |
| Auth crypto | argon2id, otplib (TOTP RFC 6238), qrcode | latest |
| Email | Resend SDK | 6.12 |
| Storage objet | @aws-sdk/client-s3 + lib-storage (vers R2) | 3.1039 |
| Upload | multer (memory storage, max 50 MB) | 2.1 |
| Validation | Zod | 3.25 |
| Tests | Vitest | 2.1 |
| Lint / Format | ESLint flat config 9 + Prettier | 9 / 3.8 |
| Build prod | Vite (front → `dist/public/`) + esbuild (back → `dist/index.cjs` CJS) | — |

> **Note CJS.** Le bundle backend est volontairement CJS (`--format=cjs`) pour
> éviter les problèmes ESM en environnement Node mixte. Conséquence connue :
> `import.meta.dirname` n'est PAS polyfill par esbuild — utiliser `process.cwd()`
> à la place côté serveur. PR #18 a corrigé `serveStatic()` pour ça.

---

## 2.3 Mono-repo

```
mybeez/
├── client/           # React (Vite root = ./client)
│   ├── index.html
│   └── src/
│       ├── App.tsx                  # Routing wouter, détection host
│       ├── main.tsx
│       ├── pages/                   # 13 pages (auth + tenant + admin + landing)
│       ├── components/
│       │   ├── ui/                  # Shadcn (badge, button, card, dialog, …)
│       │   ├── tenant/              # AppShell + Sidebar + sections.ts
│       │   ├── management/          # Sections + sharedUI (port ulysseclaude)
│       │   ├── templates/           # IconRenderer + TenantTemplateSection + Modules + Vocabulary
│       │   ├── signup/              # Wizard 3 étapes + TemplateCard
│       │   ├── alfred/              # AlfredChat
│       │   └── …                    # ErrorBoundary, SkipLink, Logo, theme-provider
│       ├── hooks/                   # useUserSession, useRealtimeSync, use-toast
│       ├── lib/                     # queryClient, tenantHost, utils
│       └── index.css
├── server/           # Express
│   ├── index.ts                     # Bootstrap : helmet, session, rate-limit, register routes
│   ├── db.ts                        # Pool pg + drizzle(pool, { schema })
│   ├── middleware/
│   │   ├── tenant.ts                # resolveTenant (hostname-first)
│   │   └── auth.ts                  # requireUser/requireRole/requireSuperadminUser/requireMfaPending
│   ├── routes/
│   │   ├── userAuth.ts              # signup, login, logout, me, verify, forgot/reset
│   │   ├── userAuthMfa.ts           # MFA TOTP : status/setup/confirm/disable/challenge/recovery/cancel
│   │   ├── tenants.ts               # /api/tenants — Bearer SUPERADMIN_TOKEN (legacy)
│   │   ├── admin.ts                 # /api/admin/* — superadmin nominatif
│   │   ├── onboarding.ts            # signup-with-tenant + check-slug
│   │   ├── templates.ts             # catalog public read-only
│   │   ├── alfred.ts                # /api/alfred/:slug/{chat,analyze,clear}
│   │   ├── checklist.ts             # /api/checklist/:slug/*
│   │   └── management/              # CRUD modules métier
│   │       ├── suppliers.ts
│   │       ├── purchases.ts         # + OCR auto-match
│   │       ├── expenses.ts
│   │       ├── files.ts             # upload + corbeille TTL 7j (en cours)
│   │       ├── settings.ts          # vocabulary + modulesEnabled
│   │       └── template.ts          # switch template tenant
│   ├── services/
│   │   ├── tenantService.ts         # CRUD tenants + cache mémoire + clientCode
│   │   ├── domainService.ts         # resolveTenantByHost + cache TTL 60s
│   │   ├── templateService.ts       # catalog business_templates en cache
│   │   ├── realtimeSync.ts          # SSE par tenant + emitChecklistUpdated
│   │   ├── alfred/                  # alfredService + prompt builder
│   │   ├── auth/                    # password, token, user, userTenant, mail, mfa, audit
│   │   ├── files/                   # naming + storage + trashService
│   │   ├── parsing/                 # invoiceParser (OCR Vision API)
│   │   └── core/openaiClient.ts     # Factory provider AI (OpenAI > Gemini > Grok)
│   ├── seed/
│   │   └── templates.ts             # 4 verticals × 25 sub-templates
│   └── __tests__/                   # Vitest
├── shared/           # Types et schémas partagés (back ↔ front)
│   ├── schema.ts                    # re-export tenants + checklist + domains + templates
│   ├── modules.ts                   # registre des modules toggleables
│   └── schema/
│       ├── tenants.ts
│       ├── domains.ts
│       ├── templates.ts
│       ├── users.ts                 # users + user_tenants + tokens + mfa + audit_log
│       └── checklist.ts             # 18 tables business (purchases, expenses, files, files_trash, …)
├── scripts/          # Tâches ops (tsx, jamais bundlées)
│   ├── _lib/                        # r2 + backup helpers (testés)
│   ├── backup-postgres.ts           # pg_dump | gzip | upload R2 + retention
│   ├── restore-postgres.ts          # liste / restore avec dry-run
│   ├── seed-templates.ts            # upsert idempotent
│   ├── grant-superadmin.ts          # one-shot pour bootstrap
│   └── __tests__/
├── deploy/
│   ├── deploy.sh                    # pull + build + db:push + nginx reload
│   ├── init-secrets.sh              # génère SESSION_SECRET / SUPERADMIN_TOKEN au premier deploy
│   └── nginx/
│       └── mybeez-ai.com.conf       # vhost (apex + wildcard, CF Origin Cert)
├── docs/
│   ├── bible.md                     # legacy (redirige vers booksystem/)
│   └── booksystem/                  # ce livre
├── .github/workflows/ci.yml         # CI : typecheck + lint + test + build
├── Dockerfile                       # multi-stage Node 20 alpine
├── docker-compose.yml               # app + db
├── drizzle.config.ts
├── eslint.config.js                 # flat config 9
├── tsconfig.json
└── vite.config.ts
```

### 2.3.1 Aliases TS / Vite

| Alias | Cible |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

### 2.3.2 Build prod

| Cible | Outil | Sortie |
|---|---|---|
| Frontend | Vite | `dist/public/` (index.html + assets versionnés) |
| Backend | esbuild | `dist/index.cjs` (1 fichier CJS, externals : pg, openai, packages) |

`npm run build` enchaîne les deux. `npm run start` lance `node dist/index.cjs`.

---

## 2.4 Résolution tenant

Le pattern multi-tenant est **hostname-first**, géré par `resolveTenant`
middleware (`server/middleware/tenant.ts`).

### 2.4.1 Algorithme

1. Extraire `req.hostname`.
2. Si `<slug>.<root>` (où `<root>` ∈ `ROOT_DOMAINS`, default
   `mybeez-ai.com,localhost`) → résoudre par slug.
3. Sinon, lookup `tenant_domains` pour custom domain (filtre
   `verifiedAt IS NOT NULL`, cache TTL 60s via `domainService`).
4. **Fallback legacy** : si rien ne matche, essayer `req.params.slug`.
5. Si `:slug` URL ne matche pas le tenant résolu par host → 400.
6. Injecter `req.tenantId: number`.

### 2.4.2 Réservés (apex behavior)

Sous-domaines techniques jamais traités comme tenant :
`www, api, admin, app, static, cdn, mail, blog, status, docs, support, help`.

### 2.4.3 Dev local

`*.localhost` est reconnu (RFC 6761 résout vers 127.0.0.1).
`valentine.localhost:3000` ⇒ tenant `valentine`. Pas besoin de toucher
`/etc/hosts`.

### 2.4.4 Cookie de session

En prod, scope `domain: .mybeez-ai.com` pour traverser les subdomains. En dev,
laissé unset (browsers refusent `.localhost`).

---

## 2.5 Patterns architecturaux

### 2.5.1 Bootstrap backend

Ordre d'initialisation dans `server/index.ts` (cf. [chapitre 03.1](./03-backend.md#31-bootstrap)) :

1. Garde-fous env (`SESSION_SECRET`, `APP_BASE_URL` requis en prod, exit 1).
2. Helmet + compression + cookie-parser + express.json (10mb).
3. Session Postgres-backed (`connect-pg-simple`).
4. Rate limiters globaux (`/api/`, `/api/alfred/`).
5. `registerRoutes()` : imports dynamiques pour chaque module routes.
6. `/api/health`.
7. `serveStatic()` en prod (SPA fallback).
8. Listen `PORT` (default 3000).

### 2.5.2 Pattern de route

Chaque module exporte une fonction `register<Module>Routes(app: Express)` :

```ts
export function registerManagementPurchasesRoutes(app: Express): void {
  const r = "/api/management/:slug/purchases";

  app.get(r, resolveTenant, requireUser, requireRole(...READ_ROLES), handler);
  app.post(r, resolveTenant, requireUser, requireRole(...WRITE_ROLES), handler);
  // ...
}
```

Chaîne middleware standard : `resolveTenant → requireUser → requireRole(...)`.

Validation Zod en haut de fichier, parsing dans le handler. Erreurs en français,
500 générique sur exception, 400 sur ZodError avec `details`.

### 2.5.3 Pattern de service

Services en classes singleton ou modules avec functions exportées. Pas de DI
framework. Cache process-local quand pertinent (à étiqueter ⚠️ pour scale-out).

### 2.5.4 Pattern data fetching frontend

- `queryKey` = path API en array : `["/api/management", slug, "purchases"]`.
- `credentials: "include"` partout (cookies session).
- Mutations invalidate par `queryClient.invalidateQueries({ queryKey: [base, slug] })`.

### 2.5.5 Validation côté serveur uniquement

Zod schemas vivent côté serveur dans chaque fichier de route, et côté shared
pour les schemas Drizzle (`shared/schema/`). Le client envoie ce qu'il veut, le
serveur tranche.

---

## 2.6 Conventions de code

### Backend

- Modules en classes singleton ou functions exportées. Pas de DI.
- Routes : `register<Module>Routes(app)` exportée, importée en lazy depuis
  `server/index.ts`.
- Validation : un schéma Zod par fichier de route.
- Erreurs utilisateur **en français**.
- Logs : `console.log("[Module] message")`. Pas de logger structuré (Sprint 5).
- JSDoc en tête de fichier (rôle + résumé).

### Frontend

- Routing : wouter (pas react-router).
- Data fetching : TanStack Query.
- Mutations : `useMutation` + invalidation.
- Composants UI : Shadcn dans `components/ui/`, helper `cn()`.
- Lazy : pages chargées en `React.lazy` + `Suspense`.
- Theming : variables CSS HSL (`--background`, `--primary`, …) + Tailwind.
- Testabilité : `data-testid` sur les éléments interactifs.

### Git

- Commits **Conventional Commits** : `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Branches : `feat/* fix/* refactor/* chore/* docs/*`.
- Merge : **squash** sur `main`.
- Pas de force-push sur `main`.

---

*Suite du livre → [03-backend.md](./03-backend.md)*
