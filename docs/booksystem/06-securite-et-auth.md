# Chapitre 06 — Sécurité et authentification

> **Résumé.** Auth nominative email + password (Argon2id), MFA TOTP RFC 6238 +
> recovery codes, RBAC nominatif 5 rôles, sessions Postgres-backed avec
> rolling expiry, anti-énumération sur forgot-password, audit log avec writes
> branchées (Sprint 2 PR #68), lockout par compte + rate-limit dédié
> `/api/auth/*` (Sprint 2 PR #69). PIN partagé tenant-wide purgé en PR #55.
> HSTS + CSP + HIBP livrés Sprint 6 sécu/ops (PR #84). Reste : MFA
> obligatoire Owner/Admin.

---

## 6.1 Modèle d'auth (depuis PR #55)

| Modèle | État | Usage cible |
|---|---|---|
| **Nominatif** (email + Argon2id) | ✅ Implémenté (PR #12) | Tous les rôles tenant : Owner / Admin / Manager / Staff / Viewer |
| **MFA TOTP** | ✅ Implémenté (PR #13a / #52) | Opt-in côté user, recommandé Owner/Admin |
| **Bearer SUPERADMIN_TOKEN** | ✅ En place, à retirer | Routes `/api/tenants/*` (legacy transitionnel) |
| **Superadmin nominatif** | ✅ Implémenté | Routes `/api/admin/*` |

L'auth PIN partagée tenant-wide (legacy `tenants.pinCode`/`adminCode`) a été
**purgée en PR #55**. Plus aucun chemin d'authentification PIN dans le code
applicatif. Les colonnes restent en DB en nullable jusqu'au DROP SQL définitif
(différé pour ne pas casser `deploy.sh`).

Le tablet-PIN flow Phase-2 sera reconstruit **différemment** : per-staff
device-paired token (le device s'authentifie d'abord nominativement, obtient un
long-lived tenant-scoped token, puis chaque staff débloque une session courte
avec un PIN court — pas un PIN partagé).

---

## 6.2 Sessions

Fichier : `server/index.ts`.

| Aspect | Implémentation |
|---|---|
| Store | Postgres via `connect-pg-simple`, table `user_sessions` auto-provisionnée (`createTableIfMissing: true`) |
| Cookie | `secure: prod`, `httpOnly`, `sameSite: lax`, `domain: .mybeez-ai.com` prod, `maxAge: 24h` |
| Rolling | ✅ `rolling: true` |
| Logout-everywhere | ❌ Non implémenté (Phase 2) |
| Prune | Toutes les 15 min (`pruneSessionInterval: 60 * 15`) |

### 6.2.1 Cookie scope cross-subdomain

En prod : `domain: .mybeez-ai.com` pour qu'une session ouverte sur l'apex
(`/auth/login`) suive l'utilisateur quand il est redirigé vers
`<slug>.mybeez-ai.com`. En dev, unset (browsers refusent `.localhost`).

### 6.2.2 Pas de CSRF token

Mitigations en place :
- `sameSite: lax` (le cookie ne fuite pas en cross-site POST).
- `httpOnly` (JS ne peut pas le lire).
- Mutations exigent JSON body (pas de form-urlencoded → préflight CORS si autre
  origine).

> **Trade-off.** Si on accepte un jour des form POST cross-origine (webhooks
> Stripe par ex.), il faudra ajouter un CSRF token. Pas de besoin actuel.

---

## 6.3 Hashing mots de passe

Fichier : `server/services/auth/passwordService.ts`.

| Aspect | Choix | Pourquoi |
|---|---|---|
| Algo | **argon2id** | OWASP 2024 recommendation, mémoire-dur |
| `memoryCost` | 19456 KiB | OWASP 2024 baseline |
| `timeCost` | 2 | OWASP 2024 baseline |
| `parallelism` | 1 | Server CPU-friendly |
| Min length | 12 | NIST SP 800-63B passphrase-friendly |
| Max length | 256 | Anti-DoS sur hashing très long |
| Complexité forcée | ❌ | Intentionnel (NIST SP 800-63B : longueur > complexité) |
| HIBP check | ✅ Livré PR #84 — k-anonymity sur signup + reset-password (soft-fail si API timeout) |

---

## 6.4 RBAC

### 6.4.1 Rôles

| Rôle | Pouvoir |
|---|---|
| `owner` | Tout. Le seul qui peut transférer la propriété. |
| `admin` | Tout sauf transfert ownership. |
| `manager` | Mutations métier (CRUD purchases, expenses, suppliers, employees). Pas de gestion équipe. |
| `staff` | Opérations quotidiennes (toggle checklist, comments). Lecture des modules métier. |
| `viewer` | Lecture seule. |

Ordre dans `TENANT_ROLES = ["owner", "admin", "manager", "staff", "viewer"]`
(`shared/schema/users.ts:58`).

### 6.4.2 Middleware

Fichier : `server/middleware/auth.ts`.

```ts
app.post(
  "/api/management/:slug/purchases",
  resolveTenant,
  requireUser,
  requireRole("owner", "admin", "manager"),
  handler
);
```

- `requireRole(...allowed)` lookup `userTenants.role(userId, tenantId)` puis
  vérifie l'inclusion.
- **Superadmin nominatif bypass** : `users.isSuperadmin = true` est toujours
  autorisé sur les routes tenant.
- **Bearer SUPERADMIN_TOKEN** ne donne PAS de role tenant — il sert seulement
  aux routes `/api/tenants/*` legacy.

### 6.4.3 Couverture actuelle

| Surface | Gating |
|---|---|
| `/api/admin/*` | `requireSuperadminUser` |
| `/api/management/:slug/suppliers/*` | RBAC matrice |
| `/api/management/:slug/purchases/*` | RBAC matrice |
| `/api/management/:slug/expenses/*` | RBAC matrice |
| `/api/management/:slug/files/*` | RBAC matrice |
| `/api/management/:slug/template` | owner/admin |
| `/api/management/:slug/settings/*` | owner/admin |
| `/api/checklist/:slug/*` | RBAC matrice (READ/STAFF/MANAGE) |
| `/api/alfred/:slug/*` | tous rôles tenant |
| SSE `/api/:slug/events` | tous rôles tenant |

### 6.4.4 Convention matrice CRUD

```ts
const READ_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
const WRITE_ROLES = ["owner", "admin", "manager"] as const;
```

Présent dans tous les fichiers `server/routes/management/*`. Délibérément
verbeux pour que la matrice soit visible en haut de chaque module.

---

## 6.5 MFA

Fichier : `server/services/auth/mfaService.ts`, `server/routes/userAuthMfa.ts`.

### 6.5.1 Standard

- **TOTP RFC 6238** via `otplib`.
- Période 30s, drift toléré ±30s (1 step avant/après).
- 6 chiffres.

### 6.5.2 Secrets

Stockés base32 dans `mfa_secrets.secret`. Encryption-at-rest = job de la couche
DB / disque (Hetzner NVMe FDE possible, pas activé par défaut).

### 6.5.3 Recovery codes

- 10 codes générés au setup.
- Format `XXXX-XXXX-XXXX` (12 chars + tirets).
- Stockés en sha-256 dans `recoveryCodeHashes` (jsonb).
- **Single-use** : après usage, le hash est retiré du tableau.
- Affichés **une seule fois** au setup, puis disparaissent du serveur.

### 6.5.4 Login flow avec MFA

```
POST /api/auth/user/login
  ├─ password OK + MFA inactif → session full set, 200 { user, tenants }
  └─ password OK + MFA actif   → session mfaPending* (TTL 5 min), 200 { mfaRequired: true }

POST /api/auth/user/mfa/challenge  (requireMfaPending)
  ├─ TOTP OK → promote pending → full session
  └─ recovery code OK → idem (consume code)
```

### 6.5.5 UI

Page `/auth/security` (`AuthSecurity.tsx`) :
- Setup : QR code + secret texte + 10 recovery codes affichés une fois.
- Confirm : entrer un TOTP pour valider.
- Disable : re-auth password + delete row.

Écran challenge intégré au flow `/auth/login`.

### 6.5.6 Statut

- ✅ Implémenté.
- 🟡 **Pas obligatoire pour Owner/Admin** (opt-in côté user). Gating à brancher
  selon politique.

---

## 6.6 Audit log

Fichier : `server/services/auth/auditService.ts`. Schema `audit_log`
(`shared/schema/users.ts`).

### 6.6.1 Statut

✅ **Writes branchées** en PR #13b (Sprint 2 sécu/ops, livré).

### 6.6.2 Convention `event`

`domain.action.outcome` en kebab-case par segment.

| Domain | Exemples |
|---|---|
| `auth` | `auth.login.success`, `auth.login.failure`, `auth.logout` |
| `mfa` | `mfa.enabled`, `mfa.disabled`, `mfa.challenge.success`, `mfa.recovery.used` |
| `password` | `password.reset.requested`, `password.reset.success` |
| `tenant` | `tenant.created`, `tenant.updated`, `tenant.template.changed`, `tenant.vocabulary.changed`, `tenant.modules.changed` |
| `purchases` | `purchases.created`, `purchases.updated`, `purchases.archived` |
| `expenses` | `expenses.created`, `expenses.updated`, `expenses.archived` |
| `suppliers` | `suppliers.created`, `suppliers.updated`, `suppliers.archived` |
| `files` | `files.uploaded`, `files.trashed`, `files.restored`, `files.purged` |
| `employees` | `employees.created`, `employees.updated`, `employees.archived` |
| `payroll` | `payroll.created`, `payroll.updated`, `payroll.deleted` |
| `absences` | `absences.created`, `absences.updated`, `absences.deleted` |
| `auth.lockout` | `auth.lockout.triggered` (avec source : login / mfa.challenge / mfa.recovery) |

### 6.6.3 Propriétés clés

- **Fail-soft** : un échec DB ne casse JAMAIS la requête utilisateur. Le but de
  l'audit log est *post-hoc*. Try/catch + `console.error`.
- **Scrub des secrets** : la `metadata` JSON est nettoyée avant insertion
  (passwords, tokens, secrets MFA jamais persistés). Liste blacklist :
  `password, token, totpSecret, mfaSecret, recoveryCode, imageBase64, apiKey,
  secret, authorization, cookie, …` — match insensible à la casse + tirets/_.
- **IP + UA capturées** : pour tracer geo/device en cas d'incident.
- **Profondeur scan** : MAX_DEPTH=4 (anti cycle), MAX_STRING_LEN=500 (tronqué).

### 6.6.4 Lecture

- Pas de UI de consultation pour l'instant (Sprint future).
- Accès SQL uniquement via `psql` :

```sql
SELECT created_at, event, user_id, tenant_id, metadata, ip_address
FROM audit_log
WHERE event LIKE 'auth.%'
ORDER BY created_at DESC
LIMIT 100;
```

---

## 6.7 Rate limiting / lockout

Fichiers : `server/index.ts` (rate-limit IP), `server/services/auth/lockoutService.ts`
(lockout par compte). Sprint 2 sécu/ops bonus PR #69.

### 6.7.1 Rate-limit IP

| Cible | Fenêtre | Max | Message |
|---|---|---|---|
| `/api/` (global) | 60s | 120 | "Trop de requêtes" |
| `/api/alfred/` | 60s | 20 | "Alfred a besoin d'un moment" |
| `/api/auth/user/{login,signup,forgot-password,reset-password,verify-email,mfa/challenge,mfa/recovery}` | 15 min | 10 | "Trop de requêtes, réessayez plus tard" |

`/me` et `/mfa/status` (poll légitime client) gardent uniquement le limiter
global à 120/min.

### 6.7.2 Lockout par compte

Dérivé de `audit_log` (zéro nouvelle table — capitalise sur PR #68).

| Aspect | Implémentation |
|---|---|
| Source de vérité | `audit_log` events `auth.login.failure` + `mfa.challenge.failure` + `mfa.recovery.failure` filtrés par `userId` |
| Fenêtre | 15 minutes glissantes |
| Seuil | 5 échecs |
| Réponse | 429 + `Retry-After` (secondes jusqu'à ce que le plus ancien échec sorte de la fenêtre) |
| Check | **AVANT** `verifyPassword` — sinon argon2id devient un vecteur d'amplification DoS |
| Fail-soft | Un échec DB rend l'unlock par défaut (un incident Postgres ne devient pas une DoS pour les vrais users) |
| Audit | `auth.lockout.triggered` avec metadata `{source, failureCount, retryAfterSeconds}` |
| Pure helper | `computeLockout(failures, now)` exporté → testable sans DB |

Wired sur `/login`, `/mfa/challenge`, `/mfa/recovery`. La distinction des deux
couches (IP + compte) est volontaire :
- **IP-only** ne bloque pas un attaquant distribué (botnet sur 1 compte).
- **Account-only** ne bloque pas le password spraying (1 mdp × 1000 emails depuis
  1 IP : aucun email connu = aucun userId = aucun lockout par compte).
- Les deux ensemble couvrent les deux scénarios.

### 6.7.3 Reste à faire

- **Détection enumeration** dédiée : alerte si > N erreurs « email inconnu »
  d'une même IP (le rate-limit IP couvre déjà partiellement).
- **Email alert utilisateur** lors d'un lockout (Phase 2).
- **Logout-everywhere** quand un user reset son password.

---

## 6.8 Email transactionnel

Fichier : `server/services/auth/mailService.ts`.

| Aspect | Choix |
|---|---|
| Provider | **Resend** (SDK 6.12) |
| Fail-soft | Si `RESEND_API_KEY` absent → logs stdout (dev OK), warn au boot en prod |
| Templates | verify (TTL 24h), reset password (TTL 1h) |
| `MAIL_FROM` | default `myBeez <noreply@mybeez-ai.com>` |
| `APP_BASE_URL` | requis en prod (Host-header injection guard) — utilisé pour les liens dans les emails |

---

## 6.9 Headers de sécurité

| Header | État |
|---|---|
| `helmet` | ✅ activé |
| CSP | ✅ Livré PR #84 — politique stricte en prod, désactivée en dev (HMR Vite) |
| COEP | ❌ désactivé (pas de SharedArrayBuffer) |
| HSTS côté nginx | ✅ Livré PR #84 — `max-age=31536000; includeSubDomains; preload` |
| HSTS côté helmet (defense in depth) | ✅ Livré PR #84 — mêmes paramètres, prod uniquement |
| `X-Frame-Options: DENY` | ✅ via helmet default |
| `X-Content-Type-Options: nosniff` | ✅ via helmet default |
| Referrer-Policy | ✅ via helmet default |

### 6.9.1 CSP — politique livrée PR #84

`helmet({ contentSecurityPolicy: ... })` activé en prod uniquement.
Directives :

```
default-src 'self'
script-src 'self'                  ← pas d'inline JS, Vite bundle tout vers /assets
style-src 'self' 'unsafe-inline'   ← Tailwind / Shadcn utilisent `style=` attributes
img-src 'self' data: https:        ← images Cloudinary, gravatar, base64 d'avatars
font-src 'self' data:
connect-src 'self'                 ← API + SSE même origine
frame-ancestors 'none'             ← équivalent X-Frame-Options
base-uri 'self'
form-action 'self'
object-src 'none'                  ← pas de Flash / applets
upgrade-insecure-requests
```

CSP désactivé en dev — Vite HMR injecte des scripts inline et un module
loader eval-ish que pas un nonces / hashes raisonnable ne whitelist sans
ouvrir la porte. Trade-off accepté : la production a la politique
stricte, le dev local a l'efficacité Vite.

### 6.9.2 HSTS — defense in depth

Header émis à la fois par nginx (`add_header Strict-Transport-Security`)
et par helmet (`hsts: { maxAge, includeSubDomains, preload }`). Si une
mauvaise config nginx tombe la directive, helmet rattrape. Si Cloudflare
strippe le header, nginx le réémet à chaque requête.

Le `preload` engage à long terme (le domaine entre dans la liste hardcodée
des navigateurs). À ne pas activer tant que toutes les sub-zones ne sont
pas confirmées HTTPS — pour `mybeez-ai.com` c'est OK, le wildcard
Cloudflare Origin Cert couvre tout.

### 6.9.3 HIBP check — livré PR #84

`server/services/auth/hibpService.ts` consomme l'API
[Pwned Passwords v3](https://haveibeenpwned.com/API/v3#PwnedPasswords)
en mode k-anonymity :

1. SHA-1 du password local (le password en clair n'est jamais transmis).
2. Envoi du **prefix 5 chars** au range API.
3. Réception d'une liste de suffixes locaux.
4. Match local → password pwned ou non.

Wired sur :
- `POST /api/auth/user/signup`
- `POST /api/auth/user/reset-password`
- `POST /api/onboarding/signup-with-tenant`

**Pas wired** sur l'admin create-user — le superadmin choisit, et un
HIBP roundtrip lourd n'a pas de sens dans le flux d'admin batch.

**Soft-fail** : si l'API HIBP est unreachable / lente / 5xx, on traite
le password comme "not pwned" et on laisse le flux continuer. Log warn
émis. Une panne HIBP ne doit pas bloquer un signup légitime.

**Override** : `HIBP_DISABLED=true` désactive le check entièrement
(utile pour les tests offline et un emergency disable). Tout autre
valeur → check actif.

`PASSWORD_PWNED` est le code retourné côté API (HTTP 400) avec un
message FR clair (« Ce mot de passe a été compromis dans une fuite
connue. Choisissez-en un autre. »).

---

## 6.10 Risques de sécurité priorisés

| # | Sévérité | Risque | Localisation | Effort fix | Statut |
|---|---|---|---|---|---|
| 1 | ~~🔴 critique~~ | GET checklist sans auth | `server/routes/checklist.ts` | S | ✅ #50 + #53 |
| 2 | ~~🔴 critique~~ | SSE `/api/:tenant/events` sans auth | `server/services/realtimeSync.ts` | S | ✅ #50 + #53 |
| 3 | ~~🔴 critique~~ | PIN codes stockés en clair | `tenants.pinCode/adminCode` | M | ✅ #51 hash, #55 purge complète |
| 4 | 🟡 moyen | MFA pas obligatoire pour Owner/Admin (opt-in) | politique de gate | M | partiel — implémenté #52, gating à brancher |
| 5 | 🟠 haut | FK manquantes (orphelins possibles) | items, checks, purchases, payroll, absences | M | à planifier |
| 6 | ~~🟠 haut~~ | Audit log non écrit | (à implémenter) | M | ✅ Sprint 2 (PR #68) |
| 7 | ~~🟠 haut~~ | Lockout login + rate-limit dédié `/api/auth/*` | rate-limiter | S | ✅ Sprint 2 bonus (PR #69) |
| 8 | ~~🟡 moyen~~ | CSP désactivé dans helmet | `server/index.ts` | M | ✅ Sprint 6 sécu/ops (PR #84) |
| 9 | ~~🟡 moyen~~ | Pas de HSTS côté nginx | `deploy/nginx/mybeez-ai.com.conf` | XS | ✅ Sprint 6 sécu/ops (PR #84) |
| 10 | 🟡 moyen | Cache `tenantService` process-local | `services/tenantService.ts` | M | scale-out future |
| 11 | ~~🟡 moyen~~ | Pas de check HIBP | `auth/passwordService.ts` | S | ✅ Sprint 6 sécu/ops (PR #84) |
| 12 | 🟡 moyen | `db:push` sans migrations versionnées | `drizzle.config.ts` | M | scale-out future |
| 13 | ~~🟡 moyen~~ | Pas de healthcheck Docker `app` | `Dockerfile`, `docker-compose.yml` | XS | ✅ Sprint 3 sécu/ops (PR #70) |
| 14 | 🟡 moyen | Pas de logs structurés / persistence | `server/index.ts` | M | Sprint 5 sécu/ops |
| 15 | ~~🟢 faible~~ | Routes Alfred slug en body | `server/routes/alfred.ts` | S | ✅ #54 |
| 16 | ~~🟢 faible~~ | Code mort `services/auth.ts` | — | XS | ✅ #55 |
| 17 | 🟢 faible | Drop SQL définitif `tenants.pin_code/admin_code` | migration script | XS | différé (deploy.sh non interactif) |
| 18 | 🟡 moyen | Pas de chiffrement des dumps R2 | `scripts/backup-postgres.ts` | M | à planifier |
| 19 | 🟡 moyen | Pas de CSRF token | `server/index.ts` | S | acceptable tant que pas de form cross-origin |

---

## 6.11 RGPD / compliance

| Aspect | État |
|---|---|
| Consentement explicite (CGU) au signup | 🟡 case à cocher, pas de versioning |
| Right to be forgotten (suppression compte + cascade) | 🟡 partiel (cascade FK incomplet : items, checks, purchases sans FK) |
| Right to data portability (export) | ❌ pas d'export JSON utilisateur |
| Audit trail accès données employés/payroll | ✅ via audit_log (à finaliser pour les modules HR Sprint 3-4) |
| DPA / sous-traitants | À documenter (Resend, OpenAI, Cloudflare R2, Hetzner) |

---

## 6.12 Variables d'environnement liées à la sécurité

| Var | Requis | Effet |
|---|---|---|
| `SESSION_SECRET` | ✅ fatal en prod | exit 1 si absent |
| `APP_BASE_URL` | ✅ fatal en prod | exit 1 si absent (Host-header guard) |
| `SUPERADMIN_TOKEN` | ⚠️ ≥16 chars | sinon `/api/tenants/*` répond 503 |
| `ROOT_DOMAINS` | — | default `mybeez-ai.com,localhost` |

Cf. [chapitre 10 — cheatsheet](./10-cheatsheet.md) pour la liste complète.

---

*Suite du livre → [07-modules-metier.md](./07-modules-metier.md)*
