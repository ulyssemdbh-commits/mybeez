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
│   │   ├── tenant.ts               # resolveTenant(req.params.slug) → req.tenant + req.tenantId
│   │   └── auth.ts                 # requireAuth, requireAdmin, getAuthSession
│   ├── routes/
│   │   ├── auth.ts                 # /api/auth/{pin-login, logout, me}
│   │   ├── tenants.ts              # /api/tenants — ⚠ AUCUNE AUTH
│   │   ├── checklist.ts            # /api/checklist/:slug/* — toutes scopées par tenant
│   │   └── alfred.ts               # /api/alfred/{chat, analyze, clear}
│   └── services/
│       ├── tenantService.ts        # CRUD tenants + cache mémoire + génération clientCode 8 chiffres
│       ├── auth.ts                 # délègue à tenantService.loginWithPin
│       ├── realtimeSync.ts         # SSE par tenant + emitChecklistUpdated()
│       ├── alfred/alfredService.ts # Chat AI avec historique en mémoire par tenant
│       └── core/openaiClient.ts    # Factory provider AI (OpenAI > Gemini > Grok)
└── shared/           # Types et schémas partagés (back ↔ front)
    ├── schema.ts                   # re-export tenants + checklist
    └── schema/
        ├── tenants.ts              # table tenants (multi-tenant root)
        └── checklist.ts            # categories, items, checks, futureItems, emailLogs, comments,
                                    # suppliers, purchases, generalExpenses, files, bankEntries,
                                    # cashEntries, employees, payroll, absences, analytics
```

### Aliases TS / Vite

| Alias | Cible |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

### Pattern multi-tenant

- **Single DB, single schema** : toutes les tables business ont une colonne `tenant_id` (integer, FK logique vers `tenants.id`).
- **Aucune RLS PostgreSQL** : l'isolation est garantie uniquement par les `where(eq(table.tenantId, tid))` côté Drizzle. Toute requête manquant ce filtre = fuite trans-tenant.
- **Résolution** : middleware `resolveTenant` lit `req.params.slug`, charge le tenant (avec cache `tenantService.cache`), peuple `req.tenant` + `req.tenantId`.
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

**Variables d'env** (voir aussi `replit.md`) :
- Requis : `DATABASE_URL`, `SESSION_SECRET` (obligatoire en prod, default dev fourni)
- AI : `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` (au moins un pour Alfred)
- Optionnels : `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `GOOGLE_CALENDAR_ID`, `PORT` (default 3000)

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

### Sécurité — à corriger
- 🔴 **`POST/GET/PATCH /api/tenants` n'ont aucune auth.** N'importe qui peut créer un tenant, lister tous les tenants, ou modifier un tenant existant (y compris ses PIN). À protéger avec un mécanisme superadmin avant prod.
- 🟠 **`POST /api/checklist/:slug/toggle` n'exige pas `requireTenantAuth`.** Un anonyme connaissant un slug peut cocher/décocher des items. Voir `server/routes/checklist.ts:101`.
- 🟠 **`PATCH /api/tenants/:id`** accepte un `req.body` brut (pas de Zod) et passe à `tenantService.update`. Risque de mise à jour de champs non prévus (clientCode, isActive, …).
- 🟡 **`SESSION_SECRET` default dev** présent en clair dans `server/index.ts:50`. OK pour dev, fatal en prod (mais le code refuse de booter en prod sans secret — bonne pratique conservée).
- 🟡 **Pas de CSRF token** sur les mutations alors que le cookie de session est utilisé. Mitigations en place : `sameSite: lax` + `httpOnly`.

### Dette technique
- **`AuthSession.tenantId: string`** (middleware/auth.ts) vs `session.tenantId = result.tenant.id` (number, route auth.ts) — type incohérent. Voir aussi la comparaison `session.tenantId !== req.tenantId` dans checklist.ts.
- **`requireTenantAuth`** est dupliqué inline dans `checklist.ts` au lieu d'être dans `middleware/auth.ts`.
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
| **Tenant** | Un restaurant client. Une row dans la table `tenants`. |
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
