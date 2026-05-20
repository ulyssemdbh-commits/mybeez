# ADR 2026-05-20 — Absorption Projet-REV → mybeez

- **Statut :** Accepted (PR #98 mergée 2026-05-20, Sprint 1 en cours dans `feat/rev-schema`)
- **Date :** 2026-05-20
- **Décideurs :** Ulysse (PO) · Claude (engineering principal)
- **Contexte technique :** [02-architecture](../02-architecture.md), [05-donnees-et-multi-tenant](../05-donnees-et-multi-tenant.md), [07-modules-metier](../07-modules-metier.md)

---

## 1. Contexte

`Projet-REV` (alias REV) est un projet existant indépendant situé à
`C:\Users\meyer\Projet-REV`. C'est une **plateforme de cashback local**
(cashback 10% sur achats en commerce de proximité) avec 3 rôles :
`client`, `merchant`, `admin`. Son modèle business :

- Le commerçant souscrit à REV et propose 10% de cashback à ses clients.
- REV facture **3% au commerçant** sur le CA réalisé via la plateforme
  + **TVA 20%** sur les 3%.
- Le commerçant peut acheter des **promotion-weeks à 19€/semaine** pour
  booster sa visibilité (`promotionCharges` dans `merchant_billings`).
- Les **gift cards** offrent 15% de cashback, achetables Stripe/PayPal.
- Cashback **time-locked** (déverrouillé après N jours) puis **transférable**
  entre users.
- Billing automatique le **15 et le 30** de chaque mois.

### Stack REV

- React 18 + Vite + wouter + TanStack Query + Tailwind + Shadcn
- Express 4 + Passport Local + bcryptjs 12 rounds
- Drizzle ORM + PostgreSQL (PKs `varchar` UUID)
- socket.io (realtime)
- Stripe + PayPal + react-qr-code + @zxing/library + jspdf
- Deploy actuel : Replit autoscale (`.replit` declare `nodejs-20` + `postgresql-16` + intégrations `javascript_database`, `javascript_log_in_with_replit`, `stripe:2.0.0`)
- 16 tables : `users`, `merchants`, `transactions`, `cashback_balances`, `cashback_entries`, `cashback_transfers`, `merchant_billings`, `notifications`, `promotions`, `recurring_promotions`, `gift_cards`, `gift_card_purchases`, `gift_card_balances`, `gift_card_transfers`, `user_favorites`, `audit_logs`, `merchant_goals` (17 si on compte `audit_logs`).
- 7 pages front : `landing`, `login`, `client-dashboard`, `merchant-dashboard`, `merchant-statistics`, `admin-dashboard`, `not-found`.

### Demande PO

> *"Je veux ajouter REV à mybeez, qu'un user mybeez Pro puisse proposer REV
> à ses clients et gérer son compte REV-pro depuis mybeez."*

Autrement dit : un tenant mybeez (déjà commerçant — boulangerie, salon,
boutique…) active le module REV depuis son interface Management mybeez,
configure son compte commerçant cashback, et gère transactions / billings
/ promotions / gift cards sans jamais quitter mybeez. Côté client final
(consommateur qui scanne un QR), une UI publique séparée reste nécessaire.

### Contraintes mybeez à respecter

- Multi-tenant single-DB single-schema avec isolation par filtres
  `tenant_id` côté Drizzle (cf. CLAUDE.md §2 et booksystem ch. 05).
- Auth nominative Argon2id + MFA TOTP + RBAC 5 rôles (cf. ch. 06).
- Realtime via SSE custom (pas socket.io) — cf. CLAUDE.md §1.
- Build prod esbuild CJS `dist/index.cjs` (cf. déploiement Hetzner §9 CLAUDE.md).
- Convention scripts/migrations/YYYY-MM-DD-*.sql idempotente pour les DDL destructives.
- Conventional Commits, branche dédiée par chantier, squash-merge sur main.

---

## 2. Décision

**Absorber REV dans mybeez comme module métier 13.**

Concrètement :

1. Les 16 (ou 17) tables REV sont migrées dans `shared/schema/rev/`, toutes
   scopées par `tenant_id integer NOT NULL REFERENCES tenants(id)`.
2. Les PKs `varchar` UUID de REV deviennent `serial integer` (convention
   mybeez), à l'exception de `users.rev_id` qui garde son format public
   `REVid-XXXXXX` comme identifiant **visible client** (champ secondaire,
   pas PK).
3. La table `users` de REV est **fusionnée** avec `users` de mybeez pour
   les **users mybeez Pro** (Owner/Admin/Manager d'un tenant). Pour les
   **consommateurs cashback** (clients finaux qui n'ont pas de compte
   mybeez Pro), on crée une nouvelle table `rev_consumers` à part, avec
   son propre cycle d'auth, pour ne pas polluer `users` mybeez avec des
   millions de comptes consommateurs.
4. L'auth merchant passe par l'auth mybeez (Argon2id + MFA + RBAC). Le
   role tenant `owner` ou `admin` peut administrer le module REV
   (configurer IBAN, tarifs, promotions). Le role `manager` peut
   consulter et créer des transactions. Les rôles `staff` et `viewer` :
   pas d'accès par défaut, ouvrable via permissions futures.
5. L'auth consommateur (clients finaux cashback) reste séparée :
   `bcryptjs` migré vers `argon2id`, sessions Postgres-backed via
   `connect-pg-simple` (déjà en place mybeez). Login via email + password
   ou via QR code généré par le merchant.
6. Le realtime REV (socket.io) est porté sur SSE mybeez
   (`server/services/realtimeSync.ts`). Pas de double stack.
7. Stripe et PayPal sont conservés tous les deux dans un premier temps
   (équivalence fonctionnelle). À reconsidérer en Phase 2.
8. L'app cashback consommateur (pages publiques sans connexion mybeez Pro)
   est exposée sur un **sous-domaine dédié** `cashback.mybeez-ai.com`,
   servi par le même process mybeez via une résolution de host spécifique
   (à valider — cf. §7 Open questions).
9. Le module REV est **toggleable per tenant** via
   `tenants.modules_enabled.rev = true`. Tant que non activé, les routes
   `/api/management/:slug/rev/*` répondent 404 et la sidebar mybeez
   n'affiche pas la section.
10. Le code source `C:\Users\meyer\Projet-REV` est **archivé** (read-only,
    référence historique) une fois la migration data terminée. Plus aucun
    développement à l'extérieur de mybeez.
11. **Contrainte ferme : zéro Replit dans le code livré.** Le code REV
    importé contient plusieurs dépendances et hooks spécifiques à
    Replit (cf. §4 Inventaire) qui doivent être **intégralement purgés**
    avant ou pendant le portage de chaque fichier. Une **CI gate**
    grep-based est ajoutée pour bloquer toute ré-introduction
    accidentelle (`REPL_`, `@replit/`, `REPLIT_`, `stripe-replit-sync`).
    Cette contrainte est PO-driven et non-négociable.

---

## 3. Conséquences

### 3.1 Positives

- **Produit unifié pour le merchant** : un seul login, un seul billing,
  un seul support, un seul onboarding. Pas de double compte à gérer.
- **Pas de service inter-process** à versionner, monitorer, sécuriser.
  Pas de clés d'API inter-service à roter, pas de mTLS à mettre en place.
- **Pas de latence aller-retour HTTP** entre mybeez et REV pour chaque
  écran merchant.
- **Réutilisation maximale** de l'écosystème mybeez existant :
  - `userTenantService` + `requireRole` pour le RBAC merchant
  - `passwordService` (Argon2id), `mailService` (Resend), `mfaService`
    (TOTP) pour l'auth
  - `auditService` pour le log des actions sensibles (avec scrub secrets)
  - `realtimeSync` (SSE) pour les events live
  - Logger pino, `/metrics` Prometheus, Sentry frontend, healthcheck
    Docker, backup R2 systemd timer
  - Conventions Drizzle, validation Zod, queryClient TanStack
- **Cohérence du booksystem** : un seul lieu de doc à maintenir.
- **Évolutions cross-module** triviales :
  - Une promotion REV peut s'appuyer sur les données du module Files
    (envoi d'un coupon PDF par email).
  - Le module Analytics peut intégrer les revenus REV au CA total.
  - Le module BankAccounts peut rapprocher automatiquement les billings
    REV émis vers le merchant.
- **Compliance e-invoicing** (cf. `project_mybeez_compliance_2026`) :
  les factures REV générées vers le merchant sont déjà des factures
  inter-pro → seraient dans le scope de la PDP myBeez interne dev.

### 3.2 Négatives / risques

- **Effort de refacto schema non-négligeable** : 16 tables à migrer,
  PKs UUID → serial, ajout `tenant_id` partout, contraintes FK à
  recâbler. Estimation Sprint 1 : ~5 jours dev + tests.
- **Auth merchant à changer** : passage bcryptjs → argon2id force un
  reset password obligatoire pour tous les merchants existants (si
  instance REV en prod a déjà des merchants).
- **Auth consommateur à harmoniser** aussi (bcryptjs → argon2id).
  Migration douce possible : on garde le hash bcryptjs en `users.password`
  jusqu'au prochain login, on re-hash en argon2id à ce moment.
- **socket.io → SSE** : 1 chantier de portage. SSE est unidirectionnel
  (serveur → client) ; les events REV qui requièrent du bidirectionnel
  (typing indicators, présence) devront passer par POST + SSE side-channel.
  L'analyse rapide du code REV ne montre **pas** d'usage bidirectionnel
  critique — à confirmer en Sprint 2.
- **Stripe / PayPal** : configuration partagée avec les autres tenants
  mybeez quand Stripe billing sera mis en place côté mybeez (Phase 2).
  Risque de confusion entre compte Stripe REV-merchant et compte Stripe
  mybeez-billing. **À découpler** : un tenant peut avoir 2 comptes Stripe
  connectés (un pour le billing mybeez, un pour ses transactions REV).
- **Surface de DB augmentée** : +16 tables sur une base qui en a déjà
  25+. Total ~41 tables. Acceptable, mais demande de rigueur sur les
  indexes (au moins `(tenant_id, ...)` sur les colonnes filtrées).
- **App consommateur publique** : nouveau pattern d'exposition (sous-domaine
  non-tenant). Demande adaptation du middleware `resolveTenant` et de la
  CSP helmet. À expliciter en Sprint 4.
- **Module Revenue mybeez Phase 2** : risque de chevauchement avec les
  données REV (transactions REV = une source de CA). À arbitrer quand
  Revenue sera repris.

### 3.3 Risques explicitement écartés

- **Risque "REV serait vendable séparément à d'autres plateformes"** :
  écarté par le PO. REV est dédié à l'écosystème mybeez et n'a pas
  vocation à être white-labellé.
- **Risque "performance multi-tenant avec gros volumes consommateurs"** :
  acceptable. La table `rev_consumers` aura beaucoup de rows à terme,
  mais reste indexée par `(tenant_id, email)` ou similaire. PostgreSQL
  16 tient sans problème jusqu'à plusieurs millions de rows.

---

## 4. Inventaire Replit à purger (audit 2026-05-20)

Audit effectué sur `C:\Users\meyer\Projet-REV` à la date de l'ADR.
Tout ce qui suit doit avoir disparu du code mybeez à la fin du
**Sprint 1** (avant que la première PR feature REV ne touche le code).

### 4.1 Dépendances npm à retirer (5)

| Package | Type | Usage actuel | Remplacement |
|---|---|---|---|
| `stripe-replit-sync` | dependencies | `server/stripeClient.ts` (sync DB Stripe via le connector Replit) | Webhooks Stripe + mise à jour DB côté mybeez (pattern standard) |
| `@replit/vite-plugin-runtime-error-modal` | devDependencies | `vite.config.ts` (overlay erreurs dev) | Vite affiche déjà nativement les erreurs en dev — suppression nette |
| `@replit/vite-plugin-cartographer` | devDependencies | `vite.config.ts` (mapping fichiers Replit) | Inutile hors Replit — suppression nette |
| `@replit/vite-plugin-dev-banner` | devDependencies | `vite.config.ts` (badge "Made with Replit") | Inutile — suppression nette |
| `openid-client` | dependencies | **Orphelin** (aucun import dans `server/**`, vestige de `javascript_log_in_with_replit`) | Suppression nette |

### 4.2 Fichiers / dossiers à supprimer

| Chemin | Quoi | Action |
|---|---|---|
| `.replit` | Config Replit autoscale (modules, ports, workflows, integrations) | Ne pas porter |
| `.config/replit/` | Config semgrep Replit Assistant | Ne pas porter |
| `.local/skills/` | Skills Replit Assistant (mockups, artefacts, secondary_skills) | Ne pas porter |
| `.local/state/replit/` | État Replit Assistant runtime | Ne pas porter |
| `replit.md` | Documentation interne Replit + creds admin en clair (⚠ à archiver hors repo) | Ne pas porter, archiver hors repo si besoin de mémoire historique |

### 4.3 Code à refactor

| Fichier | Lignes | Problème | Action |
|---|---|---|---|
| `server/stripeClient.ts` | toutes (83 lignes) | Utilise `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL`, `REPLIT_DEPLOYMENT`, `X_REPLIT_TOKEN`, `stripe-replit-sync` | **Réécrire** : init Stripe simple avec `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` env vars (pattern macommande/mybeez), service `stripeService` dans `server/services/rev/payments/`, webhook handler dans `server/routes/rev/webhooks.ts` |
| `server/routes.ts` | ligne 1454 | `process.env.REPLIT_DOMAINS?.split(',')[0]` pour base URL | Remplacer par `APP_BASE_URL` (env var mybeez existante, REQUIRED en prod) |
| `vite.config.ts` | lignes 4, 9-21 | 3 plugins Replit + check `process.env.REPL_ID` | Réécrire la config Vite — aligner sur `mybeez/vite.config.ts` (qui sait déjà gérer client root, alias `@`/`@shared`, build vers `dist/public`) |

### 4.4 Variables d'environnement Replit interdites en prod

À ajouter au `eslint-plugin-no-process-env` config et au pre-deploy check :

`REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL`,
`REPLIT_DEPLOYMENT`, `REPLIT_DOMAINS`, `REPL_ID`, `REPL_SLUG`,
`REPLIT_DB_URL`, `X_REPLIT_TOKEN`, et tout autre `REPL_*` / `REPLIT_*`.

### 4.5 CI gate (à wirer en Sprint 1)

Ajouter dans `.github/workflows/ci.yml` une étape :

```yaml
- name: No Replit residue
  run: |
    if grep -RE "@replit/|stripe-replit-sync|REPLIT_|REPL_IDENTITY|REPL_ID" \
        --include="*.ts" --include="*.tsx" --include="*.json" \
        --exclude-dir=node_modules --exclude-dir=dist \
        client server shared scripts; then
      echo "::error::Replit residue detected in source tree"
      exit 1
    fi
```

Cette gate doit passer dès la PR Sprint 1 (`feat/rev-schema`) et
rester verte sur toute PR suivante touchant le module REV.

### 4.6 Auth Replit — non-applicable

L'audit confirme que **l'auth REV n'utilise PAS Replit Auth**
(`javascript_log_in_with_replit`) malgré la déclaration d'intégration
dans `.replit`. L'auth REV passe par `passport-local` + `bcryptjs`
côté `server/storage.ts` (vérifié — aucun import `openid-client`).
La présence d'`openid-client` dans `package.json` est un orphelin
(probablement scaffold initial Replit jamais wiré).

→ Auth merchant REV bascule directement sur le système nominatif mybeez
(Argon2id + MFA + RBAC + sessions Postgres-backed) en Sprint 2.
Auth consommateur REV reste indépendante mais migre `bcryptjs` →
`argon2id` (pattern mybeez `services/auth/passwordService.ts`).

---

## 5. Alternatives considérées

### 5.1 Option B — REV reste autonome, mybeez appelle REV via API externe

Décrite formellement pour mémoire.

REV continuerait à tourner comme un service séparé (Replit ou Hetzner).
mybeez exposerait un module qui parle à REV via une API REST (`https://rev.app/api/external/...`). Auth inter-service via API key partagée
par tenant ou OAuth client_credentials.

**Pourquoi rejetée :**

- Maintenance de **2 codebases**, 2 deploys, 2 monitoring, 2 backups.
- API inter-service à **versionner** au fil des évolutions schema.
- **Latence aller-retour** sur chaque écran merchant mybeez
  (typiquement 30-200ms ajoutés).
- **Auth inter-service** complexe : clés à roter, à révoquer, à scoper.
- **Pas de jointures cross-domaine** possibles côté DB (ex: corréler
  une transaction REV avec une dépense mybeez devient un travail manuel).
- **Effort initial plus élevé** que l'absorption : il faut concevoir
  l'API publique (versioning, contrats, idempotence, rate limit), alors
  que l'absorption profite directement de tout l'écosystème mybeez.
- Aucun gain compensatoire (le PO ne veut pas vendre REV séparément).

### 5.2 Option C — White-label REV avec UI mybeez par-dessus

REV resterait autonome côté code et auth, mais mybeez fournirait
uniquement une couche UI "branded mybeez" qui consommerait l'API REV
en lecture seule + redirigerait vers l'app REV pour les actions.

**Pourquoi rejetée :**

- Mauvais des deux mondes : couplage UI sans bénéfice DB unifié.
- L'utilisateur final percevrait quand même 2 produits (déconnexion
  dès qu'il fait une action significative).
- Maintenance d'une "façade UI" qui doit suivre les changements de
  l'API REV → double travail.

### 5.3 Option D — Migrer mybeez dans REV (sens inverse)

Théoriquement possible, écartée d'emblée :

- mybeez a une stack plus moderne et stricte (Argon2id, MFA, RBAC, audit,
  pino, Prometheus, Sentry, CI/CD, healthchecks, backups versionnés…).
- mybeez a 12 modules métier production-ready, REV en a 1.
- mybeez est multi-tenant nativement, REV est mono-app.
- mybeez est sur Hetzner Docker (prod prouvée), REV sur Replit autoscale.

Le sens de l'absorption est évident : REV → mybeez.

---

## 6. Plan d'implémentation

7 sprints (S0 inclus). Chaque sprint = 1 PR principale + booksystem
mis à jour dans la même PR. Quality gates : `npm run check` + lint
(quand ESLint sera installé) + test + CI verte. Squash-merge sur main.

| Sprint | Branche | Livrable | Estim. |
|---|---|---|---|
| **S0** | `docs/rev-absorption-adr` | **Cet ADR.** Validation PO + cartographie REV finale (via Agent Explore en cours). | 1 jour |
| **S1** | `feat/rev-schema` | **Purge Replit complète (cf. §4)** : retrait 5 packages npm, suppression `.replit` / `.config/replit/` / `.local/skills/` / `replit.md` (archivé hors repo), refactor `stripeClient.ts` + `routes.ts` ligne 1454 + `vite.config.ts`, **CI gate grep `REPL_` activée**. Puis : `shared/schema/rev/*.ts` (16 tables, tenant_id, PKs serial), Drizzle relations + Zod, migration SQL idempotente, indexes (`tenant_id` first), seed dev minimal. Booksystem ch. 05 et 07 (ajout module 13). | 7 jours (5 schema + 2 purge) |
| **S2** | `feat/rev-merchant-api` | Routes `/api/management/:slug/rev/{merchant,transactions,balances,billings,promotions,gift-cards,stats}`, services `server/services/rev/*`, cron systemd timer pour billing auto 15/30 + cashback unlock, intégrations Stripe + PayPal côté merchant. Tests Vitest. | 10 jours |
| **S3** | `feat/rev-management-ui` | `client/src/components/management/sections/Rev*.tsx` (RevSection + Dashboard + Onboarding + Transactions + Billings + Promotions + GiftCards), toggle `tenant.modulesEnabled.rev`, sidebar dynamique. Booksystem ch. 04 et 07. | 7-10 jours |
| **S4** | `feat/rev-consumer-app` | App publique consommateur sur sous-domaine `cashback.mybeez-ai.com` (ou route `/c/:slug` — décidé en §6.1). Pages landing, login, solde, transactions, gift cards, transferts, scan QR. Auth `rev_consumers` séparée. | 10 jours |
| **S5** | `feat/rev-migration` | Script d'import depuis instance REV existante (si applicable), mapping merchant → tenant, force reset password merchants, audit sécu (CSP unifié, rate-limit, helmet), tests E2E. Booksystem ch. 06 et 08. | 5 jours |
| **S6** | `feat/rev-golive` | Feature flag `revEnabled`, Sentry events `rev_*`, métriques Prometheus `mybeez_rev_*`, beta avec 1-2 merchants pilotes, documentation onboarding merchant. Booksystem ch. 09 (ajout sprint REV). | 3 jours |

**Total estimé** : ~40-50 jours-dev (≈ 2 mois calendaires en travail
en parallèle avec d'éventuels chantiers sécu/ops mybeez Phase 2).

Dépendances :
- S1 bloque S2, S3 et S4.
- S2 bloque S5.
- S3 et S4 sont **parallélisables** une fois S1 mergé.
- S5 bloque S6.

---

## 7. Open questions (à trancher avant ou pendant l'implémentation)

### 6.1 Sous-domaine `cashback.mybeez-ai.com` vs route publique `/c/:slug` ?

**Sous-domaine** :
- ✅ Séparation visuelle nette client / merchant
- ✅ Cookies isolés (auth consommateur ≠ auth mybeez Pro)
- ✅ CSP plus stricte facile à définir
- ❌ Demande wildcard cert (déjà en place) + ajout d'une règle nginx
- ❌ Le merchant ne peut pas avoir son propre branding cashback (sauf
  via custom domain en Phase 2+)

**Route publique `/c/:slug`** :
- ✅ Pas d'infra nouvelle, le routing tenant existant suffit
- ✅ Le merchant peut avoir son propre branding (sous son custom domain)
- ❌ Risque de confusion d'auth (cookies partagés avec les routes
  management) — devra être géré via `path=/c` côté Set-Cookie
- ❌ Le tenant doit être résolu **avant** d'afficher la landing publique

**Recommandation initiale** : sous-domaine `cashback.mybeez-ai.com` en
S4, **plus** route `/c/:slug` côté custom domain en Phase 2+ (option
white-label merchant).

→ **À trancher avec le PO avant Sprint 4.**

### 6.2 Stripe / PayPal — on garde les deux ?

REV utilise les deux PSP en parallèle (gift card purchase peut être
payée via Stripe ou PayPal). mybeez prévoit Stripe pour le billing
SaaS en Phase 2.

**Question** : on garde Stripe + PayPal pour les transactions REV
ou on s'aligne uniquement sur Stripe ?

**Argument PayPal** : taux d'adoption élevé chez les consommateurs
français (CB, livret jeune). PayPal Express checkout réduit la friction.

**Argument Stripe-only** : un seul PSP à intégrer, un seul webhook à
sécuriser, un seul reporting.

→ **À trancher en Sprint 2.** Par défaut, je garde les 2 pour ne pas
casser l'existant côté consommateur.

### 6.3 Migration data — instance REV en prod existe-t-elle ?

L'instance REV connue de `replit.md` contient des creds admin
(`djedoumaurice@gmail.com / Admin123!`) — preuve qu'au moins une
instance a tourné. Il faut savoir :

- Combien de merchants ?
- Combien de consommateurs ?
- Volume de transactions ?
- Cashback non-débloqués / non-payés ?
- Gift cards émises non-utilisées ?
- Billings en cours non-réglés ?

→ **À investiguer en Sprint 5** (ou plus tôt si le PO confirme qu'une
prod existe). Si vide → migration triviale (juste table empty). Si
production réelle → script `feat/rev-migration` doit garantir
zéro perte cashback.

### 6.4 Génération `rev_id` (identifiant public REV)

REV utilise une fonction `generateRevId()` qui retourne `REVid-XXXXXX`
(6 chars random) côté `users`. À conserver pour les consommateurs
(c'est leur ID de transfert public). Question :

- Garder le format `REVid-XXXXXX` exactement ?
- Élargir à 8 chars pour réduire les collisions à terme ?
- Préfixer par le slug du tenant (`<slug>-REVid-XXXXXX`) pour éviter
  les collisions cross-tenant ?

→ **À trancher en Sprint 1** lors de la conception du schema.

### 6.5 Module Revenue Phase 2 et chevauchement REV

Le module Revenue prévu en Phase 2 (cf. booksystem §9.7) doit calculer
le CA du tenant. Les transactions REV représentent du CA réel. Faut-il :

- Que les transactions REV soient **automatiquement** ingérées dans
  Revenue ?
- Garder les 2 modules séparés (Revenue = ventes hors-REV, REV =
  ventes plateforme) ?
- Faire un "agrégateur" Revenue qui voit les 2 ?

→ **À traiter quand Revenue sera repris.** Ne bloque pas REV S1-S6.

### 6.6 RBAC REV — qui peut faire quoi ?

Proposition initiale (à valider) :

| Action | owner | admin | manager | staff | viewer |
|---|---|---|---|---|---|
| Activer/désactiver module REV | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurer IBAN + taux | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer transaction (scan QR client) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Voir billings | ✅ | ✅ | ✅ | ❌ | ❌ |
| Créer promotion | ✅ | ✅ | ❌ | ❌ | ❌ |
| Émettre gift card | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir stats | ✅ | ✅ | ✅ | ❌ | ✅ |

→ **À valider en Sprint 2** lors du wiring des routes.

---

## 9. Mises à jour

### 9.1 2026-05-20 — Rebranding REV → CashMy (PO)

Pendant le Sprint 1, le PO a tranché que la marque exposée au public
serait **CashMy** (au lieu de **REV** dans le projet upstream). Décision
mémoire `mybeez-rev-rename`. Intégrée à la PR #99 avant merge pour
éviter une double-migration plus tard (~Sprint 3 si reporté = cher :
rename des tables DB en prod + routes + UI).

**Alignement appliqué dans cette PR** :
- Tables DB : `cashmy_*` (au lieu de `rev_*`)
- Module slug `tenants.modulesEnabled` : `"cashmy"`
- Sous-domaine app consumer : `cashmy.mybeez-ai.com` (confirme l'option
  retenue à l'open question §7.1)
- Identifiant public consumer : `CashMy-XXXXXXXX` (au lieu de
  `REVid-XXXXXXXX`), `varchar(16)`
- Types TypeScript : `CashMy*` (consumer, merchant, transaction, etc.)
- Exports : `cashmyConsumers`, `cashmyMerchants`, etc.
- Dossier schema : `shared/schema/cashmy/`
- Champ `revFeeAmount` (billing) → `platformFeeAmount` (neutre marque)

**Inchangé** :
- Nom du repo source : `Projet-REV` (le repo upstream s'appelle
  vraiment ça, c'est historique)
- Nom de la branche en cours : `feat/rev-schema` (live, déjà
  pushée et reviewée — pas la peine de re-pousser sous un autre
  nom). Les branches suivantes seront nommées `feat/cashmy-*`.
- Nom du fichier ADR : `2026-05-20-rev-absorption.md` (référencé
  partout, rename = casserait les liens)

**Open question §7.1 (sous-domaine) résolue** : `cashmy.mybeez-ai.com`.

---

## 10. Liens

- Booksystem chapitres impactés (à mettre à jour en S1+) :
  - [02-architecture](../02-architecture.md) — ajout CashMy comme module 13
  - [05-donnees-et-multi-tenant](../05-donnees-et-multi-tenant.md) — schema cashmy/*
  - [06-securite-et-auth](../06-securite-et-auth.md) — auth consommateur séparée
  - [07-modules-metier](../07-modules-metier.md) — section module 13 CashMy
  - [08-ops-et-deploiement](../08-ops-et-deploiement.md) — sous-domaine cashmy.mybeez-ai.com, secrets Stripe/PayPal
  - [09-roadmap-et-synthese](../09-roadmap-et-synthese.md) — sprint CashMy S0-S6
- Mémoire Claude : `project_mybeez_rev_integration` (décision actée + sprint plan)
- Source REV archive : `C:\Users\meyer\Projet-REV` (à archiver read-only une fois migration faite)
- Replit deploy REV (à confirmer si encore actif) : domaine inconnu — à
  identifier en Sprint 5
- PRs prévues :
  - S0 (ADR validation) : à ouvrir une fois cet ADR relu par PO
  - S1 à S6 : numéros à déterminer au moment de l'ouverture
