# Chapitre 05 — Données et multi-tenant

> **Résumé.** Postgres 16 single-DB single-schema. Multi-tenant garanti par
> filtre Drizzle `where(eq(table.tenantId, tid))` sur chaque requête (pas de
> RLS Postgres). 41+ tables (25+ socle + 16 module REV cashback, Sprint 1
> 2026-05-20) : identité cross-tenant, business tenant-scoped, catalogue
> templates, custom domains, tokens, MFA, audit, plus le module REV
> (`rev_consumers` global + 15 tables `rev_*` tenant-scopées).
> Migrations via `drizzle-kit push` (pas d'historique versionné). Caches
> process-local sur 4 services (risque scale-out).

---

## 5.1 Tables — vue d'ensemble

### 5.1.1 Identité / cross-tenant

Fichier : `shared/schema/users.ts`.

| Table | PK | Notes |
|---|---|---|
| `users` | id serial | `email` UNIQUE (lowercase appliqué côté app), `isSuperadmin`, `isActive`, `lastLoginAt`, `adminNotes`. Cross-tenant. |
| `user_tenants` | (userId, tenantId) | M2M role. FK cascade vers users + tenants. Index `tenantId`. `invitedAt`, `acceptedAt`, `invitedByUserId`. |
| `password_reset_tokens` | id serial | Hash SHA-256, TTL via `expiresAt`, single-use via `usedAt`. |
| `email_verification_tokens` | id serial | Idem reset. |
| `mfa_secrets` | id serial | TOTP base32 + recovery codes hash sha-256. UNIQUE userId. |
| `audit_log` | id serial | event, metadata jsonb, IP, UA. **Writes branchées en PR #13b** (Sprint 2). |
| `user_sessions` | sid varchar | Géré par connect-pg-simple (déclaré dans le schema pour que `db:push` ne le drop pas). |

### 5.1.2 Catalogue + tenancy

Fichier : `shared/schema/tenants.ts`, `templates.ts`, `domains.ts`.

| Table | PK | Notes |
|---|---|---|
| `tenants` | id serial | `slug` UNIQUE, `clientCode` UNIQUE 8 chiffres, FK `templateId`, `vocabulary` jsonb, `modulesEnabled` jsonb. ~~`pinCode`/`adminCode`~~ dropées 2026-05-19 (PR #96, script SQL manuel, après nullable PR #55). |
| `business_templates` | id serial | Catalogue verticals. Self-FK `parentId` (2 niveaux : top/sub). 4 verticals × 25 sub-templates. Champs présentation : `icon`, `tagline`, `idealFor`, `coverGradient`, `featuresHighlight`, `notIncluded`. Champs config : `modules`, `defaultCategories`, `vocabulary`, `taxRules`. |
| `tenant_domains` | id serial | `hostname` UNIQUE, FK cascade tenants, `verifiedAt`, `sslStatus`. Index (hostname, tenantId). |

### 5.1.3 Tenant-scoped — checklist

Fichier : `shared/schema/checklist.ts`. Toutes ont `tenantId integer notnull`.

| Table | Soft delete | Particularités | FK manquantes ⚠️ |
|---|---|---|---|
| `categories` | — | `sheet`, `zone`, `sortOrder` | — |
| `items` | `isActive` | `categoryId` | **categoryId non FK** |
| `checks` | — | `itemId`, `checkDate` texte (YYYY-MM-DD), `isChecked`, `note` | **itemId non FK** |
| `futureItems` | — | `itemId`, `targetDate` | **itemId non FK** |
| `comments` | — | `author`, `message` | — |
| `emailLogs` | — | logs envois checklist | — |

### 5.1.4 Tenant-scoped — gestion (Management)

| Table | Soft delete | Particularités | FK manquantes ⚠️ |
|---|---|---|---|
| `suppliers` | `isActive` | identité + paiement + IBAN + SIRET + TVA | — |
| `purchases` | `isActive` | `supplierId`, `supplierName` (snapshot), `totalHt/Ttc`, `tvaRate` default 20, `paymentStatus`, `paidDate`, `dueDate`, `category` | **supplierId non FK** |
| `general_expenses` | `isActive` | `category`, `description`, `amount`, `isRecurring`, `recurringFrequency`, `period`, `paymentStatus`, `dueDate`, `paidDate` | — |
| `bankAccounts` (finance.ts, PR #83) | `isActive` | un compte par row (`name`, `bankName`, `iban`, `openingBalance`, `notes`) | — |
| `bankEntries` (SQL `bank_entries_v2`, PR #83) | — | FK logique `bankAccountId`. Amount **signé**. `isReconciled` + FK logiques optionnelles `purchaseId`/`expenseId`/`payrollId` pour rapprochement. | **bankAccountId/purchaseId/expenseId/payrollId non FK** |
| `cashEntries` (SQL `cash_entries_v2`, PR #83) | — | `kind` ('in'\|'out'), amount toujours positif. Générique (pas de colonnes resto-flat). | — |
| `files` | — (via files_trash) | `category`, `fileType`, `supplier`, `description`, `mimeType`, `fileSize`, `storagePath`, `emailedTo[]`, `employeeId` (PR #72, FK logique). Index `tenantId` + `employeeId`. | **employeeId non FK** |
| `files_trash` | — | mirror de `files` + `deletedAt`, `expiresAt` (TTL 7j), `originalFileId`. Index `tenantId` + `expiresAt`. | — |
| `employees` | `isActive` | identité + `contractType` (default CDI) + `socialSecurityNumber` (matching PDF) + `salary` / `hourlyRate` / `weeklyHours` (default 35) + `endDate` + `notes`. Index `tenantId`. (PR #72 enrichissement). | — |
| `payroll` | — | `employeeId`, `month` (YYYY-MM), brut/net/charges sal, `employerCharges` + `totalEmployerCost` + `bonuses` + `overtime`, `isPaid` + `paidDate`, `pdfFileId` (FK files.id archive bulletin), `notes`. Index tenant + employee + UNIQUE(tenant, employee, month). (PR #72). | **employeeId non FK** |
| `absences` | — | `employeeId`, `type` (conge/maladie/retard/absence/formation), `startDate` + `endDate` (nullable retard) + `duration`, `isApproved` boolean (= "Alertes" RH dashboard), `notes`. Index tenant + employee. (PR #72). | **employeeId non FK** |
| `analytics` | — | `date`, `metric`, `value`, `metadata jsonb` | — |

> **Dette.** Les FK logiques manquantes (categoryId, itemId, supplierId,
> employeeId) permettent des orphelins. Sprint future de cleanup. Tracé dans
> `09-roadmap-et-synthese.md`.

### 5.1.5 Module 13 — REV (cashback)

Fichiers : `shared/schema/rev/{consumers,merchants,transactions,billing,promotions,giftCards,notifications,favorites}.ts`.
Sprint 1 (`feat/rev-schema`) livre uniquement le schema, l'API et l'UI
arrivent aux Sprints 2-3 (cf. ADR
[`adr/2026-05-20-rev-absorption.md`](./adr/2026-05-20-rev-absorption.md)).

| Table | Tenant | PK | Notes |
|---|---|---|---|
| `rev_consumers` | ❌ Global | id serial | Clients finaux cashback. `email` UNIQUE, `revId` UNIQUE 14 chars (`REVid-XXXXXXXX`, 8 chars alphanumérique). Auth séparée des users mybeez Pro (`password_hash` argon2id, status `pending`/`active`/`disabled`/`banned`). |
| `rev_merchants` | ✅ | id serial | 1 par tenant (UNIQUE `tenant_id`). `cashbackRate` decimal default 10.00. Champs : siret, IBAN, BIC, addresse, contact. |
| `rev_transactions` | ✅ | id serial | `consumer_id`, `merchant_id`, `amount`, `cashback_amount`, `commission_amount`. Index (tenantId, createdAt). Status completed/cancelled/refunded. |
| `rev_cashback_balances` | ✅ | id serial | UNIQUE (`consumer_id`, `merchant_id`). `available_balance` + `pending_balance`. Mis à jour par les services. |
| `rev_cashback_entries` | ✅ | id serial | 1 par transaction. `pending` jusqu'à `unlocks_at`, puis `unlocked` (cron). Index sur (unlocks_at, status) pour le scheduler. |
| `rev_cashback_transfers` | ✅ | id serial | Transferts consumer→consumer, scopés par merchant. |
| `rev_merchant_billings` | ✅ | id serial | Facturation 1-15 + 16-fin du mois. `totalSales`, `cashbackAmount`, `revFeeAmount` (3%), `tvaAmount` (20% de revFee), `promotionCharges` (19€/promo-week). UNIQUE (`merchant_id`, `period_start`, `period_end`). |
| `rev_merchant_goals` | ✅ | id serial | Objectif CA mensuel UNIQUE (`merchant_id`, `month`, `year`). |
| `rev_promotions` | ✅ | id serial | `type` ∈ {cashback_boost, free_article, discount_percent}. `start_date`/`end_date`. |
| `rev_recurring_promotions` | ✅ | id serial | Promotions récurrentes. `daysOfWeek` CSV ("0,1,2,3,4,5,6", dimanche=0). |
| `rev_gift_cards` | ✅ | id serial | Catalogue cartes cadeaux. `cashbackRate` default 15%. Émises par un merchant donné. |
| `rev_gift_card_purchases` | ✅ | id serial | Achat consumer → carte. `paymentProvider` (stripe/paypal). `unlocks_at` = 7 jours ouvrés. |
| `rev_gift_card_balances` | ✅ | id serial | Solde courant détenu (peut être reçu par transfert). |
| `rev_gift_card_transfers` | ✅ | id serial | Historique transferts gift cards. |
| `rev_notifications` | ✅ | id serial | `recipient_type` ∈ {consumer, merchant} + `recipient_id`. Index `(recipientType, recipientId, isRead)`. |
| `rev_user_favorites` | ✅ | id serial | Merchants favoris d'un consommateur. UNIQUE (`consumer_id`, `merchant_id`). |

Particularités :
- **PKs `serial integer`** (convention mybeez) — pas de UUID `varchar` comme dans le REV d'origine.
- **Préfixe `rev_`** sur toutes les tables pour éviter les collisions et signaler la provenance.
- **Pas de FK Drizzle déclarées** (cohérent avec le reste du schema mybeez ; FK logiques uniquement). À traiter dans le sprint cleanup global FK.
- **Pas de table `rev_sessions`** : on n'a pas encore branché l'auth consumer (Sprint 4). Si on garde `connect-pg-simple`, on partage la table `user_sessions` existante mais on filtre par `userId` qui pointera vers `rev_consumers.id` ou `users.id` selon le type d'utilisateur — à reconsidérer en Sprint 4 (sessions séparées probable pour éviter les collisions d'ids).
- **Pas de table `rev_audit_logs`** : on réutilise `audit_log` mybeez (PR #68) en ajoutant `module: "rev"` dans la metadata.
- **Pas de table `rev_merchant_categories`** : remplacée par les `business_templates` mybeez (vertical du tenant).

---

## 5.2 Isolation multi-tenant

| Aspect | Implémentation | Risque |
|---|---|---|
| Pattern | Filtre Drizzle `where(eq(table.tenantId, tid))` sur **chaque** requête | 🔴 Une seule requête sans filtre = fuite trans-tenant |
| RLS Postgres | ❌ Désactivé | Repose 100% sur le code applicatif |
| Résolution | `resolveTenant` middleware (host > slug) | ✓ Correct |
| Propagation | `req.tenantId: number` injecté | ✓ Correct |
| Auth + scope tenant | `session.userId` + `requireRole(...)` lookup `userTenants.role(userId, tenantId)` | ✓ Correct (depuis #53/#54/#55, plus de session.tenantId legacy) |

### 5.2.1 Convention `tid`

Tous les handlers récupèrent le tenant via `const tid = req.tenantId!` (le `!`
est sûr parce que le middleware `resolveTenant` a déjà 400-é si absent), puis
filtrent toutes les requêtes Drizzle :

```ts
const rows = await db
  .select()
  .from(purchases)
  .where(and(eq(purchases.tenantId, tid), eq(purchases.isActive, true)))
  .orderBy(desc(purchases.invoiceDate));
```

**Code review checklist.** À chaque PR qui touche `server/routes/management/*`
ou `server/routes/checklist.ts`, vérifier que toutes les requêtes Drizzle
incluent un `eq(table.tenantId, tid)` dans le `where`. Un oubli = fuite.

---

## 5.3 Migrations

### 5.3.1 Mode actuel

`drizzle-kit push` (sync direct du schéma à la DB) appelé par
`deploy/deploy.sh`.

⚠️ **Pas de migrations versionnées** dans `migrations/` — pas d'historique.
Risque en prod : `--force` peut dropper colonnes/tables silencieusement.

### 5.3.2 Convention de changements

- **Additifs** (CREATE TABLE, ADD COLUMN nullable, ADD INDEX) → passent en
  non-interactif via `db:push`.
- **Relaxations de contrainte** (NULL/DEFAULT) → idem.
- **DROP / RENAME / NOT NULL strict** → `db:push` demande confirmation
  interactive, ce qui casse `deploy.sh`. Pour ces cas, écrire un script SQL
  séparé exécuté manuellement après le deploy. Convention : déposer le
  script dans `scripts/migrations/YYYY-MM-DD-<slug>.sql`, suivre la
  procédure documentée dans `scripts/migrations/README.md` (backup R2
  frais → pre-flight asserts → exec via `docker compose exec -T db psql`
  → vérif post-exec). Pattern établi par
  `scripts/migrations/2026-05-19-drop-legacy.sql` (PR #96, drop des
  colonnes `tenants.pin_code/admin_code` et tables `bank_entries` /
  `cash_entries` v1).

### 5.3.3 Mitigation

- Backup `pg_dump` avant chaque deploy (`npm run backup`, cf. [chapitre 08](./08-ops-et-deploiement.md#84-backups)).
- Cron systemd timer en prod (⏳ Sprint 4).

### 5.3.4 Migration vers migrations versionnées

Hors-200%, prévu Phase 2 :
1. Snapshot schema actuel via `drizzle-kit generate`.
2. Bascule `deploy.sh` sur `drizzle-kit migrate`.
3. CI vérifie qu'aucune divergence schema ↔ migrations.

---

## 5.4 Templates

### 5.4.1 Source de vérité

Fichier : `server/seed/templates.ts`. Idempotent via `seed:templates` (upsert sur
slug).

### 5.4.2 Structure

```ts
{
  slug: "boulangerie",
  parentSlug: "commerce_de_bouche",  // null pour top-level
  name: "Boulangerie / Pâtisserie",
  icon: "Croissant",                  // Lucide
  tagline: "Pour les artisans du pain et des viennoiseries",
  idealFor: ["Boulangers", "Pâtissiers", "Traiteurs sucrés"],
  coverGradient: "from-amber-400 to-rose-400",
  featuresHighlight: ["Stock matières premières", "Suivi production", "Allergènes"],
  notIncluded: ["Gestion de salle"],
  modules: ["checklist", "suppliers", "purchases", "expenses", "files"],
  defaultCategories: { ... },
  vocabulary: { item: "produit", customer: "client" },
  taxRules: { defaultTvaRate: 5.5, tvaRates: [5.5, 10, 20] },
}
```

### 5.4.3 4 verticals × 25 sub-templates

| Vertical (top-level) | Slug | Sub-templates exemples |
|---|---|---|
| Commerce de bouche | `commerce_de_bouche` | restaurant, café, boulangerie, traiteur, primeur, fromager, caviste, glacier, food truck, … |
| Entreprise & services | `entreprise_services` | conseil, agence, services à domicile, garage, paysagiste, plombier, électricien, … |
| Retail B2C | `retail_b2c` | boutique, épicerie fine, concept store, fleuriste, librairie, presse-tabac, … |
| Santé & bien-être | `sante_bien_etre` | salon de coiffure, esthétique, kiné, dentiste, ostéo, podologue, naturopathe, … |

### 5.4.4 Switch tenant (PR #59)

Endpoint : `PATCH /api/management/:slug/template` (owner/admin only).

- Body : `{ templateId }`.
- **Refuse les top-level** (un tenant doit choisir un sub-template, pas un vertical).
- **Préserve les overrides** : si le tenant avait personnalisé `vocabulary` ou
  `modulesEnabled`, ces overrides sont conservés. Seuls les défauts du nouveau
  template sont appliqués pour les clés non personnalisées.

### 5.4.5 Vocabulary overrides per tenant

Stocké dans `tenants.vocabulary` (jsonb). Lu par :
- Frontend : `TenantVocabularySection` (édition), composants tenant (rendu).
- Backend Alfred : `buildSystemPrompt(tenant)` injecte les clés dans le system
  prompt.

### 5.4.6 Modules toggle per tenant

Stocké dans `tenants.modulesEnabled` (jsonb : `{ [moduleId]: boolean }`). Lu par
`TenantSidebar` qui filtre les sections (PR #62).

Registre des modules : `shared/modules.ts`.

---

## 5.5 Domaines personnalisés

Fichier : `shared/schema/domains.ts`.

| Champ | Type | Notes |
|---|---|---|
| `id` | serial | |
| `tenantId` | integer notnull | FK cascade |
| `hostname` | text UNIQUE notnull | |
| `verifiedAt` | timestamp | NULL = pas encore vérifié |
| `sslStatus` | text | `pending`, `provisioning`, `active`, `failed` |
| `createdAt` | timestamp default now | |

### 5.5.1 Statut

- ✅ Schema en place.
- ✅ Lookup au runtime via `domainService.resolveTenantByHost` (cache TTL 60s).
- ❌ Pas de provisioning automatique (DNS verification + SSL Let's Encrypt
  DNS-01) — Phase 2.
- ❌ Pas de UI de gestion (édition réservée à `/api/admin/tenants/:id`).

### 5.5.2 Roadmap

Hors-200% (Phase 2) : provisioning auto via Cloudflare on-demand TLS ou
Let's Encrypt DNS-01. Le custom domain sera une feature payante.

---

## 5.6 Seeds

| Seed | Idempotent | Commande |
|---|---|---|
| `server/seed/templates.ts` | ✅ (upsert sur slug) | `npm run seed:templates` |

Pas d'autre seed. Dev local : créer manuellement un superadmin via
`scripts/grant-superadmin.ts` puis créer un tenant via `/api/onboarding/signup-with-tenant`.

---

## 5.7 Caches in-memory

| Service | Cache | TTL | Risque cluster |
|---|---|---|---|
| `tenantService` | bySlug + byClientCode | infini, invalidation manuelle | 🔴 critique en multi-noeud |
| `domainService` | custom domains | 60s | acceptable |
| `templateService` | bySlug + byId | infini | modéré |
| `alfredService` | history par slug | session lifetime | memory leak potentiel |

### 5.7.1 Implications

- **Multi-noeud bloqué** sans Redis (cf. `09-roadmap-et-synthese.md`).
- **Memory leak Alfred** : pas de purge des slugs inactifs. Process redémarre
  régulièrement (déploiements) donc pas critique aujourd'hui, mais fuite réelle.

### 5.7.2 Mitigation future

- Bascule sur Redis pour `tenantService` + `templateService` + sessions.
- Purge LRU pour `alfredService.history` (max N tenants en mémoire).

---

## 5.8 Connection pool Postgres

Fichier : `server/db.ts`.

```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

- Driver `pg` 8.16.3.
- Pas de tuning explicite (défauts du driver : max 10 connexions).
- Le pool est partagé entre Drizzle et `connect-pg-simple` (sessions).

> **Tuning futur.** Augmenter `max` à 20-30 si on observe contention en prod.
> Ajouter `idleTimeoutMillis`, `connectionTimeoutMillis`. Tracé Sprint 7
> (observabilité) — on verra si Prometheus signale des saturations.

---

*Suite du livre → [06-securite-et-auth.md](./06-securite-et-auth.md)*
