# Chapitre 01 — Vision et fondations

> **Résumé.** myBeez est un SaaS multi-tenant **multi-vertical** ciblant les
> TPE/PME tous secteurs (B2B), pas un produit restaurant. Trois décisions
> foundationnelles prises le 2026-04-28 façonnent tout le reste : multi-vertical
> via templates, tenancy par subdomain + custom domain, auth nominative
> hautement sécurisée. Ce chapitre les explicite, ainsi que le modèle
> commercial implicite et le glossaire métier.

---

## 1.1 Pitch produit

### 1.1.1 Le problème

Les TPE/PME (artisans, commerçants, services, indépendants) gèrent leur
quotidien — checklist d'ouverture, achats fournisseurs, charges, paye, fichiers
comptables — avec un mélange d'Excel, de papier et de SaaS hétérogènes. Personne
ne fait *tout* dans un seul outil, parce que chaque vertical a ses
particularités (TVA, vocabulaire, KPIs).

### 1.1.2 La solution

Un même socle applicatif, une UX cohérente, et des **templates de vertical**
qui adaptent le produit au métier choisi au signup. Une boulangerie n'a pas la
même TVA qu'un salon, ni le même vocabulaire qu'un garage — mais elles partagent
80% des modules sous-jacents (achats, dépenses, employés, fichiers, dashboard).

### 1.1.3 Le différenciateur

**Alfred**, l'assistant IA, est contextualisé sur les opérations du tenant
(checklist du jour, vocabulaire du métier). Il *parle* la langue du client
(« items », « checklist », « clients » → variables selon le template).

### 1.1.4 Cible

- **B2B** : TPE/PME tous secteurs.
- Pas restaurant-only (héritage MVP, en cours de purge).
- Vendable comme produit autonome (« bankable »).

---

## 1.2 Décisions foundationnelles (2026-04-28)

Ces trois décisions sont **load-bearing** : changer l'une d'elles implique un
réécriture coûteuse. Toute nouvelle feature doit s'y conformer.

### 1.2.1 Multi-vertical via templates

**Principe.** myBeez cible TOUS les types de business. Le vertical n'est jamais
codé en dur : c'est une donnée (`tenants.templateId`) qui pré-configure modules
activés, vocabulaire, règles fiscales, KPIs.

**Implications techniques.**
- Schéma DB **vocabulary-neutral** : pas de colonnes `nameVi`/`nameTh`, pas de
  défaut `business_type='restaurant'`.
- Registre `business_templates` (4 verticals × 25 sub-templates au 2026-05-08).
- Per-tenant overrides : `tenants.vocabulary`, `tenants.modulesEnabled`.
- Alfred prompt construit dynamiquement à partir de `tenant.vocabulary`.

**Détail technique** : voir [05.4](./05-donnees-et-multi-tenant.md#54-templates).

### 1.2.2 Tenancy par subdomain + custom domain

**Principe.** Chaque tenant est accessible via `<slug>.mybeez-ai.com` (par
défaut, gratuit) **et** optionnellement via un custom domain payant
(ex. `app.salondemarie.fr`).

**Implications techniques.**
- Wildcard DNS `*.mybeez-ai.com` + wildcard TLS.
- Middleware `resolveTenant` lit `req.hostname` **avant** `req.params.slug`.
- Table `tenant_domains` pour mapping custom domain → tenant.
- Cookie de session scopé `.mybeez-ai.com` pour traverser les subdomains.
- Path-based legacy (`mybeez-ai.com/:slug`) toléré en transition.
- Custom domain = feature payante (industrie norm).

**Détail technique** : voir [02.4](./02-architecture.md#24-r%C3%A9solution-tenant)
et [05.5](./05-donnees-et-multi-tenant.md#55-domaines-personnalis%C3%A9s).

### 1.2.3 Auth nominative la plus sécurisée raisonnable

**Principe.** Pas de PIN partagé tenant-wide. Chaque humain a un compte
nominatif. Couches de sécurité empilées.

**Phase 1 (livrée)** :
- Email + password (Argon2id, OWASP 2024 params).
- Email verification + password reset (tokens hashés SHA-256).
- MFA TOTP RFC 6238 + 10 recovery codes (sha-256, single-use).
- RBAC nominatif 5 rôles : `owner > admin > manager > staff > viewer`.
- Sessions Postgres-backed (`connect-pg-simple`).
- Anti-énumération sur forgot-password.
- Host-header injection guard (`APP_BASE_URL` requis en prod).
- Audit log (writes livrés Sprint 2).

**Phase 2 (à venir)** :
- WebAuthn / passkeys comme primary path.
- SSO Google/Microsoft pour Owners.
- MFA obligatoire Owner/Admin.
- Lockout login + rate-limit dédié `/api/auth/*`.
- HIBP check passwords.
- Per-staff device-paired token (remplace le concept PIN-on-tablet legacy).

**Détail technique** : voir [chapitre 06](./06-securite-et-auth.md).

---

## 1.3 Modèle commercial implicite

### 1.3.1 Tarification

| Tier | Inclus | Tarif (intentionné) |
|---|---|---|
| Free / Trial | Subdomain `slug.mybeez-ai.com`, modules de base, MFA opt-in | Trial 14j puis upsell |
| Pro | Custom domain, modules avancés (analytics, payroll), assistance Alfred illimitée | Phase 2 (Stripe) |
| Enterprise | SSO, SLA, support dédié | Phase 2+ |

### 1.3.2 Mécaniques d'upsell

- **Custom domain = paid tier** (industrie norm).
- **Modules à la carte** selon vertical, déjà schématisé via `tenant_modules`.
- **Quotas / plan limits** (nombre d'employés, tenants, users) : Phase 2.

### 1.3.3 Statut billing

- ❌ **Stripe non intégré** au 2026-05-08.
- Position : reportée Phase 2 du sprint plan, après livraison des 11 modules
  métier et de l'observabilité (Sprints 1-7).

---

## 1.4 Décisions opérationnelles (2026-04-28)

| Décision | Choix | Pourquoi |
|---|---|---|
| Hosting | Hetzner AX422 dédié (Ryzen 9, 128 GB RAM, 2 NVMe) | Headroom app + Postgres + nginx + monitoring sur 1 box |
| DNS | Cloudflare (proxy ON, Full strict) | Wildcard cert + Origin Cert + DDoS edge |
| Reverse proxy | nginx host-installed | Mutualisation avec macommande, ulyssepro, etc. |
| Postgres | Self-hosted Docker (`postgres:16-alpine`) | Pas de cloud DB managed (coût + lock-in) |
| Email | Resend | Simple, fail-soft si non configuré |
| Backups offsite | Cloudflare R2 (`r2mybeez/mybeezdb/`) | S3-compatible, coût zéro egress |
| Domain | `mybeez-ai.com` (Cloudflare, acquired 2026-05-01) | Apex sert l'app, wildcard pour tenants |
| Workflow Git | PR squash-merge sur `main`, branches `feat/* fix/* refactor/* chore/*` | Historique propre, pas de merge commits parasites |

> **Note R2.** R2 = stockage objet S3-compatible, **pas une DB**. Postgres reste
> sur Hetzner NVMe local. R2 ne sert qu'aux dumps offsite et aux fichiers
> utilisateurs (module Files en cours).

---

## 1.5 Verticals (taxonomy 2 niveaux)

### 1.5.1 Top-level (4 verticals)

| Slug | Nom | Exemples |
|---|---|---|
| `commerce_de_bouche` | Commerce de bouche | restaurant, café, boulangerie, traiteur, primeur, fromager, caviste |
| `entreprise_services` | Entreprise & services | conseil, agence, services à domicile, garage, paysagiste |
| `retail_b2c` | Retail B2C | boutique, épicerie fine, concept store, fleuriste, librairie |
| `sante_bien_etre` | Santé & bien-être | salon de coiffure, esthétique, kinésithérapie, dentiste, ostéopathie |

### 1.5.2 Sub-templates

Chaque vertical contient ~25 sub-templates (total ~100). Schema enrichi
(PR #57) : `icon`, `tagline`, `idealFor`, `coverGradient`, `featuresHighlight`,
`notIncluded` — utilisés dans le wizard de signup et la landing dynamique.

**Source de vérité** : `server/seed/templates.ts`.
**Seed idempotent** : `npm run seed:templates`.

---

## 1.6 Glossaire métier

| Terme | Définition |
|---|---|
| **Tenant** | Un compte client. Une row dans `tenants`. Peut être restaurant, salon, garage, boutique. |
| **Template** | Archétype d'activité. Détermine modules, vocabulaire, TVA. |
| **Vertical** | Catégorie top-level de templates (4 au 2026-05-08). |
| **User** | Personne réelle (compte nominatif). Cross-tenant. |
| **Role tenant** | `owner > admin > manager > staff > viewer`, dans `user_tenants.role`. |
| **Superadmin** | Membre interne myBeez (`users.isSuperadmin = true`), distinct de `SUPERADMIN_TOKEN` (Bearer legacy). |
| **Slug** | Nom URL-friendly du tenant (`valentine`, `meyer`). UNIQUE. |
| **Client code** | Code 8 chiffres généré au signup, montré à l'utilisateur (pas un secret). |
| **Module** | Bloc fonctionnel toggleable par tenant via `tenants.modulesEnabled`. |
| **Vocabulary** | JSON par tenant qui réécrit les libellés UI (ex. « items » → « plats »). |
| **Checklist** | Liste d'items à cocher chaque jour, par catégorie/zone. Source du POC. |
| **Alfred** | Assistant IA conversationnel contextualisé. URL `/api/alfred/:slug/*`. |
| **SSE** | Server-Sent Events, canal `/api/:slug/events` pour la sync temps réel. |
| **MFA pending** | Session half-baked entre password et TOTP/recovery, TTL 5 min. |
| **~~PIN code~~** | ⚠ Retiré PR #55. Colonnes `tenants.pin_code/admin_code` laissées nullable, plus aucune écriture. Le PIN-on-tablet Phase-2 sera reconstruit comme un per-staff device-paired token. |

---

*Suite du livre → [02-architecture.md](./02-architecture.md)*
