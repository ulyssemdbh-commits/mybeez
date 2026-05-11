# Chapitre 03 — Backend

> **Résumé.** Express 4 strict, ESM TS 5.6, ~25 modules de routes regroupés en
> `auth`, `admin`, `tenants`, `templates`, `onboarding`, `checklist`, `alfred`,
> `management/*`. Middlewares `resolveTenant`, `requireUser`, `requireRole`,
> `requireMfaPending`, `requireSuperadminUser`. Services en singletons :
> tenant, domain, template, alfred, realtime, files, auth, parsing.
> Realtime via SSE custom. AI via fallback chain OpenAI → Gemini → Grok.

---

## 3.1 Bootstrap

Fichier : `server/index.ts`.

### 3.1.1 Ordre d'initialisation

1. **Garde-fous env**
   - `DATABASE_URL` non set → warn.
   - Prod sans `SESSION_SECRET` → `process.exit(1)`.
   - Prod sans `APP_BASE_URL` → `process.exit(1)` (Host-header injection guard).
   - `SUPERADMIN_TOKEN` < 16 chars → warn (routes `/api/tenants/*` répondent 503).
   - `RESEND_API_KEY` absent → warn (emails loggués stdout en dev).
2. **Process hooks** : `uncaughtException`, `unhandledRejection` loggués via `rootLogger.fatal` (PR #82).
3. **Express init**
   - `app.set("trust proxy", 1)` — pour que `req.ip` reflète la vraie IP
     derrière nginx + Cloudflare.
   - `pinoHttp` middleware (PR #82) : génère `req.id` UUID v4 (ou
     réutilise `X-Request-Id` entrant), attache `req.log` enrichi,
     log auto chaque request avec method + url + status + duration.
     Mounted **avant** helmet/session pour capturer toutes les erreurs
     amont. Niveau dérivé : 5xx → error, 4xx → warn, 2xx/3xx → info.
   - **Metrics middleware** (PR #87) : `res.on("finish")` enregistre
     duration dans `http_request_duration_seconds` + incrémente
     `http_requests_total` avec labels `{method, route, status_code}`.
     `route` lit le pattern Express matché pour borner la cardinalité.
   - **`GET /metrics`** (PR #87) : Bearer-token gated (`METRICS_TOKEN`),
     répond 503 si token absent/<16 chars. `timingSafeEqual` sur la
     comparaison. Refresh DB pool + AI gauges juste avant la
     sérialisation. Pas sous `/api/...` → hors rate-limit.
   - `helmet({ contentSecurityPolicy: ... CSP strict prod / HSTS })`
     (PR #84).
   - `compression({ level: 6, threshold: 1024 })`.
   - `cookieParser()`.
   - `express.json({ limit: "10mb" })`.
4. **Session**
   - Store : `connect-pg-simple` sur la table `user_sessions`
     (`createTableIfMissing: true`, prune toutes les 15 min).
   - Cookie : `secure: prod`, `httpOnly`, `sameSite: lax`, `rolling: true`,
     `domain: .mybeez-ai.com` en prod (cross-subdomain).
   - `resave: false`, `saveUninitialized: false`.
5. **Rate limiters**
   - Global API : 120 req/min sur `/api/`.
   - Alfred : 20 req/min sur `/api/alfred/`.
6. **Routes** : `registerRoutes()` (imports dynamiques pour réduire le cold
   start et éviter les cycles).
7. **Health** : `GET /api/health` → uptime, SSE stats, AI provider flags.
8. **Static / SPA fallback** : `serveStatic()` en prod (sert
   `dist/public/`, fallback `index.html`).
9. **Listen** : `0.0.0.0:PORT` (default 3000).

### 3.1.2 Imports dynamiques au registerRoutes()

```
SSE → userAuth → userAuthMfa → tenants → admin → onboarding →
templates → alfred → checklist →
management/{suppliers, template, settings, purchases, expenses, files}
→ scheduleTrashPurge() →
management/{employees, payroll, absences, bankAccounts, bankEntries, cashEntries}
→ /api/health
```

### 3.1.3 Tâches de fond

- `scheduleTrashPurge()` (`services/files/trashService`) : nettoie les rows
  `files_trash` expirées (> 7 jours) à intervalle régulier — démarrée au boot,
  process-local.

---

## 3.2 Routes

### 3.2.1 `userAuth.ts` — Auth nominative

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/user/signup` | ❌ | Argon2id + email verify token + Resend |
| POST | `/api/auth/user/login` | ❌ | Anti-énumération, retourne `{mfaRequired:true}` si MFA actif |
| POST | `/api/auth/user/logout` | ❌ | Clear session.userId |
| GET | `/api/auth/user/me` | requireUser | Renvoie user + memberships |
| POST | `/api/auth/user/verify-email` | ❌ | Consomme token |
| POST | `/api/auth/user/forgot-password` | ❌ | Toujours 202 (anti-énumération) |
| POST | `/api/auth/user/reset-password` | ❌ | Consomme token + set nouveau password |

### 3.2.2 `userAuthMfa.ts` — MFA TOTP

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/auth/user/mfa/status` | requireUser | État (enrolled / confirmed) |
| POST | `/api/auth/user/mfa/setup` | requireUser | Génère secret + QR + 10 recovery codes |
| POST | `/api/auth/user/mfa/confirm` | requireUser | Valide TOTP, marque `confirmedAt` |
| POST | `/api/auth/user/mfa/disable` | requireUser | Re-auth + delete row |
| POST | `/api/auth/user/mfa/challenge` | requireMfaPending | TOTP code → promote pending → full session |
| POST | `/api/auth/user/mfa/recovery` | requireMfaPending | Recovery code single-use |
| POST | `/api/auth/user/mfa/cancel` | ❌ | Clear session mfaPending* keys |

### 3.2.3 `tenants.ts` — Admin Bearer (legacy)

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/tenants` | requireSuperadmin (Bearer) | Création tenant |
| GET | `/api/tenants` | idem | Liste |
| PATCH | `/api/tenants/:id` | idem | Update Zod strict |

Mécanisme **transitoire**, sera retiré au profit des routes `/api/admin/*`.

### 3.2.4 `admin.ts` — Back-office superadmin

| Méthode | Path | Notes |
|---|---|---|
| GET | `/api/admin/stats` | Comptes users + tenants |
| GET/POST/PATCH/DELETE | `/api/admin/users[/...]` | CRUD users + last-superadmin protection |
| POST | `/api/admin/users/:id/send-reset` | Émet token reset + email |
| GET/PATCH/DELETE | `/api/admin/tenants[/...]` | CRUD tenants |
| GET | `/api/admin/tenants/:id/detail` | Tenant + members |
| POST/PATCH/DELETE | `/api/admin/tenants/:id/members[/:userId]` | Gestion équipe |

Toutes gatées par `requireSuperadminUser` (session nominative + `users.isSuperadmin`).

### 3.2.5 `onboarding.ts` — Signup self-serve

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/onboarding/check-slug` | ❌ | Validation format + collision + suggestion |
| POST | `/api/onboarding/signup-with-tenant` | ❌ | Crée user + tenant + lien Owner + auto-login |

### 3.2.6 `templates.ts` — Catalogue verticals

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/templates` | ❌ | Catalog public read-only (4 verticals × 25 sub-templates) |
| GET | `/api/templates/:slug` | ❌ | Détail + enfants |

### 3.2.7 `checklist.ts` — Checklist quotidienne

Toutes les routes derrière `resolveTenant + requireUser + requireRole(...)`
avec matrice rôles depuis PR #53.

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| GET | `/api/checklist/:slug/categories` | tous (READ) | |
| GET | `/api/checklist/:slug/dashboard` | tous (READ) | |
| GET | `/api/checklist/:slug/comments` | tous (READ) | |
| GET | `/api/checklist/:slug/history` | tous (READ) | ⚠️ biais total = items actifs *aujourd'hui* |
| POST | `/api/checklist/:slug/toggle` | owner/admin/manager/staff (STAFF) | Mutation quotidienne |
| POST | `/api/checklist/:slug/comments` | STAFF | |
| POST | `/api/checklist/:slug/reset` | owner/admin/manager (MANAGE) | Reset journée |
| POST/PATCH/DELETE | `/api/checklist/:slug/items[/:id]` | MANAGE | Soft-delete via `isActive` |
| POST | `/api/checklist/:slug/categories` | MANAGE | |

### 3.2.8 `alfred.ts` — IA conversationnelle

URL imbriquée par tenant `:slug`, slug retiré du body, gates auth `requireRole`
(PR #54).

| Méthode | Path | Rôles | Notes |
|---|---|---|---|
| POST | `/api/alfred/:slug/chat` | tous rôles tenant | Prompt + checklist context optionnel |
| POST | `/api/alfred/:slug/analyze` | idem | Analyse de la checklist du jour |
| POST | `/api/alfred/:slug/clear` | idem | Vide l'historique conversation |

### 3.2.9 `management/*` — Modules métier

Toutes mounted at `/api/management/:slug/<module>`, derrière
`resolveTenant + requireUser + requireRole(...)`.

| Module | Path | READ | WRITE | Notes |
|---|---|---|---|---|
| `template.ts` | `/template` | tous tenant rôles | owner/admin | Switch template (refuse top-level, préserve overrides) |
| `settings.ts` | `/settings/{vocabulary,modules}` | tous | owner/admin | Edition vocabulary + toggle `modulesEnabled` |
| `suppliers.ts` | `/suppliers` | tous | owner/admin/manager | Soft-delete `isActive` |
| `purchases.ts` | `/purchases` + `/purchases/parse-invoice` + stats | tous | owner/admin/manager | OCR Vision API + auto-match supplier (PRs #65/#67) |
| `expenses.ts` | `/expenses` + stats | tous | owner/admin/manager | Charges générales (URSSAF, EDF, …) |
| `files.ts` | `/files` + `/trash` + `/send-email-bulk` | tous | owner/admin/manager | Upload R2 (multer 50MB) + corbeille TTL 7j + `files.employeeId` link RH (PR #71 backend + PR #78 UI) + hook V2 send-email-bulk Resend N attachments cap 25 MB (PR #79) |
| `employees.ts` | `/employees` + `/employees/summary` | tous | owner/admin/manager | CRUD + endpoint stats dashboard RH (effectif, masse salariale, alertes, totaux période) (PR #72) |
| `payroll.ts` | `/payroll` (?period=YYYY-MM&employeeId=N) + `/import-pdf` + `/reparse-all` | tous | owner/admin/manager | UNIQUE(tenant,employee,month) → 409 si duplicate. `pdfFileId` FK files.id archive bulletin. Hooks OCR PR #81 : `import-pdf` (Vision API + matchEmployee + upload R2 + insert files+payroll en transaction) et `reparse-all` (cap 50/run, scan files RH non liés). |
| `absences.ts` | `/absences` (?employeeId=N&from=&to=) | tous | owner/admin/manager | type enum [conge\|maladie\|retard\|absence\|formation], `isApproved` = signal "Alertes" RH (PR #72) |
| `bankAccounts.ts` | `/bank-accounts` | tous | owner/admin/manager | CRUD + soft-delete `isActive`. Detail GET retourne `{account, balance}` avec `currentBalance = openingBalance + Σ(entries.amount)` calculé via `computeBankAccountBalance` (PR #83) |
| `bankEntries.ts` | `/bank-entries` + `/stats` + `/unreconciled` | tous | owner/admin/manager | Hard-delete (audit trace). Amount **signé** (négatif=débit). FK logiques optionnelles `purchaseId`/`expenseId`/`payrollId` pour rapprochement. Filtres `from`,`to`,`accountId`,`category`,`reconciled`. Cross-tenant guard sur `bankAccountId` au create/update. (PR #83) |
| `cashEntries.ts` | `/cash-entries` + `/stats` | tous | owner/admin/manager | Hard-delete. Amount **toujours positif**, sens via `kind` ('in'\|'out'). Générique (pas de colonnes resto-spécifiques). (PR #83) |
| `analytics.ts` | `/analytics/dashboard` + `/monthly` + `/tva` | tous | — (read-only) | Compute on-demand depuis purchases/expenses/payroll/bank/cash. Période = mois courant par défaut. Top fournisseurs, payment status mix, séries mensuelles signées, TVA déductible (collectée=null V1, requires future revenue table). (PR #85) |

### 3.2.10 SSE — Realtime

| Méthode | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/:slug/events` | resolveTenant + requireUser + requireRole(tous) | EventSource, keepalive 30s |

---

## 3.3 Middleware

Fichier : `server/middleware/`.

| Fichier | Exports | Rôle |
|---|---|---|
| `tenant.ts` | `resolveTenant` | Attache `req.tenantId` (hostname-first, fallback `:slug`) |
| `auth.ts` | `requireUser` | Session nominative présente |
| `auth.ts` | `requireRole(...allowed)` | Lookup `user_tenants.role`, valide vs liste autorisée |
| `auth.ts` | `requireSuperadminUser` | Nominatif + `users.isSuperadmin = true` |
| `auth.ts` | `requireMfaPending` | Session half-baked post-password (TTL 5 min) |
| `auth.ts` | `requireSuperadmin` | Bearer token timing-safe (legacy `/api/tenants/*`) |
| `auth.ts` | `getUserSession`, `getMfaPending`, `clearMfaPending` | Helpers session |

> **Auth PIN purgée en PR #55** : les middlewares `requireAuth`,
> `requireAdmin`, `requireTenantAuth`, `getAuthSession`, `getSessionToken`, et
> le type `AuthSession` ont été supprimés. Plus aucune coexistence dette.

---

## 3.4 Services

Fichier : `server/services/`.

### 3.4.1 Tableau récapitulatif

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
| `auth/mailService` | Resend client + templates verify/reset + bundle documents (`sendDocumentBundle` avec attachments, consommé par `/files/send-email-bulk` PR #79), fail-soft | — | ✓ (verify/reset uniquement) |
| `auth/auditService` | `recordAudit({req, event, metadata})` fail-soft + scrub secrets récursif (password/token/secret/totpCode/recoveryCode/imageBase64...) avec normalisation case/underscore/dash, profondeur max 4, troncature 500 chars (PR #68) | — | ✓ |
| `auth/lockoutService` | Lockout par compte dérivé d'`audit_log`. `computeLockout(failures, now)` pure (testable). `checkLockout(userId)` fail-soft DB. Seuil 5 / fenêtre 15 min. Wired sur `/login`, `/mfa/challenge`, `/mfa/recovery` AVANT `verifyPassword` (anti-DoS argon2id). (PR #69) | — | ✓ |
| `auth/hibpService` | `isPasswordPwned(plain)` k-anonymity sur api.pwnedpasswords.com (SHA-1 prefix 5 chars envoyé seul, suffix matché localement). `suffixIsPwned(body, suffix)` pure pour tests. Soft-fail sur API down. `HIBP_DISABLED=true` pour bypass complet. Wired par `passwordService.hashPassword({checkPwned:true})` (PR #84). | — | ✓ |
| `parsing/invoiceParser` | OCR Vision API (image + PDF) → champs facture + matchSupplierByName | — | ✓ |
| `parsing/payslipParser` | OCR Vision API (image + PDF) → champs bulletin de paie. Réutilise `validateBase64Image` + `stripCodeFence` + MIME types d'`invoiceParser`. PDF via Gemini natif (PR #81). | — | ✓ |
| `payroll/payrollImport` | Helpers purs : `payslipImportEligibility`, `buildPayrollValues`, `buildEmployeeValues`, `summarizeImportWarnings`. Consommés par les routes `/payroll/import-pdf` + `/reparse-all` (PR #81). | — | ✓ Pure |
| `files/naming` | Sanitisation noms + storage key R2 (`files/<tenantId>/<storedName>`, séparé du préfixe `mybeezdb/` backups) | — | ✓ Pure |
| `files/storage` | upload/download(stream + buffer)/delete vers R2 (S3 multipart). Client S3 caché lazy. delete fail-soft. `downloadFileBufferFromStorage` ajouté PR #79 (consommé par `send-email-bulk` pour les attachments Resend). | — | ✓ |
| `files/trashService` | `computeExpiresAt`/`isExpired` purs. `purgeExpiredTrash` cascade R2 + DB. `scheduleTrashPurge` boot+1h, `unref()` pour ne pas bloquer event loop. TTL 7j. | — | ✓ (job tick local) |
| `hr/employeeMatching` | `matchEmployee(parsed, candidates)` 3-tiers SSN > nom exact (+ permutation) > fuzzy. Normalisation NFD + strip diacritics. Pure. Sera consommé par V2 `import-PDF` bulletin. (PR #72) | — | ✓ Pure |
| `hr/payrollSummary` | `computePayrollSummary(emps, payrolls, absences, employerChargeRate?)` agrégats dashboard RH (effectif actif, masse salariale, totaux brut/net/charges, estimation employer charges default 13%, ratio social, alertes). Flag `hasEstimatedEmployerCharges`. (PR #72) | — | ✓ Pure |
| `lib/logger` | pino factory : `rootLogger` + `moduleLogger(name)` child. JSON prod / `pino-pretty` dev, `LOG_LEVEL` env, redact secrets. Consommé par tous les routes/services (PR #82). | — | ✓ |
| `finance/financeSummary` | Helpers purs : `computeBankAccountBalance`, `computeBankStats`, `computeCashStats`. Round-to-cent. Consommés par les routes `/bank-accounts/:id`, `/bank-entries/stats`, `/cash-entries/stats`. (PR #83) | — | ✓ Pure |
| `analytics/analyticsSummary` | Helpers purs : `monthsInRange`, `bucketMonth`, `sumField`, `bucketSumByMonth`, `topByGroup`, `countByGroup`. Compute on-demand pour dashboard / monthly / TVA. Pas de cache, table `analytics` reste libre pour Phase 2. (PR #85) | — | ✓ Pure |
| `observability/metrics` | Prometheus registry + http duration histogram + counters + DB pool gauges + AI provider gauges + default Node.js collectors. `routeLabel(req)` lit le pattern Express → cardinalité bornée. `metricsBearerToken()` lit `METRICS_TOKEN` env (≥16 chars). (PR #87) | — | ✓ Process-local (prom-client est par-process, multi-noeud = agréger côté Prometheus) |

### 3.4.2 Convention `recordAudit`

```ts
recordAudit({
  req,
  event: "purchases.created",
  metadata: { purchaseId, supplierId, totalTtc },
});
```

- **Fail-soft** : un échec DB ne casse jamais la requête utilisateur. Try/catch
  + `console.error`.
- **Scrub** : la `metadata` est nettoyée (passwords, tokens, secrets MFA jamais
  persistés, même par accident).
- **Convention `event`** : `domain.action.outcome` en kebab-case par segment.
  Exemples : `auth.login.success`, `auth.login.failure`, `mfa.disabled`,
  `purchases.created`, `tenant.role.changed`.

### 3.4.3 Caches in-memory — risque cluster

> **Risque scale-out.** Trois caches sont actuellement process-local
> (`tenantService`, `templateService`, `alfredService`). Une mutation sur le
> noeud A n'invalidera pas le cache du noeud B. Bloquant pour multi-noeud sans
> Redis. À traiter avant de scaler horizontalement.

---

## 3.5 Realtime / SSE

Fichier : `server/services/realtimeSync.ts`.

### 3.5.1 Endpoint

`GET /api/:slug/events`
- Headers : `text/event-stream`, `X-Accel-Buffering: no` (pour Cloudflare),
  `Cache-Control: no-cache`.
- Auth : `resolveTenant + requireUser + requireRole(tous rôles)`.
- Keepalive : 30s.

### 3.5.2 Émetteurs

Fonction `emitChecklistUpdated(tenantId)` appelée après mutations dans
`routes/checklist.ts` (toggle, reset, items, categories, comments).

Payload : `{ type: "checklist_updated", timestamp }`.

### 3.5.3 Client

`client/src/hooks/useRealtimeSync.ts` :
- Ouvre un EventSource sur `/api/:slug/events`.
- Sur `checklist_updated` → invalide les query keys checklist côté TanStack
  Query.

### 3.5.4 Limitation connue

Sur la checklist, **3 mécanismes de refresh redondants** coexistent :
`refetchOnWindowFocus: true` + `refetchInterval: 30s` + SSE. À rationaliser
(garder SSE seul + manual invalidation sur mutations).

---

## 3.6 Alfred (IA)

Fichier : `server/services/alfred/`.

### 3.6.1 Provider chain

`server/services/core/openaiClient.ts` factory :

| Priorité | Modèle | Env var |
|---|---|---|
| 1 | OpenAI `gpt-4o-mini` | `OPENAI_API_KEY` |
| 2 | Gemini `gemini-2.0-flash` | `GEMINI_API_KEY` |
| 3 | Grok `grok-3-mini` | `XAI_API_KEY` |
| Fallback | Réponse texte générique | — |

Le premier provider configuré gagne. Si la requête échoue, fallback automatique
vers le suivant.

### 3.6.2 System prompt vocabulary-neutral

`server/services/alfred/prompt.ts` exporte `buildSystemPrompt(tenant)`. Il lit
`tenant.vocabulary` (clés `item`, `checklist`, `customer`, …) et compose un
prompt sans hardcoder le métier. Plus aucune mention « Valentine », « Maillane »,
« Sushi Bar » depuis PR antérieure.

### 3.6.3 Contexte runtime

Le handler `/chat` injecte la checklist du jour (total/checked/uncheckedItems)
dans le contexte conversation. Permet à Alfred de répondre « il vous reste 4
items à vérifier ce matin ».

### 3.6.4 History

Stockée en mémoire par tenant slug, 20 derniers messages. ⚠️ Perdue au
redéploiement. Persistence DB envisagée Phase 2.

---

## 3.7 OCR / parsing factures

Fichier : `server/services/parsing/invoiceParser.ts`.

### 3.7.1 Flow

1. Le frontend `PurchasesSection` upload une image ou un PDF de facture.
2. `POST /api/management/:slug/purchases/parse-invoice` (PR #65, PDF support
   PR #67) reçoit le base64.
3. Validation MIME : JPEG, PNG, WebP, PDF.
4. Vision API (OpenAI gpt-4o-mini) extrait : `supplierName`, `invoiceNumber`,
   `invoiceDate`, `totalHt`, `totalTtc`, `tvaRate`, `tvaAmount`, `dueDate`.
5. **Auto-match supplier** (PR #67) : `matchSupplierByName(extractedName,
   tenantId)` interroge la table `suppliers` du tenant pour proposer un
   `supplierId` et pré-remplir.
6. Le frontend pré-remplit le formulaire de création purchase, l'utilisateur
   ajuste et confirme.

### 3.7.2 Résilience

- Si Vision API échoue → 502 avec message FR.
- Si aucun supplier ne matche → champ libre `supplierName` (l'utilisateur peut
  créer le fournisseur après).

---

## 3.8 Tests backend

Fichier : `server/__tests__/`, `server/middleware/__tests__/`,
`server/services/auth/__tests__/`, etc.

| Test | Couverture |
|---|---|
| `smoke.test.ts` | Boot Express OK |
| `middleware/auth.test.ts` | requireUser, requireSuperadminUser, requireSuperadmin (Bearer) |
| `middleware/mfaPending.test.ts` | TTL session, gating challenge |
| `middleware/requireUserAndRole.test.ts` | Matrice rôles |
| `services/domainService.test.ts` | Résolution host + cache TTL |
| `services/auth/{passwordService,tokenService,mailService,mfaService,auditService}.test.ts` | Crypto + tokens + Resend fail-soft + audit scrub |
| `services/alfred/alfredService.test.ts` | History capping, prompt construction |
| `services/parsing/invoiceParser.test.ts` | Extract champs + matchSupplierByName |
| `services/parsing/payslipParser.test.ts` | Validation Zod du `PayslipFieldsSchema` |
| `services/payroll/payrollImport.test.ts` | Helpers purs eligibility + buildPayrollValues + buildEmployeeValues + warnings (PR #81) |
| `lib/logger.test.ts` | Smoke pino : levels, child bindings, level inheritance, redact compile (PR #82) |
| `services/finance/financeSummary.test.ts` | computeBankAccountBalance + computeBankStats + computeCashStats : zeros, signed sum, defense-in-depth, round-to-cent (PR #83) |
| `services/auth/hibpService.test.ts` | k-anonymity SHA-1 prefix only, suffixIsPwned parsing, soft-fail réseau / non-2xx, HIBP_DISABLED override (PR #84) |
| `services/analytics/analyticsSummary.test.ts` | monthsInRange + bucketMonth + sumField + bucketSumByMonth + topByGroup + countByGroup : 23 cas (round-to-cent, year crossover, defense in depth NaN/Infinity, top stable sort, etc.) (PR #85) |
| `services/observability/metrics.test.ts` | routeLabel + metricsBearerToken + registry smoke (default + custom collectors présents, content-type Prometheus) (PR #87) |
| `services/files/{naming,trashService}.test.ts` | Sanitisation + TTL purge |
| `seed/templates.test.ts` | Catalog richness + presentation invariants |

> **Non couvert.** Routes API en intégration, isolation tenant cross-table, SSE
> end-to-end. Tests intégration prévus dans une PR ultérieure.

---

*Suite du livre → [04-frontend.md](./04-frontend.md)*
