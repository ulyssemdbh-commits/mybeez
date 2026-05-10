# myBeez — Booksystem

> Document de référence consolidé du projet myBeez, structuré comme un livre :
> préambule, chapitres, sous-chapitres, architecture complète, synthèse et
> objectifs en cours de réalisation et à suivre.
>
> **À jour au :** 2026-05-09 — main (PRs #78 UI Files, #79 send-email-bulk mergées)
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

**État global au 2026-05-09** : MVP solide à ~85%, fondations saines, en
durcissement sécu et en livraison continue des modules métier.

| Pilier | État |
|---|---|
| Multi-tenant (subdomain + custom domain) | 🟡 70% (subdomain ✅, custom domain provisioning auto ❌) |
| Auth nominative (email + password + Argon2id + sessions Postgres) | ✅ |
| MFA TOTP + recovery codes | ✅ (opt-in, gating Owner/Admin obligatoire à venir) |
| RBAC nominatif 5 rôles (`requireRole`) | ✅ |
| Audit log (writes) | ✅ (Sprint 2 livré, PR #13b) |
| Catalogue verticals (4 × 25 sub-templates) | ✅ |
| Wizard signup + landing dynamique + switch tenant template | ✅ |
| Module Checklist quotidienne | ✅ |
| Module Suppliers (Fournisseurs) | ✅ |
| Module Purchases (Achats) + OCR + auto-match | ✅ |
| Module Expenses (Dépenses générales) | ✅ |
| Module Files (corbeille TTL 7j + UI + hook send-email-bulk V2) | ✅ |
| Modules Employees + Payroll + Absences (backend + UI Sprint 4 V2) | ✅ (reste payroll/import-pdf OCR) |
| Modules BankEntries/CashEntries/Analytics/History | ⏳ Sprints 5-7 |
| CI/CD GitHub Actions (typecheck + lint + test + build) | ✅ |
| Backups Postgres → R2 (script + retention + cron systemd) | ✅ (units versionnées PR #70, install host à faire) |
| Healthcheck Docker `app` | ✅ (PR #70) |
| Logger structuré pino | ⏳ Sprint 5 |
| HSTS + CSP + check HIBP | ⏳ Sprint 6 |
| Metrics Prometheus + Sentry | ⏳ Sprint 7 |
| Stripe / billing | ❌ Phase 2 |

**Verrou actuel** : finir les hooks payroll OCR (`import-pdf` + `reparse-all`)
pour boucler le Sprint 4 V2 avant d'entamer le Sprint 5 (Bank/Cash redesign +
logger pino). Cf. `09-roadmap-et-synthese.md`.

---

*Suite du livre → [01-vision-et-fondations.md](./01-vision-et-fondations.md)*
