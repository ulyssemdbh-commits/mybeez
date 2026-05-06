# CLAUDE.md — myBeez

> Document d'onboarding pour Claude / tout nouveau contributeur.
> À mettre à jour à la fin de chaque session significative.

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
│       ├── pages/                  # TenantChecklist (le seul implémenté), TenantAdmin/History/Management = stubs
│       ├── components/
│       │   ├── ui/                 # Shadcn générés (button, card, input, dialog, …)
│       │   ├── alfred/AlfredChat.tsx
│       │   ├── ErrorBoundary.tsx, SkipLink.tsx, theme-provider.tsx
│       ├── hooks/                  # use-auth, use-toast, useRealtimeSync
│       ├── lib/                    # queryClient.ts (apiRequest + getQueryFn), utils.ts (cn helper)
│       └── index.css
├── server/           # Express
│   ├── index.ts                    # Bootstrap : helmet, compression, session, rate-limit, register routes, SPA fallback
│   ├── db.ts                       # Pool pg + drizzle(pool, { schema })
│   ├── middleware/
│   │   ├── tenant.ts               # resolveTenant: hostname-first (subdomain ou custom domain), fallback :slug
│   │   └── auth.ts                 # PIN: requireAuth/requireAdmin/requireTenantAuth ; nominative: requireUser/requireRole(...) ; legacy: requireSuperadmin (Bearer token)
│   ├── routes/
│   │   ├── auth.ts                 # /api/auth/{pin-login, logout, me}  (legacy PIN)
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
│   │   ├── auth.ts                 # délègue à tenantService.loginWithPin (legacy PIN)
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
- **Auth de session** vs **scope tenant** : la session contient `session.tenantId` (numérique). Pour les routes mutantes, comparer `session.tenantId === req.tenantId` (voir `requireTenantAuth` dans `routes/checklist.ts`).

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
  -H "Content-Type: application/json" -d '{"name":"...", "pinCode":"...", "adminCode":"..."}'
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

## 6. État actuel — chantiers ouverts & dette technique

### Chantiers en cours / pages stub
- `TenantAdmin`, `TenantHistory`, `TenantManagement` ne sont que des placeholders « en cours de développement ».
- Beaucoup de tables business (suppliers, purchases, employees, payroll, absences, files, bank/cashEntries, analytics) **sont schématisées mais sans routes API ni UI**. Le seul module fonctionnel end-to-end est la **checklist quotidienne**.
- **Migration restaurant → SaaS générique en cours** :
  - ✅ Catalogue `business_templates` + API publique (PR #9)
  - ✅ `tenants.templateId/vocabulary/modulesEnabled` ajoutés (PR #10a). `businessType` et `features` deprecated, conservés pour compat tant que `templateId` est nullable.
  - ✅ Colonnes `items.nameVi/nameTh` et `categories.nameVi/nameTh` supprimées (purge restaurant-ism : c'était spécifique à un Sushi Bar).
  - ✅ Alfred prompt dégénéricisé : nom du tenant + vocabulary dynamiques, plus de Valentine/Maillane/Sushi hardcodés.
  - ✅ Schéma auth (PR #11) : `users`, `user_tenants` (M2M avec role), `password_reset_tokens`, `email_verification_tokens`, `mfa_secrets`, `audit_log`. Session store basculé vers Postgres (`connect-pg-simple` → table `user_sessions` créée auto).
  - ✅ Auth nominative email/password (PR #12) : argon2id, routes `/api/auth/user/*`, middleware `requireUser` + `requireRole(...)`, mailService Resend (fail-soft dev), page `/auth/login` minimale. PIN auth coexiste pendant la migration.
  - ✅ MFA TOTP (PR #13a) : `mfaService` (otplib, RFC 6238, drift ±30s), routes `/api/auth/user/mfa/{status,setup,confirm,disable,challenge,recovery,cancel}`, gate sur `/login` (retourne `{mfaRequired:true}`, session `mfaPending*` TTL 5 min), 10 recovery codes XXXX-XXXX-XXXX (sha-256, single-use), page `/auth/security` (QR + recovery codes affichés une fois).
  - ✅ Routes **checklist** + **SSE** migrées vers `requireUser` + `requireRole(...)` strict avec matrice rôles (lecture = tous rôles, ops quotidiennes = staff+, gestion structurelle = manager+). `requireTenantAuth` n'a plus de caller en runtime — purge prévue avec PIN auth.
  - ✅ Routes **Alfred** : `/api/alfred/:slug/{chat,analyze,clear}` derrière `resolveTenant` + `requireUser` + `requireRole(...)` (any tenant role). `tenantId` retiré du body, slug pris dans l'URL. Front (`AlfredChat`) renomme la prop en `tenantSlug` et appelle l'URL slug-scopée.
  - ⏳ **Reste** : audit log writes + rate limit/lockout (PR #13b), purge PIN auth (route `auth.ts`, `requireAuth`/`requireAdmin`/`requireTenantAuth`, `services/auth.ts`, hook front `use-auth.ts`, colonnes `tenants.pinCode`/`adminCode`), passer `tenant.templateId` en NOT NULL et droper `businessType`.

### Sécurité — à corriger
- ✅ ~~**`POST/GET/PATCH /api/tenants` n'ont aucune auth.**~~ Protégées via `requireSuperadmin` (Bearer + `SUPERADMIN_TOKEN`). Mécanisme **temporaire** jusqu'à l'auth nominative complète (PR #8-10).
- ✅ ~~**Endpoint `/api/tenants/by-code/:code`**~~ supprimé (retournait le tenant complet incluant PIN/admin codes ; client code à 8 chiffres = brute-forçable).
- ✅ ~~**`PATCH /api/tenants/:id`** accepte un `req.body` brut~~ → schéma Zod strict, champs autorisés explicitement listés.
- ✅ ~~**`POST /api/checklist/:slug/toggle` n'exige pas `requireTenantAuth`.**~~ Gatée. Idem pour `POST /api/checklist/:slug/comments` (deuxième mutation non documentée comme trou, fixée dans la même PR).
- 🟡 **`SESSION_SECRET` default dev** présent en clair dans `server/index.ts`. OK pour dev, fatal en prod (mais le code refuse de booter en prod sans secret — bonne pratique conservée).
- 🟡 **Pas de CSRF token** sur les mutations alors que le cookie de session est utilisé. Mitigations en place : `sameSite: lax` + `httpOnly`.

### Dette technique
- **`AuthSession.tenantId: string`** (middleware/auth.ts) vs `session.tenantId = result.tenant.id` (number, route auth.ts) — type incohérent. Voir aussi la comparaison `session.tenantId !== req.tenantId` dans checklist.ts.
- ✅ ~~**Routes Alfred** : reçoivent `tenantId` dans le body~~ Refactorées pour passer par `/api/alfred/:slug/*` + `resolveTenant` + `requireUser` + `requireRole(...)`. Le service `alfredService` continue de prendre un slug en argument interne (analyze appelle chat).
- ✅ ~~`requireTenantAuth` dupliqué inline dans `checklist.ts`~~ — déplacé dans `server/middleware/auth.ts`, importé là où nécessaire, couvert par `requireTenantAuth.test.ts` (6 tests).
- **Route `GET /history`** : `byDate[date].total = allItems.length` calcule le total avec les items actifs **aujourd'hui**, pas à la date X — biaise les pourcentages historiques si la liste d'items évolue.
- **Aucun test, aucune CI** — toute régression doit être détectée à la main.
- **`refetchOnWindowFocus: true` + `refetchInterval: 30000`** sur la checklist : beaucoup de fetchs alors qu'on a déjà du SSE branché. Choisir un seul mécanisme.

### Limitation Windows
- Le script `dev` utilise `NODE_ENV=development tsx ...` (syntaxe Unix). En PowerShell, lancer plutôt :
  - `$env:NODE_ENV="development"; npx tsx server/index.ts`
  - ou ajouter `cross-env` aux deps et préfixer `cross-env NODE_ENV=development tsx ...`

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
| **PIN code** | Code staff (4–8 chiffres) — accès checklist quotidienne. |
| **Admin code** | Code admin (4–8 chiffres) — accès reset, gestion items, etc. |
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

- **Toujours lire ce fichier en début de session.** Le mettre à jour en fin de session si quelque chose de structurel a changé (nouvelle table, nouvelle route majeure, nouveau service, dette résolue).
- Avant tout refactor sur une zone du multi-tenant, **vérifier qu'aucune nouvelle requête ne contourne le filtre `tenant_id`**.
- Avant de toucher à un service AI, vérifier la chaîne de fallback dans `services/core/openaiClient.ts`.
- Pour exécuter le serveur en local sur Windows : préfixer `NODE_ENV` via PowerShell (cf. §6).
- Privilégier la **suppression de code mort** (services orphelins, `emitSugu*` legacy) plutôt que l'ajout, sauf demande explicite.

---

## 9. Déploiement (Hetzner)

**Statut (2026-05-02)** : déployé et accessible sur `https://mybeez-ai.com`. Boot propre, schéma drizzle posté (22+ tables), nginx + CF Origin Cert OK.

**Cible** : Hetzner AX422 `65.21.209.102`, partagé avec macommande, ulyssepro.org et autres apps. Pattern aligné sur macommande.

**Domaine** : `mybeez-ai.com` (Cloudflare, proxy ON, SSL Full strict). DNS apex + wildcard `*.mybeez-ai.com` → host. **Apex sert l'app** (page accueil/signup/login) ; chaque tenant accessible via `<slug>.mybeez-ai.com`. Pas de site marketing séparé pour l'instant.

**Artefacts** (tous dans le repo) :
- `Dockerfile` — multi-stage Node 20 alpine, expose 3000.
- `docker-compose.yml` — 2 services :
  - `app` → build local, port `127.0.0.1:3000:3000`, `env_file: .env.production`.
  - `db` → `postgres:16-alpine`, port `127.0.0.1:5434:5432` (5433 occupé par macommande), volume `pgdata`, healthcheck `pg_isready`.
  - Network bridge `mybeez-net`. Postgres mybeez **isolé** du Postgres host (5432) et de macommande.
- `.env.production.example` — template ; copier en `.env.production` sur le host (jamais committé, ajouté au `.gitignore`).
- `deploy/nginx/mybeez-ai.com.conf` — vhost (apex + wildcard, redirect 80→443, Cloudflare Origin Cert à `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}`, WebSocket/SSE).
- `deploy/deploy.sh` — `git pull` → `docker compose up -d --build` → `npm run db:push` → `nginx reload`.

**Path host** : `/opt/mybeez/` (convention macommande).

**Première mise en place (one-time)** sur le host :
1. `git clone https://github.com/ulyssemdbh-commits/mybeez.git /opt/mybeez`
2. `cp /opt/mybeez/.env.production.example /opt/mybeez/.env.production` puis remplir secrets (`SESSION_SECRET`, `SUPERADMIN_TOKEN`, `POSTGRES_PASSWORD`, `DATABASE_URL` avec le même password, `RESEND_API_KEY`, `R2_*`, AI keys).
3. Poser le Cloudflare Origin Cert : `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}` (apex + wildcard, déjà généré dans le dashboard CF).
4. Symlink vhost : `ln -s /opt/mybeez/deploy/nginx/mybeez-ai.com.conf /etc/nginx/sites-enabled/`.
5. `cd /opt/mybeez && bash deploy/deploy.sh`.

**Re-déploiements** : `cd /opt/mybeez && bash deploy/deploy.sh` (pull + rebuild + push schema + reload nginx).

**Backups** : `npm run backup` (déjà codé) à wirer en cron systemd timer une fois la prod stable. Bucket R2 `r2mybeez` préfixe `mybeezdb/`.

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
- Cron systemd timer pour `npm run backup` (backups Postgres → R2).
- Compléter `RESEND_API_KEY` quand l'inscription d'un user réel doit recevoir l'email verify.
- Surveiller les logs au premier signup : `docker compose logs -f app`.
