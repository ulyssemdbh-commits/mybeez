# CLAUDE.md — myBeez

> Document d'onboarding pour Claude / tout nouveau contributeur.
> À mettre à jour à la fin de chaque session significative.
>
> **Pour le détail complet (architecture, modules, sécu, ops, roadmap), voir
> le booksystem :** [`docs/booksystem/README.md`](./docs/booksystem/README.md).
> Ce fichier reste l'onboarding rapide ; le booksystem est la source de vérité
> exhaustive et est mis à jour à chaque sprint.

---

## 1. Stack technique

**Langage** : TypeScript 5.6 (strict, ESM, `"type": "module"`)
**Runtime backend** : Node 20+ (Docker), Node 22 en local. Dev via `tsx`.
**Package manager** : npm (lockfile présent)

| Couche | Tech |
|---|---|
| Backend | Express 4, helmet, compression, cookie-parser, express-session, express-rate-limit |
| ORM / DB | Drizzle ORM 0.45 + drizzle-zod, PostgreSQL (driver `pg` avec Pool) |
| Frontend | React 18 + Vite 7, wouter (routing), TanStack Query 5 |
| UI | TailwindCSS 3, Shadcn/UI (Radix primitives), framer-motion, lucide-react, dnd-kit |
| Validation | Zod 3 (côté serveur sur chaque route) |
| Build prod | Vite (front → `dist/public`) + esbuild (back → `dist/index.cjs`, format CJS) |
| Realtime | SSE custom (pas de socket.io) |
| AI | OpenAI SDK 6, fallback Gemini → Grok via `core/openaiClient` |

**Outils absents (à savoir)** :
- ❌ Aucun framework de test installé (pas de vitest/jest)
- ❌ Pas d'ESLint, pas de Prettier
- ❌ Pas de pre-commit hooks
- ❌ Pas de CI configurée
- Le seul garde-fou automatisé est `npm run check` (= `tsc`).

---

## 2. Architecture haut niveau

Monorepo unique, 3 dossiers TS partageant le même `tsconfig.json` :

```
mybeez/
├── client/           # React (Vite) — root Vite = ./client
│   ├── index.html
│   └── src/
│       ├── App.tsx                 # Routing wouter : /, /:slug, /:slug/admin, /:slug/history, /:slug/management
│       ├── main.tsx
│       ├── pages/                  # TenantChecklist + TenantManagement (sections Suppliers/Purchases/Expenses/Files/Employees/Payroll/Absences livrées) + TenantAdmin (section vocabulaire/modules/template). TenantHistory = stub.
│       ├── components/
│       │   ├── ui/                 # Shadcn générés (button, card, input, dialog, …)
│       │   ├── alfred/AlfredChat.tsx
│       │   ├── ErrorBoundary.tsx, SkipLink.tsx, theme-provider.tsx
│       ├── hooks/                  # useUserSession, use-toast, useRealtimeSync
│       ├── lib/                    # queryClient.ts (apiRequest + getQueryFn), utils.ts (cn helper)
│       └── index.css
├── server/           # Express
│   ├── index.ts                    # Bootstrap : helmet, compression, session, rate-limit, register routes, SPA fallback
│   ├── db.ts                       # Pool pg + drizzle(pool, { schema })
│   ├── middleware/
│   │   ├── tenant.ts               # resolveTenant: hostname-first (subdomain ou custom domain), fallback :slug
│   │   └── auth.ts                 # nominative: requireUser/requireRole(...)/requireSuperadminUser ; MFA: requireMfaPending ; legacy bearer: requireSuperadmin
│   ├── routes/
│   │   ├── userAuth.ts             # /api/auth/user/{signup, login, logout, me, verify-email, forgot-password, reset-password}  (nominative)
│   │   ├── userAuthMfa.ts          # /api/auth/user/mfa/{status, setup, confirm, disable, challenge, recovery, cancel}  (TOTP)
│   │   ├── tenants.ts              # /api/tenants — gatées par requireSuperadmin (Bearer)
│   │   ├── templates.ts            # /api/templates (public, read-only catalog vertical-agnostic)
│   │   ├── checklist.ts            # /api/checklist/:slug/* — toutes scopées par tenant
│   │   └── alfred.ts               # /api/alfred/{chat, analyze, clear}
│   ├── services/
│   │   ├── tenantService.ts        # CRUD tenants + cache mémoire + génération clientCode 8 chiffres
│   │   ├── domainService.ts        # resolveTenantByHost (subdomain + custom domain) + cache 60s
│   │   ├── templateService.ts      # catalog business_templates en cache mémoire (small set)
│   │   ├── auth/passwordService.ts # argon2id hash/verify + bornes longueur (OWASP 2024)
│   │   ├── auth/tokenService.ts    # tokens reset/verify : random 32B base64url, sha256 hash, TTL constants
│   │   ├── auth/userService.ts     # CRUD users + lifecycle tokens (issue/consume verify + reset)
│   │   ├── auth/userTenantService.ts # CRUD user_tenants (M2M user↔tenant + role)
│   │   ├── auth/mailService.ts     # Resend client + templates verify/reset, fail-soft (logs si pas de RESEND_API_KEY)
│   │   ├── auth/mfaService.ts      # TOTP RFC 6238 (otplib) + recovery codes (sha-256, single-use), enrol/confirm/verify/disable
│   │   ├── realtimeSync.ts         # SSE par tenant + emitChecklistUpdated()
│   │   ├── alfred/alfredService.ts # Chat AI : history en mémoire par tenant slug + provider chain
│   │   ├── alfred/prompt.ts        # buildSystemPrompt(tenant) — pure, testable, dynamique (vocabulary)
│   │   └── core/openaiClient.ts    # Factory provider AI (OpenAI > Gemini > Grok)
│   └── seed/
│       └── templates.ts            # 14 verticals (3 top + 11 sub) — source of truth pour seed:templates
├── shared/           # Types et schémas partagés (back ↔ front)
│   ├── schema.ts                   # re-export tenants + checklist + domains + templates
│   └── schema/
│       ├── tenants.ts              # table tenants (multi-tenant root)
│       ├── domains.ts              # tenant_domains (custom domains uniquement, vérification + SSL status)
│       ├── templates.ts            # business_templates : catalogue vertical-agnostic, self-FK 2 niveaux
│       ├── users.ts                # users + user_tenants (M2M role) + tokens (reset/verify) + mfa_secrets + audit_log
│       └── checklist.ts            # categories, items, checks, futureItems, emailLogs, comments,
│                                   # suppliers, purchases, generalExpenses, files, bankEntries,
│                                   # cashEntries, employees, payroll, absences, analytics
└── scripts/          # Tâches ops, exécutées via tsx (jamais bundlées)
    ├── _lib/
    │   ├── r2.ts                   # client S3 pointé sur R2 + helpers (upload/list/download/delete)
    │   └── backup.ts               # fonctions pures (backupKey, retention, sort) — testées
    ├── backup-postgres.ts          # pg_dump | gzip | upload R2 + retention sweep
    ├── restore-postgres.ts         # liste / restore depuis R2 (dry-run par défaut)
    ├── seed-templates.ts           # upsert idempotent depuis server/seed/templates.ts
    └── __tests__/                  # vitest sur les helpers purs
```

### Aliases TS / Vite

| Alias | Cible |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

### Pattern multi-tenant

- **Single DB, single schema** : toutes les tables business ont une colonne `tenant_id` (integer, FK logique vers `tenants.id`).
- **Aucune RLS PostgreSQL** : l'isolation est garantie uniquement par les `where(eq(table.tenantId, tid))` côté Drizzle. Toute requête manquant ce filtre = fuite trans-tenant.
- **Résolution (PR #7)** : middleware `resolveTenant` essaye **hostname-first** (via `domainService.resolveTenantByHost`) :
  - subdomain `<slug>.<root>` (les `<root>` viennent de `ROOT_DOMAINS`, default `mybeez-ai.com,localhost`)
  - sinon custom domain (lookup `tenant_domains` avec `verifiedAt IS NOT NULL`)
  - **fallback legacy** sur `req.params.slug` si la résolution par host échoue (transition douce, à retirer)
  - 400 si `:slug` URL ne matche pas le tenant résolu par host
- **Dev local** : `*.localhost` est reconnu (RFC 6761 résout vers 127.0.0.1). `valentine.localhost:3000` ⇒ tenant `valentine`. Pas besoin de toucher `/etc/hosts`.
- **Auth + scope tenant** : `session.userId` (nominatif) + `req.tenantId` (résolu par `resolveTenant`) → le binding rôle est vérifié par `requireRole(...)` via `userTenantService.getRole(userId, tenantId)`. Aucune route applicative ne dépend plus de `session.tenantId` (legacy PIN — supprimé).

---

## 3. Commandes essentielles

| Commande | Quoi |
|---|---|
| `npm install` | Installation deps |
| `npm run dev` | Dev server (Express + Vite proxy /api) — ⚠ syntaxe Unix `NODE_ENV=` ne marche pas en PowerShell, voir §6 |
| `npm run build` | Build prod : front Vite → `dist/public/`, back esbuild → `dist/index.cjs` |
| `npm run start` | Lance le bundle prod (`node dist/index.cjs`) |
| `npm run check` | Typecheck (`tsc`, noEmit). **Le seul check automatisé.** |
| `npm run db:push` | Sync du schéma Drizzle vers la DB (destructif si `--force`) |
| `npm run backup` | Dump Postgres → gzip → R2 (`mybeezdb/YYYY-MM-DD/...sql.gz`) + retention sweep |
| `npm run restore -- <key\|latest>` | Restore depuis R2 vers `DATABASE_URL` (sans arg = liste les 20 dumps les plus récents) |
| `npm run seed:templates` | Upsert le catalogue `business_templates` depuis `server/seed/templates.ts` (idempotent) |

**Variables d'env** : voir `.env.example` (à la racine) pour la liste complète et commentée.
- Requis : `DATABASE_URL`, `SESSION_SECRET` (obligatoire en prod, default dev fourni)
- Pour les routes admin `/api/tenants` : `SUPERADMIN_TOKEN` (Bearer token de ≥16 chars). Sans ça, ces routes répondent 503. Mécanisme **temporaire**, remplacé par auth nominative + RBAC en PR #8-10.
- Tenancy : `ROOT_DOMAINS` (csv ; default `mybeez-ai.com,localhost`). Tout host ne matchant aucun root est traité comme custom domain et passe par `tenant_domains`.
- Backups R2 : `R2_ENDPOINT`, `R2_BUCKET` (= `r2mybeez`), `R2_PREFIX` (= `mybeezdb/`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_RETENTION_DAYS` (default 30).
- AI : `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` (au moins un pour Alfred)
- Optionnels : `PORT` (default 3000)

**Appel des routes admin** :
```bash
curl -H "Authorization: Bearer <SUPERADMIN_TOKEN>" -X POST https://.../api/tenants \
  -H "Content-Type: application/json" -d '{"name":"...", "slug":"..."}'
```

**Backups Postgres → R2** (`scripts/backup-postgres.ts`, `scripts/restore-postgres.ts`) :
- Pipeline en streaming (constant memory) : `pg_dump --no-owner --no-privileges` | `gzip` | upload multipart vers R2 (`mybeezdb/YYYY-MM-DD/postgres-...sql.gz`).
- Retention auto (default 30 jours, override `BACKUP_RETENTION_DAYS`). Les objets foreign dans le bucket ne sont **jamais** supprimés (parsing strict de la key).
- Cron prévu sur Hetzner via systemd timer (à wirer au moment du déploiement). En attendant, `npm run backup` fonctionne en local pour valider la chaîne.
- **Restore** : `npm run restore` liste les 20 dumps les plus récents. `npm run restore -- latest` ou `npm run restore -- <key>` lance la restore en **dry-run** par défaut. Pour réellement écraser : `RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING npm run restore -- latest`.
- **Ne PAS** confondre R2 avec une DB. R2 = stockage objet, c'est où les dumps atterrissent. Postgres reste sur Hetzner (NVMe local).

---

## 4. Conventions de code détectées

### Backend

- **Modules en classes singletons exportées** : `tenantService`, `authService`, `alfredService`. Pas de DI.
- **Routes** : fonction `register<Module>Routes(app: Express)` exportée, importée dynamiquement dans `server/index.ts` (lazy `await import(...)`).
- **Validation** : un schéma Zod déclaré en haut de fichier de route, utilisé via `schema.parse(req.body)` dans le handler.
- **Erreurs** :
  - Messages utilisateur **en français**.
  - `console.error("[Module] Action error:", err)` puis `res.status(500).json({ error: "Erreur" })`.
  - `error.name === "ZodError"` → 400 avec `details: error.errors`.
- **Logs** : `console.log("[Module] message")`. Pas de logger structuré.
- **Doc** : JSDoc en tête de fichier (rôle du module + résumé). Pas de JSDoc systématique sur les fonctions.

### Frontend

- **Routing** : wouter (pas react-router). `<Route path="/:slug">{(params) => <Page slug={params.slug}/>}</Route>`.
- **Data fetching** : TanStack Query. `queryKey` = path API en array (ex: `["/api/checklist", slug, "categories"]`). `credentials: "include"` partout (cookies de session).
- **Mutations** : `useMutation` + invalidation via `queryClient.invalidateQueries({ queryKey: [base, slug] })`.
- **Composants UI** : Shadcn dans `components/ui/`, helper `cn()` (clsx + tailwind-merge) pour fusionner les classes.
- **Lazy** : pages chargées en `React.lazy` + `Suspense`.
- **Theming** : variables CSS HSL (`--background`, `--primary`, …) + `<alpha-value>` Tailwind. Dark mode via `class`.
- **Testabilité** : `data-testid` sur les éléments interactifs (déjà en place sur la checklist).

### Git

- Commits **Conventional Commits** : `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `cleanup:`, `merge:`.
- Branches existantes : `main`, `copilot/copy-mybeez-app-files`, `copilot/audit-code-frontend-backend-tools`, `copilot/ajouter-des-fichiers`.
- Branche active de référence (replit.md) : `copilot/copy-mybeez-app-files`.
- **Convention pour les nouvelles branches** : `feat/`, `fix/`, `refactor/`, `chore/` (cf. protocole de session).

---

## 5. Zones sensibles / "ne pas toucher sans demander"

1. **`shared/schema/`** — modifier une table = breaking change DB. Toujours `npm run db:push` après. Jamais sans backup en prod.
2. **`server/middleware/tenant.ts` + filtres `tenantId`** — toute requête sans filtre `tenant_id` = fuite trans-tenant. Vérifier toutes les requêtes touchées avant merge.
3. **`server/services/tenantService.ts` (cache)** — cache en mémoire process-local : invalider sur `update`/`create` mais pas en cluster. À traiter avant scale-out.
4. **Sessions / `SESSION_SECRET`** — rotation = déconnecte tout le monde. Demander avant.
5. **Génération `clientCode`** — `Math.random()` avec retry sur collision. Pas crypto-secure mais le code est déjà visible dans l'UI ; ne pas l'utiliser comme secret.

---

## 6. État actuel — checkpoint 2026-05-20

### 🎯 Phase 1 (roadmap option C) — bouclée

**12/12 modules métier production-ready** (backend + UI mergés sur `main`) :

| # | Module | Référence |
|---|---|---|
| 1 | Checklist quotidienne | base produit |
| 2 | Suppliers (Fournisseurs) | PR #2 |
| 3 | Purchases (Achats) + OCR auto-match | PR #64 + #65 + #67 |
| 4 | Expenses (Dépenses générales) | PR #66 |
| 5 | Files (corbeille TTL + send-email-bulk) | PR #71 + #78 + #79 |
| 6 | Employees | PR #72 + #76 |
| 7 | Payroll + OCR bulletins | PR #72 + #76 + #81 |
| 8 | Absences | PR #72 + #76 |
| 9 | BankAccounts + BankEntries | PR #83 + #90 |
| 10 | CashEntries | PR #83 + #90 |
| 11 | Analytics (dashboard + monthly + TVA) | PR #85 + #91 |
| 12 | History cross-module | PR #88 + #92 |

**Sécu / ops sprints 1-7** intégralement livrés :
- MFA TOTP + recovery codes (PR #52)
- RBAC nominatif + lockout par compte + rate-limit IP `/api/auth/*` (PR #53 / #54 / #69)
- Audit log writes (PR #68) + scrub secrets
- Healthcheck Docker + cron systemd backup R2 (PR #70)
- Logger structuré pino + pino-http middleware (PR #82)
- HSTS + CSP strict prod + HIBP k-anonymity (PR #84)
- Prometheus `/metrics` Bearer-gated + Sentry frontend (PR #87)

**Schéma Drizzle** : 25+ tables, multi-tenant single-DB, isolation par filtres `tenant_id` (pas de RLS Postgres).

**Front** : 13 pages, dispatch `/management/:section` couvre tous les modules, sidebar dynamique selon `tenant.modulesEnabled`.

### Reste à faire (court terme)

- **Roadmap option C officiellement bouclée 2026-05-12** (PR #92 UI History mergée). 12/12 modules production-ready. Plus rien sur la roadmap initiale.
- **Sprint 1 absorption REV en cours** (`feat/rev-schema`, 2026-05-20) : schéma 16 tables `rev_*` livré dans `shared/schema/rev/` + CI gate no-Replit (`.github/workflows/no-replit.yml`) + booksystem ch. 05.1.5 / 07 enrichis. ADR `docs/booksystem/adr/2026-05-20-rev-absorption.md` Accepted. Sprints 2-6 (backend, UI Management, app consumer, migration data, go-live) à suivre — cf. ADR §6.
- ~~**PR #94** OCR fix Gemini~~ ✅ Mergée 2026-05-19.
- ~~**Drop SQL définitif** `tenants.pin_code`/`admin_code` + `bank_entries`/`cash_entries` legacy~~ ✅ Exécuté 2026-05-19 via `scripts/migrations/2026-05-19-drop-legacy.sql` (PR #96). DB alignée avec schema TS.
- Smoke prod : `curl https://mybeez-ai.com/api/health`, valider les 12 sections dans un tenant test, surveiller les premières erreurs Sentry / metrics Prometheus.
- **Reboot host Hetzner** à planifier : `*** System restart required ***` sur `65.21.209.102` (kernel update en attente). A causé l'incident 502 docker-proxy crashé du 2026-05-19. Impacte les 3 apps (mybeez + macommande + ulysseclaude) simultanément, fenêtre off-peak.
- **Convention `scripts/migrations/`** désormais établie (cf. `scripts/migrations/README.md`) pour les opérations DDL destructives que `db:push` non-interactif refuse.

### Phase 2 (hors-200%, cf. booksystem §9.7)

Priorités classées :
1. **Stripe billing** + plan limits + trial 14 jours
2. **MFA obligatoire** Owner/Admin + **WebAuthn / passkeys** primary path
3. **Custom domain provisioning automatisé** (Let's Encrypt DNS-01 ou Cloudflare on-demand TLS)
4. **RLS Postgres** (defense in depth, complète les filtres Drizzle)
5. **Module Revenue générique** → débloque TVA collectée + ratios CA-based (food cost %, masse salariale %, marge brute)
6. **Mobile PWA** (manifest + service worker), puis app native plus tard
7. **Intégrations comptables** : export FEC, Pennylane, QuickBooks
8. **SSO** Google / Microsoft pour Owners
9. **Logs persistence** (Loki / Datadog) + Alertmanager
10. **Migrations versionnées** (`drizzle-kit generate` + `migrate`) à la place de `db:push`

### Dette technique reconnue (non-bloquante)

- `AuthSession.tenantId: string` vs `session.tenantId: number` → type incohérent dans middleware/auth.ts.
- `GET /checklist/:slug/history` calcule le total à partir des items actifs aujourd'hui, pas à la date X → biaise les pourcentages historiques.
- `refetchOnWindowFocus + refetchInterval: 30s + SSE` sur la checklist : 3 mécanismes de refresh redondants → garder SSE seul.
- `tenantService` / `templateService` / `alfredService` : caches process-local → bloquant pour multi-noeud (bascule Redis Phase 2).
- FK logiques non contraintes : `items.categoryId`, `checks.itemId`, `purchases.supplierId`, `payroll.employeeId`, `absences.employeeId`, `files.employeeId`, `bank_entries_v2.bankAccountId / purchaseId / expenseId / payrollId` → orphelins possibles. Sprint cleanup futur.
- Sidebar : `/history` reste `moduleSlug: "checklist"` (statut quo, cf. PR #92 description). À revoir si on veut qu'un tenant qui désactive checklist garde l'historique global.

### Limitation Windows

- Le script `dev` utilise `NODE_ENV=development tsx ...` (syntaxe Unix). En PowerShell :
  - `$env:NODE_ENV="development"; npx tsx server/index.ts`
  - ou ajouter `cross-env` aux deps et préfixer `cross-env NODE_ENV=development tsx ...`

### Convention sessions parallèles (depuis 2026-05-11)

Bascule en **git worktree** pour les nouvelles branches plutôt que se battre sur le working tree principal :

```powershell
git worktree add C:\Users\meyer\mybeez-<slug> -b feat/<branch> main
cmd /c mklink /J "C:\Users\meyer\mybeez-<slug>\node_modules" "C:\Users\meyer\mybeez\node_modules"
Set-Location C:\Users\meyer\mybeez-<slug>
# travail + commit + push
# en fin de PR : git worktree remove C:\Users\meyer\mybeez-<slug>
```

Pattern appliqué PR #91 (analytics) et PR #92 (history). Memo dans `feedback_mybeez_parallel_sessions`.

---

## 7. Glossaire métier

| Terme | Définition |
|---|---|
| **Tenant** | Un compte client (peut être restaurant, salon, garage, boutique...). Une row dans `tenants`. |
| **Template** | Un archétype d'activité (restaurant, coiffure, boutique...). Détermine modules, vocabulaire, TVA par défaut. Source de vérité = `server/seed/templates.ts`. |
| **Vertical** | Catégorie top-level de templates : `commerce_de_bouche`, `entreprise_services`, `retail_b2c`. |
| **User** | Une personne réelle (compte nominatif). Une row dans `users`. Cross-tenant : peut être Owner d'un tenant et Manager d'un autre. |
| **Role (tenant role)** | Pouvoir d'un user dans un tenant donné : `owner` > `admin` > `manager` > `staff` > `viewer`. Stocké dans `user_tenants.role`. |
| **Superadmin** | Membre interne myBeez (`users.isSuperadmin = true`), distinct de tout role tenant. À ne pas confondre avec `SUPERADMIN_TOKEN` qui est un Bearer pour les routes admin temporaires. |
| **Slug** | Nom URL-friendly du tenant (ex: `valentine`, `maillane`). Unique. |
| **Client code** | Code à 8 chiffres généré à la création, montré à l'utilisateur. |
| **~~PIN code~~** | ⚠ Retiré (chore/purge-pin-auth). Colonnes `tenants.pin_code`/`admin_code` laissées nullable, plus aucune écriture. Le PIN-on-tablet Phase-2 sera reconstruit comme un per-staff device-paired token. |
| **Checklist** | Liste d'items à cocher chaque jour (par catégorie, par zone). |
| **Item** | Élément individuel d'une checklist (ex: « tomates », « riz basmati »). |
| **Check** | Une coche d'un item à une date donnée. Une row par (tenant, item, date). |
| **Sheet** | Feuille (`Feuil1`, `Feuil2`) — héritage Excel/Google Sheets, regroupement éditorial. |
| **Zone** | Zone physique du restaurant (cuisine, sushi bar, réserve). |
| **Alfred** | Assistant IA conversationnel (chat sur la checklist). |
| **SSE** | Server-Sent Events, canal `/api/:tenant/events` pour la sync temps réel. |
| **Valentine / Val / Maillane** | Restaurants de référence du POC, mentionnés dans le prompt Alfred (à dégénériscer en PR future). |
| **suguval / sugumaillane** | ⚠ Préfixes **legacy** pré-rebrand. Code purgé en PR `chore/cleanup-legacy`, ne devrait plus apparaître ailleurs que dans cette ligne. |

---

## 8. Notes pour Claude (futures sessions)

### Reprise rapide

1. Lire ce CLAUDE.md (§6 checkpoint surtout) puis `docs/booksystem/README.md` (synthèse 30 secondes).
2. `git fetch origin && git status` — vérifier qu'on est sur main à jour.
3. `gh pr list --state open` — voir s'il reste des PRs ouvertes (#92 UI history doit être mergé pour clore la roadmap option C).
4. Sessions parallèles : faire `git worktree list` pour voir ce qui est actif. Toujours créer une nouvelle branche en worktree dédié (cf. §6 convention).
5. Pour reprendre un nouveau chantier : se baser sur la liste **Phase 2** de §6 ou demander à l'utilisateur ce qu'il veut attaquer.

### Règles permanentes

- Avant tout refactor sur une zone du multi-tenant, **vérifier qu'aucune nouvelle requête ne contourne le filtre `tenant_id`**.
- Avant de toucher à un service AI, vérifier la chaîne de fallback dans `services/core/openaiClient.ts`.
- Pour exécuter le serveur en local sur Windows : préfixer `NODE_ENV` via PowerShell (cf. §6).
- Privilégier la **suppression de code mort** plutôt que l'ajout, sauf demande explicite.
- Mettre à jour ce fichier en fin de session si quelque chose de structurel a changé (nouvelle table, nouvelle route majeure, nouveau service, dette résolue).

---

## 9. Déploiement (Hetzner)

**Statut (2026-05-02)** : déployé et accessible sur `https://mybeez-ai.com`. Boot propre, schéma drizzle posté (22+ tables), nginx + CF Origin Cert OK.

**Cible** : Hetzner AX422 `65.21.209.102`, partagé avec macommande, ulyssepro.org et autres apps. Pattern aligné sur macommande.

**Domaine** : `mybeez-ai.com` (Cloudflare, proxy ON, SSL Full strict). DNS apex + wildcard `*.mybeez-ai.com` → host. **Apex sert l'app** (page accueil/signup/login) ; chaque tenant accessible via `<slug>.mybeez-ai.com`. Pas de site marketing séparé pour l'instant.

**Artefacts** (tous dans le repo) :
- `Dockerfile` — multi-stage Node 20 alpine, expose 3000.
- `docker-compose.yml` — 2 services :
  - `app` → build local, port `127.0.0.1:3000:3000`, `env_file: .env.production`, healthcheck Node→`/api/health` (PR #13d).
  - `db` → `postgres:16-alpine`, port `127.0.0.1:5434:5432` (5433 occupé par macommande), volume `pgdata`, healthcheck `pg_isready`.
  - Network bridge `mybeez-net`. Postgres mybeez **isolé** du Postgres host (5432) et de macommande.
- `.env.production.example` — template ; copier en `.env.production` sur le host (jamais committé, ajouté au `.gitignore`).
- `deploy/nginx/mybeez-ai.com.conf` — vhost (apex + wildcard, redirect 80→443, Cloudflare Origin Cert à `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}`, WebSocket/SSE).
- `deploy/deploy.sh` — `git pull` → `docker compose up -d --build` → `npm run db:push` → `nginx reload`.
- `deploy/systemd/mybeez-backup.{service,timer}` + `README.md` — daily backup `/opt/mybeez` → R2 (PR #13d). Install : `sudo cp` les deux dans `/etc/systemd/system/` puis `systemctl enable --now mybeez-backup.timer`.

**Path host** : `/opt/mybeez/` (convention macommande).

**Première mise en place (one-time)** sur le host :
1. `git clone https://github.com/ulyssemdbh-commits/mybeez.git /opt/mybeez`
2. `cp /opt/mybeez/.env.production.example /opt/mybeez/.env.production` puis remplir secrets (`SESSION_SECRET`, `SUPERADMIN_TOKEN`, `POSTGRES_PASSWORD`, `DATABASE_URL` avec le même password, `RESEND_API_KEY`, `R2_*`, AI keys).
3. Poser le Cloudflare Origin Cert : `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}` (apex + wildcard, déjà généré dans le dashboard CF).
4. Symlink vhost : `ln -s /opt/mybeez/deploy/nginx/mybeez-ai.com.conf /etc/nginx/sites-enabled/`.
5. `cd /opt/mybeez && bash deploy/deploy.sh`.

**Re-déploiements** : `cd /opt/mybeez && bash deploy/deploy.sh` (pull + rebuild + push schema + reload nginx).

**Backups** : `npm run backup` (déjà codé), wired en systemd timer (`deploy/systemd/`, PR #13d). Bucket R2 `r2mybeez` préfixe `mybeezdb/`. Schedule : daily 03:15-03:45 host-local (`OnCalendar=*-*-* 03:15:00` + `RandomizedDelaySec=1800`), `Persistent=true` pour catch-up. `BACKUP_RETENTION_DAYS=30` par défaut.

**À ne PAS oublier** :
- `APP_BASE_URL` REQUIRED en prod (sinon le serveur refuse de booter — Host-header injection guard).
- `SESSION_SECRET` REQUIRED en prod (idem).
- Cloudflare SSL mode = **Full (strict)** (pas Flexible) sinon le browser sert mais l'app reçoit du HTTP.
- Le port 3000 est libre côté host (cf. `reference_mybeez_hetzner` mémoire).

**Pièges rencontrés au premier déploiement (résolus, retenir pour les futurs cas)** :
- `import.meta.dirname` n'est PAS polyfill par esbuild en bundle CJS (`--format=cjs`) → undefined au runtime, crash. Si tu en ajoutes ailleurs côté serveur, prévois un fallback compat CJS (PR #18 a basculé `serveStatic()` vers `process.cwd()`).
- Le runner stage du Dockerfile doit copier `drizzle.config.ts` ET `shared/` pour que `npm run db:push` fonctionne dans le container. Sinon `drizzle-kit` cherche `drizzle.config.json` et échoue (PR #19).
- Quand tu édites `.env.production` avec `nano`, **prends garde** de ne pas inclure la commande shell elle-même dans le buffer ; docker compose plante avec `unexpected character in variable name`.

**Reste à faire post-déploiement initial** :
- ✅ ~~Cron systemd timer pour `npm run backup`~~ Wiré en PR #13d (`deploy/systemd/`, à installer sur le host : `cp` + `systemctl enable --now`).
- Compléter `RESEND_API_KEY` quand l'inscription d'un user réel doit recevoir l'email verify.
- Surveiller les logs au premier signup : `docker compose logs -f app`.
