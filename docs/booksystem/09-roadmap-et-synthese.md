# Chapitre 09 — Roadmap et synthèse

> **Résumé.** Ce chapitre donne l'état réel au 2026-05-09, les sprints livrés,
> ce qui est en cours, ce qui reste à faire pour atteindre l'objectif "200%"
> (produit bankable + différenciation), et la dette explicitement reconnue.
> Mettre à jour à chaque sprint terminé.

---

## 9.1 Vision sprint plan (validée 2026-05-05, option C)

7 sprints, 1 module métier + 1 chantier sécu/ops par sprint. Les 2 PRs d'un
sprint touchent des zones disjointes pour pouvoir avancer sans dépendance.

| Sprint | Module métier | Sécu / Ops | Statut |
|---|---|---|---|
| 1 | feat/purchases | MFA TOTP | ✅ sécu (PR #52 + bonus #53/#54/#55) ✅ module (PRs #64/#65/#67) |
| 2 | feat/cashflow (= expenses + bank + cash) | Audit log writes | ✅ audit (PR #68) ✅ bonus lockout + rate-limit auth (PR #69) ✅ partiel module (expenses #66 livré, bank/cash redesign reportés au Sprint 5) |
| 3 | feat/files (anticipé) | Healthcheck Docker app + cron systemd backup R2 (anticipé du Sprint 4) | ✅ module Files V1 (PR #71 backend + PR #78 UI) ✅ hook V2 send-email-bulk (PR #79) ✅ ops (PR #70) — sécu/ops Sprint 3 du plan original (lockout) consommé en Sprint 2 |
| 4 | feat/hr (employees + payroll + absences) | (consommé au Sprint 3) | ✅ backend HR (PR #72) ✅ UI RH (PR #76) ✅ hooks payroll OCR `import-pdf` + `reparse-all` (PR #81) — **Sprint 4 V2 bouclé** |
| 5 | feat/bank+cash redesign | Logger structuré pino (stdout JSON) | ✅ logger pino (PR #82) ✅ backend Bank/Cash (PR #83) — UI à venir |
| 6 | feat/analytics | HSTS nginx + CSP helmet + check HIBP | ✅ sécu/ops (PR #84) ✅ backend Analytics (PR #85) — UI à venir |
| 7 | feat/history-cross | Metrics Prometheus + Sentry frontend | ⏳ à venir |

Règles :
- Quality gates avant merge : `npm run check` + lint + test + CI verte.
- Squash-merge sur main.
- Booksystem mis à jour à la fin de chaque sprint si changement structurel.

---

## 9.2 État réel au 2026-05-09

### 9.2.1 Livré (mergé sur `main`)

**Fondations (sprints précurseurs) :**
- ✅ Auth nominative (PR #12) : signup, login, logout, me, verify-email,
  forgot-password, reset-password.
- ✅ Sessions Postgres-backed (PR #11) : `connect-pg-simple`, table
  `user_sessions`.
- ✅ MFA TOTP + recovery codes (PR #13a/#52).
- ✅ RBAC nominatif strict (PR #53) : matrice rôles sur checklist + SSE.
- ✅ Routes Alfred slug-scoped + `requireRole` (PR #54).
- ✅ Purge auth PIN (PR #55).
- ✅ Catalogue verticals enrichi (PRs #57/#58/#59/#60) : 4 verticals × 25
  sub-templates, schema +6 colonnes (icon, tagline, idealFor, coverGradient,
  featuresHighlight, notIncluded), wizard signup 3 étapes, landing dynamique,
  switch tenant template.
- ✅ Edition vocabulary + toggle modules dans TenantAdmin (PR #61).
- ✅ Filtre sidebar selon `modulesEnabled` (PR #62).
- ✅ UI Management partagés portés depuis ulysseclaude (PR #63).
- ✅ Module Achats end-to-end (PR #64).
- ✅ OCR import facture pré-remplit le formulaire (PR #65).
- ✅ Module Dépenses générales (PR #66).
- ✅ OCR auto-match fournisseur + support PDF (PR #67).
- ✅ Audit log écritures sur événements sensibles (PR #68 — Sprint 2 sécu/ops).
- ✅ Lockout par compte + rate-limit IP `/api/auth/*` (PR #69 — Sprint 2 sécu/ops bonus).
- ✅ Healthcheck Docker `app` + cron systemd backup R2 (PR #70 — Sprint 3 sécu/ops, anticipé du Sprint 4 plan).
- ✅ Module Files V1 backend (PR #71) + UI section + corbeille (PR #78 — recovery du commit orphelin `16b44d1` d'une session parallèle) — Sprint 3 module.
- ✅ Hook files V2 `POST /files/send-email-bulk` (PR #79) — Resend N attachments + append `to` dans `files.emailedTo[]`, cap 25 MB, fail-soft dev (console). Couvre aussi le single-file via `fileIds: [N]`.
- ✅ Module RH backend : Employees + Payroll + Absences (PR #72 — Sprint 4 module backend).
- ✅ UI RH Sprint 4 V2 (PR #76) : page Gestion RH avec employés + payroll + absences (consommatrice de `/employees/summary`, table employés, détail employé avec sections Documents RH / Absences / Fiches de Paie).
- ✅ Fix UI catalogue modules + empty-state checklist (PR #77).
- ✅ Fix ops : `postgresql16-client` dans l'image app pour que backup/restore fonctionnent côté container (PR #75).
- ✅ Hooks payroll OCR (PR #81) : `POST /payroll/import-pdf` (Vision API
  via `payslipParser` + `matchEmployee` 3-tiers + upload R2 + insert
  `files`/`payroll` en transaction) et `POST /payroll/reparse-all`
  (cap 50/run, backfill `files.employeeId`). Helpers purs dans
  `services/payroll/payrollImport.ts`. **Sprint 4 V2 bouclé.**
- ✅ Logger structuré pino (PR #82 — Sprint 5 sécu/ops) :
  `server/lib/logger.ts` (root + `moduleLogger(name)` child) +
  `pino-http` middleware (UUID requestId, log auto request/response avec
  duration). 135 occurrences `console.*` migrées sur 30 fichiers. Format
  JSON prod / `pino-pretty` dev. `LOG_LEVEL` env var. Redact secrets
  aligné sur `auditService`.
- ✅ Module Bank/Cash backend (PR #83 — Sprint 5 module métier) :
  `shared/schema/finance.ts` (3 tables `bank_accounts` + `bank_entries_v2`
  + `cash_entries_v2`), 3 sets de routes CRUD + stats + unreconciled,
  helpers purs `services/finance/financeSummary.ts` (`computeBankAccountBalance`,
  `computeBankStats`, `computeCashStats`). Amount **signé** côté banque,
  **positif** + `kind` côté caisse. FK logiques optionnelles vers
  `purchases`/`expenses`/`payroll` pour rapprochement. Anciennes tables
  `bank_entries`/`cash_entries` (vides) renommées `legacyBankEntries`/`legacyCashEntries`
  en TS (drop SQL différé). UI à livrer en PR follow-up.
- ✅ HSTS + CSP + HIBP (PR #84 — Sprint 6 sécu/ops) :
  HSTS `max-age=31536000; includeSubDomains; preload` côté nginx + helmet
  (defense in depth). CSP strict prod (script-src 'self', style-src
  'self' 'unsafe-inline', frame-ancestors 'none', etc.), désactivé dev
  pour HMR Vite. HIBP k-anonymity sur signup + reset-password +
  signup-with-tenant ; soft-fail sur API down ; `HIBP_DISABLED=true`
  override. Code `PASSWORD_PWNED` retourné en 400 avec message FR.
- ✅ Module Analytics backend (PR #85 — Sprint 6 module métier) :
  3 endpoints `/analytics/{dashboard,monthly,tva}` + helpers purs
  `services/analytics/analyticsSummary.ts`. Compute on-demand
  (vertical-agnostic, pas de hardcode resto). Top suppliers, payment
  status mix, séries mensuelles signées (bank/cash), TVA déductible.
  TVA collectée = `null` documenté (requires future revenue table).
  UI à livrer en PR follow-up.

### 9.2.2 En cours / en attente de merge

- (rien en attente — la stack Sprint 3-4-5-6 est intégralement mergée sur `main` au 2026-05-10)

### 9.2.3 À suivre — UI Bank/Cash + Analytics + Sprint 7

Backend complet jusqu'à Sprint 6 (#82 pino, #83 Bank/Cash, #84 HSTS+
CSP+HIBP, #85 Analytics). Reste :

**UI follow-up** :
- `BankAccountsSection.tsx` + `BankEntriesSection.tsx` + `CashEntriesSection.tsx` (PR Sprint 5 follow-up)
- `AnalyticsSection.tsx` — KPI cards + charts mensuels + top suppliers (PR Sprint 6 follow-up)

**Sprint 7** :
- Module métier : History cross-module (vue unifiée audit + métier).
- Sécu/ops : Metrics Prometheus + Sentry frontend.

> Note ex-prerequis abandonné : initialement on avait planché sur
> `pdf-parse` pour extraire le texte des bulletins PDF. La PR #81 a
> tranché autrement — le `payslipParser` envoie le PDF brut à Gemini
> via `inline_data` (même pattern qu'`invoiceParser`). Vision API gère
> uniformément photo / PDF scanné / PDF natif, là où `pdf-parse`
> n'aurait fonctionné que sur PDF natif numérique propre. Aucune
> nouvelle dépendance ajoutée.

### 9.2.4 À suivre — Sprints 5-7

| Sprint | Module | Sécu/Ops |
|---|---|---|
| 5 | BankEntries / CashEntries redesign (moyens de paiement génériques) | Logger structuré pino (stdout JSON) |
| ~~6~~ | ~~Analytics~~ ✅ Livré PR #85 (backend, UI à venir) | ~~HSTS nginx + CSP helmet + check HIBP~~ ✅ Livré PR #84 |
| 7 | History cross-module (vue unifiée audit + métier) | Metrics Prometheus + Sentry frontend |

---

## 9.3 Décisions foundationnelles — état d'application

| Décision | État réel | Note |
|---|---|---|
| Multi-vertical via templates | Catalog seedé (4 × 25), `tenants.templateId`, vocabulary par tenant ✓. Alfred lit `tenant.vocabulary` ✓. Wizard signup multi-step ✓. Switch template tenant ✓. Vocabulary editor + modules toggle ✓. Reste : `templateId` NOT NULL + drop `businessType`. | 🟢 95% |
| Subdomain + custom domain | Subdomain résolution ✓, table `tenant_domains` ✓, custom domain provisioning automatisé ❌ | 🟡 60% |
| Auth max-secure | Argon2id ✓, sessions Postgres ✓, RBAC nominatif ✓, MFA TOTP ✓, PIN purgé ✓, audit log writes ✓, lockout par compte + rate-limit IP ✓, HSTS+CSP+HIBP ✓ (PR #84). **Reste : MFA obligatoire Owner/Admin** | 🟢 95% |

---

## 9.4 Évaluation cycle de vie SaaS

| Étape | État |
|---|---|
| Self-serve signup (user + tenant) | ✅ `POST /api/onboarding/signup-with-tenant` |
| Email verify | ✅ |
| Forgot/reset password | ✅ |
| Onboarding wizard (template picker au signup) | ✅ wizard 3 étapes |
| MFA opt-in | ✅ (page `/auth/security`) |
| Audit log écrit | ✅ (Sprint 2) |
| Billing / abonnement | ❌ Stripe non intégré (Phase 2) |
| Trial / quota / plan limits | ❌ |
| Cancellation / data export | ❌ |
| RGPD : right to be forgotten | 🟡 partiel (cascade FK incomplet) |
| Custom domain provisioning | 🟡 Schéma OK, automation ❌ |

---

## 9.5 Verdict global

> **myBeez est un produit en consolidation rapide à ~85%, sur fondations
> saines, avec 8 modules métier production-ready (Checklist, Suppliers,
> Purchases, Expenses, Files V1+V2 send-email, Employees, Payroll,
> Absences — backend + UI), sécu de phase 1 complète (audit log + lockout +
> rate-limit + healthcheck + cron backup livrés sprints 2-3), et 3 modules
> métier restants à porter dans les sprints 5-7 (Bank/Cash redesign,
> Analytics, History). Reste payroll OCR (`import-pdf` + `reparse-all`)
> pour boucler le Sprint 4 V2.**

Ce qui est solide :
- Architecture multi-tenant cohérente.
- Stack moderne et maintenue.
- Auth nominative + MFA + RBAC + audit log.
- CI/CD opérationnelle.
- Tests sur les fondations critiques.
- Backup pipeline production-grade (cron à brancher).
- Realtime SSE proprement gaté.
- Alfred AI vocabulary-neutral.
- Pattern UI cohérent (TenantAppShell + sharedUI Management).
- Catalogue verticals enrichi (4 × 25, présentation visuelle).

Ce qui manque pour être *fully bankable* :
- Hooks payroll OCR (`import-pdf` + `reparse-all`) pour boucler Sprint 4 V2.
- 3 modules métier restants (Bank/Cash redesign, Analytics, History cross).
- Logger structuré + metrics + Sentry.
- ~~HSTS + CSP + HIBP.~~ ✅ Livré PR #84.
- Stripe billing (Phase 2).

---

## 9.6 Dette technique reconnue

### 9.6.1 Architecture

- **Pas de RLS Postgres** — l'isolation multi-tenant repose entièrement sur les
  filtres Drizzle. Une seule omission = fuite. Mitigation : code review +
  tests d'intégration cross-table à ajouter.
- **FK logiques non contraintes** : `items.categoryId`, `checks.itemId`,
  `purchases.supplierId`, `payroll.employeeId`, `absences.employeeId`. Orphelins
  possibles. Sprint future de cleanup.
- **Caches process-local** (`tenantService`, `templateService`,
  `alfredService`) — bloque le scale-out horizontal. Bascule Redis Phase 2.
- **Pas de migrations versionnées** — `db:push` synchronise sans historique.
  Bascule `drizzle-kit migrate` Phase 2.

### 9.6.2 Auth / sécurité

- **MFA opt-in seulement** — pas obligatoire pour Owner/Admin.
- ~~**Lockout login** absent.~~ ✅ Livré (PR #69).
- ~~**Pas de check HIBP** sur passwords.~~ ✅ Livré (PR #84).
- ~~**CSP désactivé** dans helmet.~~ ✅ Livré (PR #84, prod uniquement).
- ~~**Pas de HSTS** côté nginx.~~ ✅ Livré (PR #84, nginx + helmet).
- **Pas de chiffrement R2** des dumps.
- **Pas de CSRF token** (acceptable tant que pas de form cross-origin).

### 9.6.3 Backend

- **Persistence Alfred history** : en mémoire, perdu au redéploiement (Phase 2 :
  table `alfred_messages`).
- **Memory leak Alfred** : pas de purge des slugs inactifs (LRU à ajouter).

### 9.6.4 Frontend

- **3 mécanismes refresh redondants checklist** : `refetchOnWindowFocus` +
  `refetchInterval: 30s` + SSE. Choisir SSE seul + invalidation manuelle.
- **Sections `/management/...` restantes en placeholder** — Bank/Cash,
  Analytics, History à livrer (cf. sprints 5-7). Files, Employees,
  Payroll, Absences, Suppliers, Purchases, Expenses ✅ livrés.
- **`AdminTenant` page stub** — route `/123admin/tenants/:id` ne charge rien.
- **Aucun test frontend significatif** — uniquement IconRenderer + taxRulesLabels.
- **Landing page monolithique** (~890 lignes) — à scinder en sections
  composables.

### 9.6.5 Ops

- ~~**Pas de healthcheck Docker `app`**~~ ✅ Livré (PR #70).
- ~~**Pas de logger structuré**~~ ✅ Livré pino (PR #82).
- **Aucune metric applicative** (latence, error rate, DB pool).
- **Aucun alerting**.
- ~~**Cron backups** pas câblé en prod.~~ ✅ Livré units versionnées (PR #70), reste à install sur le host.
- **Pas de pre-commit hooks** (Husky/lint-staged).

### 9.6.6 Modules

- **Checklist `GET /history`** : `byDate[date].total = allItems.length` calcule
  le total avec items actifs *aujourd'hui*, pas à la date X — biaise les
  pourcentages historiques.
- ~~**BankEntries / CashEntries** : schemas restaurant-flat~~ ✅ Redesigné PR #83
  (`bank_accounts` + `bank_entries_v2` + `cash_entries_v2` dans `finance.ts`).
  Anciens schémas renommés `legacy*` ; drop SQL définitif différé.

---

## 9.7 Hors-200% (Phase 2)

Reportés explicitement après les 7 sprints :

- **Stripe** : abonnements, plan limits, trial 14 jours.
- **Custom domain provisioning automatisé** : Let's Encrypt DNS-01 ou
  Cloudflare on-demand TLS.
- **Passkeys / WebAuthn** : remplace MFA TOTP comme primary path.
- **SSO Google/Microsoft** pour Owner uniquement.
- **MFA obligatoire** pour Owner/Admin.
- **RLS Postgres** comme défense en profondeur.
- **Mobile** : PWA d'abord (manifest + service worker), app native plus tard.
- **Intégrations comptables** : export FEC (France), Pennylane, QuickBooks.
- **Marketplace de templates** : verticals contribués par la communauté.
- **Alfred RAG** : embeddings + retrieval sur la doc tenant.
- **Persistence Alfred history** en DB.
- **Multimodal Alfred** : OCR sur factures uploadées (déjà partiellement via
  `parse-invoice`).
- **API publique versionnée** : pour intégrations externes.

---

## 9.8 Scale-out (avant 100+ tenants)

Pas urgent, mais à anticiper :

- **Redis** pour `tenantService` + `templateService` + sessions partagées.
- **Cluster mode Node** (`pm2` ou Kubernetes).
- **Read replica Postgres**.
- **CDN Cloudflare** devant les assets statiques (déjà en place via CF proxy).
- **Migrations versionnées** (`drizzle-kit generate` + `migrate`) pour
  remplacer `db:push`.

---

## 9.9 Comment lire ce chapitre

À chaque session myBeez, commencer par :

1. Lire **9.2.1 Livré** pour comprendre où on en est.
2. Lire **9.2.2 En cours** pour savoir ce qui est ouvert.
3. Lire **9.2.3 À suivre** pour le sprint à attaquer.

Ne pas démarrer un nouveau sprint avant que les 2 PRs du courant soient
mergées (cf. règle option C).

Mettre à jour ce chapitre à la fin de chaque sprint :
- Déplacer les items « En cours » → « Livré ».
- Promouvoir le sprint suivant en « À suivre ».
- Ajouter / retirer des items dans **9.6 Dette technique reconnue** selon ce
  qui a été résolu / découvert.

---

*Suite du livre → [10-cheatsheet.md](./10-cheatsheet.md)*
