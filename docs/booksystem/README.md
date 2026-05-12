# myBeez — Booksystem

> Document de référence consolidé du projet myBeez, structuré comme un livre :
> préambule, chapitres, sous-chapitres, architecture complète, synthèse et
> objectifs en cours de réalisation et à suivre.
>
> **À jour au :** 2026-05-12 — main (roadmap option C bouclée, 12/12 modules production-ready, sprints 1-7 sécu/ops + module métier intégralement mergés)
> **Domaine prod :** https://mybeez-ai.com
> **Repo :** https://github.com/ulyssemdbh-commits/mybeez

---

## Préambule

myBeez est un SaaS multi-tenant **multi-vertical** : un même socle applicatif
sert une boulangerie, un salon de coiffure, un garage, un cabinet de
kinésithérapie ou une boutique. Au signup, le client choisit un *template*
d'activité qui pré-configure modules activés, vocabulaire, taux de TVA et KPIs.

Ce booksystem remplace l'ancien `docs/bible.md`. Il reflète l'état **réel** du
code (et non l'état idéal ou intentionné). Sa raison d'être :

1. **Un seul endroit** pour comprendre le projet, lisible d'un trait.
2. **Hiérarchie de livre** (préambule → chapitres → sous-chapitres) pour qu'un
   nouveau contributeur — humain ou IA — sache exactement où chercher.
3. **Synthèse honnête** des forces, faiblesses, dette, et roadmap.
4. **Mise à jour continue** : à chaque sprint, le chapitre concerné et
   `09-roadmap-et-synthese.md` sont rafraîchis.

### Comment lire ce livre

- **Lecture séquentielle** : suivre l'ordre 01 → 10 reproduit la logique
  d'apprentissage (vision → archi → couches → sécu → métier → ops → roadmap →
  cheatsheet).
- **Lecture ciblée** : la table des matières ci-dessous renvoie au chapitre
  pertinent. Chaque chapitre est autonome et commence par un résumé.
- **Cheatsheet uniquement** : `10-cheatsheet.md` pour les commandes du
  quotidien (deploy, backup, env vars).

### Conventions du livre

- Tous les chapitres sont en français.
- Les chemins de fichiers suivent la convention `client/src/pages/Foo.tsx` ou
  `server/routes/foo.ts` (relatifs au repo).
- Les statuts utilisent : ✅ livré · 🟡 partiel · ⏳ à venir · ❌ non implémenté.
- Les commits / PRs sont référencés par leur numéro GitHub (`#67`).

### Mise à jour

> Ce livre est maintenu à la fin de chaque sprint ou de chaque évolution
> structurelle. Si vous ouvrez une PR qui change l'archi, l'auth, le schéma DB,
> les modules ou les ops, **mettez à jour le chapitre concerné dans la même
> PR**. Le préambule (date + branche en haut) doit toujours refléter la tête
> de `main`.

---

## Table des matières

| # | Chapitre | Quand le lire |
|---|---|---|
| **00** | [Préambule](./README.md) (ce fichier) | Toujours en premier |
| **01** | [Vision et fondations](./01-vision-et-fondations.md) | Comprendre le pourquoi du projet |
| **02** | [Architecture générale](./02-architecture.md) | Vue d'ensemble système, stack, monorepo |
| **03** | [Backend](./03-backend.md) | Toucher à Express, routes, services, AI, SSE |
| **04** | [Frontend](./04-frontend.md) | Toucher à React, pages, composants, hooks |
| **05** | [Données et multi-tenant](./05-donnees-et-multi-tenant.md) | Toucher au schéma Drizzle, isolation, migrations |
| **06** | [Sécurité et authentification](./06-securite-et-auth.md) | Toucher à l'auth, MFA, RBAC, audit, headers |
| **07** | [Modules métier](./07-modules-metier.md) | Livrer ou modifier un module (checklist, achats, dépenses, fichiers, …) |
| **08** | [Ops et déploiement](./08-ops-et-deploiement.md) | Déployer, debugger en prod, ajouter une env var |
| **09** | [Roadmap et synthèse](./09-roadmap-et-synthese.md) | Comprendre ce qui est en cours et à venir |
| **10** | [Cheatsheet](./10-cheatsheet.md) | Référence rapide commandes, env vars, glossaire |

---

## Synthèse 30 secondes

**État global au 2026-05-12** : **roadmap option C bouclée**. 12 modules
métier production-ready (backend + UI), 7 sprints sécu/ops intégralement
livrés. Plus aucun item planifié dans la phase 1. La suite passe en
**Phase 2** (Stripe billing, MFA obligatoire Owner/Admin, WebAuthn,
SSO, RLS Postgres, custom domain provisioning automatisé) — cf.
[09-roadmap-et-synthese.md §9.7](./09-roadmap-et-synthese.md#97-hors-200-phase-2).

### Modules métier

| # | Module | Backend | UI |
|---|---|---|---|
| 1 | Checklist quotidienne | ✅ | ✅ |
| 2 | Suppliers (Fournisseurs) | ✅ | ✅ |
| 3 | Purchases (Achats) + OCR auto-match supplier | ✅ | ✅ |
| 4 | Expenses (Dépenses générales) | ✅ | ✅ |
| 5 | Files (corbeille TTL + send-email-bulk V2) | ✅ | ✅ |
| 6 | Employees | ✅ | ✅ |
| 7 | Payroll + OCR bulletins (`/import-pdf` + `/reparse-all`) | ✅ | ✅ |
| 8 | Absences | ✅ | ✅ |
| 9 | BankAccounts + BankEntries (signed amount, FK rapprochement) | ✅ | ✅ |
| 10 | CashEntries (kind in/out, générique vertical) | ✅ | ✅ |
| 11 | Analytics (dashboard + monthly + TVA) | ✅ | ✅ |
| 12 | History cross-module (audit_log unifié + deep-link) | ✅ | ✅ |

### Sécu / ops (sprints 1-7)

| Pilier | État |
|---|---|
| Multi-tenant (subdomain + custom domain) | 🟢 90% (subdomain ✅, custom domain provisioning auto ❌ Phase 2) |
| Auth nominative Argon2id + sessions Postgres-backed | ✅ |
| MFA TOTP + recovery codes single-use | ✅ (opt-in, gating Owner/Admin obligatoire = Phase 2) |
| RBAC nominatif 5 rôles strict (`requireRole`) | ✅ |
| Audit log writes + scrub secrets | ✅ (PR #68) |
| Lockout par compte + rate-limit IP `/api/auth/*` | ✅ (PR #69) |
| Catalogue verticals (4 × 25 sub-templates) + wizard signup + switch template | ✅ |
| CI/CD GitHub Actions (typecheck + lint + test + build) | ✅ |
| Healthcheck Docker `app` + cron systemd backup R2 | ✅ (PR #70, install host fait) |
| Backups Postgres → R2 (streaming + retention + restore dry-run) | ✅ |
| Logger structuré pino + pino-http (requestId, redact secrets) | ✅ (PR #82) |
| HSTS + CSP strict prod + HIBP k-anonymity (signup + reset) | ✅ (PR #84) |
| Prometheus `/metrics` Bearer-gated + Sentry frontend (no-op si DSN absent) | ✅ (PR #87) |
| Stripe / billing | ❌ Phase 2 |
| RLS Postgres (defense in depth multi-tenant) | ❌ Phase 2 |
| WebAuthn / passkeys + SSO | ❌ Phase 2 |

### Reste avant Phase 2

- Smoke prod sur les 12 modules dans un tenant test (UI + flows métier).
- Surveiller les premières erreurs Sentry + scrape Prometheus.
- Drop SQL définitif `tenants.pin_code`/`admin_code` + `bank_entries`/`cash_entries` legacy (script manuel, `db:push --force` interdit en prod).
- Voir `09-roadmap-et-synthese.md §9.6` pour la dette technique reconnue (FK manquantes, refresh redondants, caches process-local, etc.).

---

*Suite du livre → [01-vision-et-fondations.md](./01-vision-et-fondations.md)*
