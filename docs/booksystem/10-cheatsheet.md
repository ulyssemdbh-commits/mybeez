# Chapitre 10 — Cheatsheet

> **Résumé.** Référence rapide pour les commandes du quotidien (dev local,
> tests, deploy, backup, ops Hetzner), les variables d'environnement, les
> routes API les plus utilisées, et le glossaire technique.

---

## 10.1 Commandes locales

### 10.1.1 Setup initial

```bash
git clone https://github.com/ulyssemdbh-commits/mybeez.git
cd mybeez
npm install
cp .env.example .env  # remplir DATABASE_URL au minimum
npm run db:push       # sync schéma vers la DB locale
npm run seed:templates
```

### 10.1.2 Dev courant

| Commande | Quoi |
|---|---|
| `npm install` | Installation deps |
| `npm run dev` | Dev server (Express + Vite) — Windows : voir 10.1.3 |
| `npm run check` | Typecheck (`tsc`, noEmit) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint avec auto-fix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI) |
| `npm test` | Vitest run (one-shot) |
| `npm run test:watch` | Vitest watch |
| `npm run build` | Build prod : front Vite + back esbuild |
| `npm run start` | Lance bundle prod (`node dist/index.cjs`) |

### 10.1.3 Dev sous Windows / PowerShell

Le script `dev` utilise la syntaxe Unix `NODE_ENV=development tsx ...`. En
PowerShell :

```powershell
$env:NODE_ENV="development"; npx tsx server/index.ts
```

Ou ajouter `cross-env` aux deps et préfixer `cross-env NODE_ENV=development tsx ...`.

### 10.1.4 DB / migrations

| Commande | Quoi |
|---|---|
| `npm run db:push` | Sync du schéma Drizzle vers la DB (destructif si `--force`) |
| `npm run seed:templates` | Upsert idempotent du catalogue verticals |

### 10.1.5 Backups (locaux)

| Commande | Quoi |
|---|---|
| `npm run backup` | Dump Postgres → gzip → R2 + retention sweep |
| `npm run restore` | Liste les 20 dumps R2 les plus récents |
| `npm run restore -- latest` | Dry-run restore du dernier dump |
| `npm run restore -- <key>` | Dry-run restore d'un dump spécifique |
| `RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING npm run restore -- latest` | Vraie restore (écrase la DB cible) |

### 10.1.6 Bootstrap admin

```bash
# Une fois un user créé via signup, le promouvoir superadmin :
npx tsx scripts/grant-superadmin.ts <email>
```

---

## 10.2 Variables d'environnement

| Var | Requis | Effet |
|---|---|---|
| `DATABASE_URL` | ✅ | postgres://... (sinon warn boot) |
| `SESSION_SECRET` | ✅ fatal en prod | exit 1 si absent |
| `APP_BASE_URL` | ✅ fatal en prod | exit 1 si absent (Host-header guard, ex. `https://mybeez-ai.com`) |
| `POSTGRES_PASSWORD` | ✅ | DB Docker |
| `SUPERADMIN_TOKEN` | ⚠️ ≥16 chars | sinon `/api/tenants/*` répond 503 |
| `ROOT_DOMAINS` | — | default `mybeez-ai.com,localhost` |
| `RESEND_API_KEY` | optionnel | sinon emails loggués stdout (dev) |
| `MAIL_FROM` | optionnel | default `myBeez <noreply@mybeez-ai.com>` |
| `OPENAI_API_KEY` | ≥1 AI key | provider AI primary |
| `GEMINI_API_KEY` | ≥1 AI key | fallback secondaire |
| `XAI_API_KEY` | ≥1 AI key | fallback tertiaire |
| `R2_ENDPOINT` | optionnel | endpoint R2 (e.g. `https://<account>.r2.cloudflarestorage.com`) |
| `R2_BUCKET` | optionnel | `r2mybeez` |
| `R2_PREFIX` | optionnel | `mybeezdb/` |
| `R2_ACCESS_KEY_ID` | optionnel | token R2 |
| `R2_SECRET_ACCESS_KEY` | optionnel | secret R2 |
| `BACKUP_RETENTION_DAYS` | optionnel | default 30 |
| `PORT` | optionnel | default 3000 |
| `NODE_ENV` | — | `development` ou `production` |

Modèle complet : `.env.example` (à la racine du repo).

---

## 10.3 Déploiement Hetzner

### 10.3.1 Re-déploiement courant

```bash
ssh root@65.21.209.102 "cd /opt/mybeez && bash deploy/deploy.sh"
```

### 10.3.2 Logs

```bash
# App live
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose logs -f app"

# DB live
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose logs -f db"

# nginx access + error
ssh root@65.21.209.102 "tail -f /var/log/nginx/access.log /var/log/nginx/error.log"
```

### 10.3.3 DB shell

```bash
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose exec -T db psql -U mybeez -d mybeez"
```

### 10.3.4 Backup manuel

```bash
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose exec -T app npm run backup"
```

### 10.3.5 Restart sans rebuild

```bash
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose restart app"
```

### 10.3.6 Inspection healthcheck

```bash
curl https://mybeez-ai.com/api/health
# → { status: "ok", service: "mybeez", version: "2.0.0", uptime: ..., sse: {...}, ai: {...} }
```

---

## 10.4 Conventions Git

### 10.4.1 Branches

- `feat/*` — nouvelle feature
- `fix/*` — bug fix
- `refactor/*` — refonte sans changement comportement
- `chore/*` — outillage, deps, ops
- `docs/*` — documentation seule

### 10.4.2 Commits

Conventional Commits :
- `feat:` — feature
- `fix:` — bug fix
- `refactor:` — refonte
- `chore:` — outillage
- `docs:` — docs
- `test:` — tests seuls
- `ci:` — CI seule

### 10.4.3 Merge

- **Squash** sur `main` (toujours).
- Pas de force-push sur `main`.
- Pas de `--no-verify` sauf demande explicite.

---

## 10.5 Routes API les plus utilisées

```
# Auth
POST   /api/auth/user/signup                 self-serve user
POST   /api/auth/user/login                  email + password (+ MFA si activé)
POST   /api/auth/user/logout
GET    /api/auth/user/me                     session courante + tenants
POST   /api/auth/user/verify-email           consume verify token
POST   /api/auth/user/forgot-password        toujours 202 (anti-énum)
POST   /api/auth/user/reset-password         consume reset token

# MFA
GET    /api/auth/user/mfa/status
POST   /api/auth/user/mfa/setup              QR + 10 recovery codes (affichés une fois)
POST   /api/auth/user/mfa/confirm            valide TOTP, marque confirmedAt
POST   /api/auth/user/mfa/disable
POST   /api/auth/user/mfa/challenge          finit le login si MFA actif
POST   /api/auth/user/mfa/recovery           code single-use
POST   /api/auth/user/mfa/cancel

# Onboarding
GET    /api/onboarding/check-slug            validation slug + suggestion
POST   /api/onboarding/signup-with-tenant    self-serve user + tenant + Owner

# Catalog (public)
GET    /api/templates                        verticals + sub-templates
GET    /api/templates/:slug                  détail + enfants

# Admin (superadmin nominatif)
GET    /api/admin/stats
GET    /api/admin/users[?...]
POST   /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/send-reset
GET    /api/admin/tenants[?...]
PATCH  /api/admin/tenants/:id
DELETE /api/admin/tenants/:id
GET    /api/admin/tenants/:id/detail
POST   /api/admin/tenants/:id/members
PATCH  /api/admin/tenants/:id/members/:userId
DELETE /api/admin/tenants/:id/members/:userId

# Admin Bearer (legacy, à retirer)
GET    /api/tenants                          Bearer SUPERADMIN_TOKEN
POST   /api/tenants                          idem
PATCH  /api/tenants/:id                      idem

# Checklist (RBAC matrice)
GET    /api/checklist/:slug/categories       READ
GET    /api/checklist/:slug/dashboard        READ
POST   /api/checklist/:slug/toggle           STAFF
POST   /api/checklist/:slug/comments         STAFF
POST   /api/checklist/:slug/reset            MANAGE
POST   /api/checklist/:slug/items            MANAGE
PATCH  /api/checklist/:slug/items/:id        MANAGE
DELETE /api/checklist/:slug/items/:id        MANAGE

# Alfred (tous rôles tenant)
POST   /api/alfred/:slug/chat
POST   /api/alfred/:slug/analyze
POST   /api/alfred/:slug/clear

# Management
GET    /api/management/:slug/template        tous tenant rôles
PATCH  /api/management/:slug/template        owner/admin
GET    /api/management/:slug/settings/vocabulary  tous
PATCH  /api/management/:slug/settings/vocabulary  owner/admin
GET    /api/management/:slug/settings/modules     tous
PATCH  /api/management/:slug/settings/modules     owner/admin
GET    /api/management/:slug/suppliers       READ
POST   /api/management/:slug/suppliers       owner/admin/manager
GET    /api/management/:slug/purchases       READ
POST   /api/management/:slug/purchases       owner/admin/manager
POST   /api/management/:slug/purchases/parse-invoice  owner/admin/manager
GET    /api/management/:slug/expenses        READ
POST   /api/management/:slug/expenses        owner/admin/manager
GET    /api/management/:slug/files           READ
POST   /api/management/:slug/files           owner/admin/manager (multipart)
GET    /api/management/:slug/files/:id/download  READ
DELETE /api/management/:slug/files/:id       owner/admin/manager (soft → trash)
GET    /api/management/:slug/files/trash     READ
POST   /api/management/:slug/files/trash/:id/restore  owner/admin/manager
DELETE /api/management/:slug/files/trash/:id          owner/admin/manager (hard)
POST   /api/management/:slug/files/send-email-bulk    owner/admin/manager (V2 hook PR #79 — body {to, fileIds[], subject?, message?})

# RH (PR #72 backend + PR #76 UI)
GET    /api/management/:slug/employees/summary  READ (stats dashboard RH)
GET    /api/management/:slug/employees          READ (?activeOnly=true)
POST/PATCH/DELETE /api/management/:slug/employees/:id   owner/admin/manager (DELETE = soft isActive=false)
GET    /api/management/:slug/payroll          READ (?period=YYYY-MM&employeeId=N)
POST/PATCH/DELETE /api/management/:slug/payroll/:id     owner/admin/manager (POST 409 si duplicate employee+month)
POST   /api/management/:slug/payroll/import-pdf         owner/admin/manager (V2 hook PR #81 — body {pdfBase64, originalName, mimeType, autoCreateEmployee?})
POST   /api/management/:slug/payroll/reparse-all        owner/admin/manager (V2 hook PR #81 — itère files RH non liés, cap 50/run)
GET    /api/management/:slug/absences         READ (?employeeId=N&from=&to=)
POST/PATCH/DELETE /api/management/:slug/absences/:id    owner/admin/manager

# Realtime
GET    /api/:slug/events                     SSE (tous rôles tenant)

# Health
GET    /api/health                           uptime + SSE stats + AI flags
```

---

## 10.6 Glossaire technique

| Terme | Définition |
|---|---|
| **Tenant** | Compte client. Une row dans `tenants`. Cf. [01.6](./01-vision-et-fondations.md#16-glossaire-m%C3%A9tier). |
| **Template** | Archétype d'activité (sub-template d'un vertical). |
| **Vertical** | Catégorie top-level de templates (4 au 2026-05-08). |
| **User** | Personne réelle, compte nominatif (cross-tenant). |
| **Role tenant** | `owner > admin > manager > staff > viewer`, dans `user_tenants.role`. |
| **Superadmin** | `users.isSuperadmin = true` — équipe interne myBeez. ≠ `SUPERADMIN_TOKEN` Bearer legacy. |
| **MFA pending** | Session half-baked entre password et TOTP/recovery, TTL 5 min. |
| **Slug** | Nom URL-friendly du tenant (`valentine`, `meyer`). UNIQUE. |
| **Client code** | Code 8 chiffres généré au signup, montré à l'utilisateur (pas un secret). |
| **Module** | Bloc fonctionnel toggleable par tenant via `tenants.modulesEnabled`. |
| **Vocabulary** | JSON par tenant qui réécrit les libellés UI (ex. « items » → « plats »). |
| **Tax rules** | JSON dans `business_templates.taxRules` : `defaultTvaRate`, `tvaRates[]`. |
| **READ_ROLES** | `[owner, admin, manager, staff, viewer]` — convention dans tous les routes management |
| **WRITE_ROLES** | `[owner, admin, manager]` — convention dans tous les routes management |
| **Soft-delete** | DELETE flippe `isActive = false`. La row reste pour traçabilité (purchases, expenses, suppliers, items, employees). |
| **Hard-delete** | Suppression physique. Réservé aux fichiers trash après TTL. |
| **Trash TTL** | 7 jours sur `files_trash`. Au-delà → purge auto via `scheduleTrashPurge()`. |
| **SSE** | Server-Sent Events, canal `/api/:slug/events` pour la sync temps réel. |
| **Alfred** | Assistant IA. URL `/api/alfred/:slug/*`. Provider chain OpenAI → Gemini → Grok. |
| **OCR / parse-invoice** | Vision API extrait les champs facture (image/PDF) + auto-match supplier. Endpoint `/purchases/parse-invoice`. |
| **Audit log** | Table `audit_log`, événements `domain.action.outcome` kebab-case. Writes via `recordAudit({ req, event, metadata })`. |
| **`tid`** | Convention abréviation `req.tenantId!` dans les handlers. |
| **`db:push`** | `drizzle-kit push` — sync direct schéma → DB, pas de migrations versionnées. |
| **R2** | Cloudflare R2 (S3-compatible). Backups Postgres + fichiers utilisateurs. ≠ DB. |
| **CF Origin Cert** | Cloudflare Origin Certificate, 15 ans, apex + wildcard, posé `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}`. |
| **CJS bundle** | Le backend est bundlé en CJS via esbuild. `import.meta.dirname` undefined → utiliser `process.cwd()`. |
| **`*.localhost`** | Dev local : RFC 6761 résout vers 127.0.0.1, donc `valentine.localhost:3000` ⇒ tenant `valentine`. |
| **~~PIN code~~** | ⚠ Retiré PR #55. Le PIN-on-tablet Phase-2 sera reconstruit comme un per-staff device-paired token. |

---

## 10.7 Pointeurs externes

| Ressource | URL / chemin |
|---|---|
| Repo GitHub | https://github.com/ulyssemdbh-commits/mybeez |
| Prod | https://mybeez-ai.com |
| Cloudflare account | `c6d762e456464de419619694dfa83b8d` |
| Hetzner host | `65.21.209.102` (root SSH) |
| Path Hetzner | `/opt/mybeez/` |
| R2 bucket | `r2mybeez`, prefix `mybeezdb/` |
| Email provider | Resend (https://resend.com/) |
| AI providers | OpenAI, Google AI Studio (Gemini), x.ai (Grok) |
| ulysseclaude (source d'inspiration) | `C:\Users\meyer\ulysseclaude`, deployed `moe.ulyssepro.org` |
| macommande (sister project) | `C:\Users\meyer\macommande`, deployed `macommande.shop` |

---

## 10.8 Quick recipes

### 10.8.1 Créer un tenant local pour tester

```bash
# 1. Signup user via UI : http://localhost:3000/auth/signup
# 2. Promote superadmin :
npx tsx scripts/grant-superadmin.ts <email>
# 3. Créer un tenant via /123admin (UI) ou via API onboarding
```

### 10.8.2 Tester un subdomain en local

```bash
# Aucune config /etc/hosts nécessaire (RFC 6761) :
curl http://valentine.localhost:3000/api/health
```

### 10.8.3 Reset MFA d'un user (urgence support)

```sql
-- Via psql en prod, après vérification d'identité :
DELETE FROM mfa_secrets WHERE user_id = <id>;
-- L'user pourra re-setup au prochain login.
```

### 10.8.4 Dégager une session bloquée

```sql
DELETE FROM user_sessions WHERE sess::text LIKE '%"userId":<id>%';
```

### 10.8.5 Trouver toutes les requêtes Drizzle qui filtrent par tenant

```bash
# Pour audit cross-table (vérifier qu'aucune route ne contourne) :
grep -rn "tenantId" server/routes/ | grep -v "test" | grep -v "node_modules"
```

### 10.8.6 Snapshot rapide état repo

```bash
git -C C:\Users\meyer\mybeez status -sb
git -C C:\Users\meyer\mybeez log --oneline -10
```

---

## 10.9 Notes pour Claude / contributeur IA

À chaque session :

1. **Lire** `docs/booksystem/README.md` puis le chapitre concerné.
2. **Lire** `CLAUDE.md` (zone sensible).
3. Avant tout refactor multi-tenant : `grep` pour vérifier qu'aucune nouvelle
   requête ne contourne `tenantId`.
4. Avant de toucher à un service AI : vérifier la chaîne fallback dans
   `services/core/openaiClient.ts`.
5. **Mettre à jour** le booksystem en fin de session si quelque chose de
   structurel a changé (nouveau module, nouveau schema, nouvelle route majeure,
   dette résolue). En particulier le chapitre [09](./09-roadmap-et-synthese.md)
   à chaque sprint terminé.
6. Privilégier la **suppression de code mort** plutôt que l'ajout, sauf
   demande explicite.

---

*Fin du livre. ← [Retour au préambule](./README.md)*
