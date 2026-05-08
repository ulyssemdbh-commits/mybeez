# Chapitre 09 — Roadmap et synthèse

> **Résumé.** Ce chapitre donne l'état réel au 2026-05-08, les sprints livrés,
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
| 2 | feat/cashflow (= expenses + bank + cash) | Audit log writes | ✅ audit (PR #13b/#5c43e8b) ✅ partiel module (expenses #66 livré, bank/cash redesign reportés) |
| 3 | feat/employees | Lockout login + rate-limit dédié `/api/auth/*` | ⏳ à venir |
| 4 | feat/payroll-absences | Healthcheck Docker app + cron systemd backup R2 | ⏳ à venir |
| 5 | feat/files | Logger structuré pino (stdout JSON) | 🟡 module en cours (`feat/files-and-trash`), logger ⏳ |
| 6 | feat/analytics | HSTS nginx + CSP helmet + check HIBP | ⏳ à venir |
| 7 | feat/history-cross | Metrics Prometheus + Sentry frontend | ⏳ à venir |

Règles :
- Quality gates avant merge : `npm run check` + lint + test + CI verte.
- Squash-merge sur main.
- Booksystem mis à jour à la fin de chaque sprint si changement structurel.

---

## 9.2 État réel au 2026-05-08

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
- ✅ Audit log écritures sur événements sensibles (PR #13b — Sprint 2 sécu/ops).

### 9.2.2 En cours (branche `feat/files-and-trash`)

- 🟡 Module Files (V1) :
  - ✅ Schéma `files` + `files_trash`.
  - ✅ Routes API (upload, download, list, soft/hard-delete, restore, trash list).
  - ✅ Services storage (R2) + naming + trashService (TTL 7j + scheduleTrashPurge).
  - ⏳ UI section Files (table + dialog upload + table trash + actions).
  - ⏳ Tests d'intégration multipart + trash expiry.
  - ⏳ Test manuel R2 cred runtime.
  - ⏳ Merge sur main.

### 9.2.3 À suivre — Sprint 3 (prochain)

**Module : feat/employees.**
- Schema `employees` déjà présent.
- Porter depuis `ulysseclaude/hrRoutes.ts` (voir
  `project_mybeez_sprint_plan` mémoire pour les 4 garde-fous).
- UI : `EmployeesSection` avec table + dialog + filtres contrat/actif.
- Skip reparse PDF V1.

**Sécu/ops : lockout + rate-limit dédié `/api/auth/*`.**
- Rate-limit `/api/auth/*` : 10 tentatives login / 5 min / IP.
- Lockout : 5 échecs consécutifs sur le même email → blocage 15 min + email
  alert.
- Détection enumeration : alerte si > N erreurs « email inconnu » d'une même IP.
- Audit events : `auth.login.lockout`, `auth.login.unlock`.

### 9.2.4 À suivre — Sprints 4-7

| Sprint | Module | Sécu/Ops |
|---|---|---|
| 4 | Payroll + Absences (suit Employees) | Healthcheck Docker `app` + cron systemd backup R2 |
| 5 | Files V2 (déjà entamé V1) → couvert par avance ; remplacer par BankEntries/CashEntries redesign | Logger structuré pino (stdout JSON) |
| 6 | Analytics (cumul purchases + expenses + KPIs) | HSTS nginx + CSP helmet + check HIBP |
| 7 | History cross-module (vue unifiée) | Metrics Prometheus + Sentry frontend |

> **Note** : Sprint 5 module a été livré en avance (Files). Le sprint 5 effectif
> deviendra probablement BankEntries/CashEntries redesign. À retrancher dans le
> plan quand Files sera mergé.

---

## 9.3 Décisions foundationnelles — état d'application

| Décision | État réel | Note |
|---|---|---|
| Multi-vertical via templates | Catalog seedé (4 × 25), `tenants.templateId`, vocabulary par tenant ✓. Alfred lit `tenant.vocabulary` ✓. Wizard signup multi-step ✓. Switch template tenant ✓. Vocabulary editor + modules toggle ✓. Reste : `templateId` NOT NULL + drop `businessType`. | 🟢 95% |
| Subdomain + custom domain | Subdomain résolution ✓, table `tenant_domains` ✓, custom domain provisioning automatisé ❌ | 🟡 60% |
| Auth max-secure | Argon2id ✓, sessions Postgres ✓, RBAC nominatif ✓, MFA TOTP ✓, PIN purgé ✓, audit log writes ✓. **Lockout absent**, **MFA pas obligatoire Owner/Admin**, HSTS/CSP/HIBP absents | 🟢 80% |

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

> **myBeez est un produit en consolidation rapide à ~70%, sur fondations
> saines, avec 5 modules métier production-ready, sécu de phase 1 quasi-complète
> (audit log livré sprint 2), et 6 modules métier restants à porter dans les
> sprints 3-7.**

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
- 6 modules métier (Files V1 en cours, puis Employees/Payroll/Absences/Bank/Cash redesign/Analytics/History).
- Lockout login + rate-limit dédié `/api/auth/*`.
- Healthcheck Docker app + cron backups branché.
- Logger structuré + metrics + Sentry.
- HSTS + CSP + HIBP.
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
- **Lockout login** absent.
- **Pas de check HIBP** sur passwords.
- **CSP désactivé** dans helmet.
- **Pas de HSTS** côté nginx.
- **Pas de chiffrement R2** des dumps.
- **Pas de CSRF token** (acceptable tant que pas de form cross-origin).

### 9.6.3 Backend

- **Persistence Alfred history** : en mémoire, perdu au redéploiement (Phase 2 :
  table `alfred_messages`).
- **Memory leak Alfred** : pas de purge des slugs inactifs (LRU à ajouter).

### 9.6.4 Frontend

- **3 mécanismes refresh redondants checklist** : `refetchOnWindowFocus` +
  `refetchInterval: 30s` + SSE. Choisir SSE seul + invalidation manuelle.
- **9 sections `/management/...` en placeholder** — UI à livrer (cf. sprints
  3-7).
- **`AdminTenant` page stub** — route `/123admin/tenants/:id` ne charge rien.
- **Aucun test frontend significatif** — uniquement IconRenderer + taxRulesLabels.
- **Landing page monolithique** (~890 lignes) — à scinder en sections
  composables.

### 9.6.5 Ops

- **Pas de healthcheck Docker `app`** — pas de restart auto si freeze silencieux.
- **Pas de logger structuré** — `console.log` only.
- **Aucune metric applicative** (latence, error rate, DB pool).
- **Aucun alerting**.
- **Cron backups** pas câblé en prod.
- **Pas de pre-commit hooks** (Husky/lint-staged).

### 9.6.6 Modules

- **Checklist `GET /history`** : `byDate[date].total = allItems.length` calcule
  le total avec items actifs *aujourd'hui*, pas à la date X — biaise les
  pourcentages historiques.
- **BankEntries / CashEntries** : schemas restaurant-flat, à redesigner en
  moyens-paiement génériques avant d'implémenter routes/UI.

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
