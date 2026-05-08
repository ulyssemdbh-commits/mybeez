# Chapitre 08 — Ops et déploiement

> **Résumé.** Hetzner AX422 mutualisé, nginx host-installed, Docker Compose
> (app Node 20-alpine + Postgres 16-alpine) avec healthcheck app sur `/api/health`
> (PR #70), Cloudflare proxy + Origin Cert, CI GitHub Actions (typecheck +
> lint + test + build), backups Postgres → R2 en streaming avec retention,
> cron systemd `mybeez-backup.timer` daily 03:15 (PR #70). Reste à brancher :
> logger structuré pino, metrics Prometheus, Sentry.

---

## 8.1 Hetzner / nginx

### 8.1.1 Host

| Aspect | Valeur |
|---|---|
| Machine | Hetzner AX422 dédiée |
| IP | `65.21.209.102` |
| Mutualisée avec | macommande, ulyssepro.org, moe.ulyssepro.org, autres apps Node/Python |
| Path mybeez | `/opt/mybeez/` |
| Port app | `127.0.0.1:3000` (libre, vérifié dans `reference_mybeez_hetzner` mémoire) |
| Port db | `127.0.0.1:5434` (5433 = macommande) |

### 8.1.2 nginx vhost

Fichier : `deploy/nginx/mybeez-ai.com.conf` (versionné dans le repo, symlinké
en `/etc/nginx/sites-enabled/mybeez-ai.com.conf` au déploiement initial).

Convention :

```nginx
upstream mybeez_app { server 127.0.0.1:3000; }

server {
  listen 80;
  server_name mybeez-ai.com *.mybeez-ai.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name mybeez-ai.com *.mybeez-ai.com;

  ssl_certificate     /etc/ssl/cloudflare/mybeez-ai.com.pem;
  ssl_certificate_key /etc/ssl/cloudflare/mybeez-ai.com.key;
  ssl_protocols TLSv1.2 TLSv1.3;

  client_max_body_size 50M;  # uploads files (50 MB max)

  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # WebSocket / SSE
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;  # 24h pour SSE

  location / {
    proxy_pass http://mybeez_app;
  }
}
```

### 8.1.3 Cloudflare

| Setting | Valeur |
|---|---|
| Proxy | ON (orange cloud) sur apex + wildcard |
| SSL mode | **Full (strict)** — pas Flexible |
| Origin Cert | 15 ans, apex + wildcard, posé `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}` |
| DNS | apex `mybeez-ai.com` + wildcard `*.mybeez-ai.com` → 65.21.209.102 |

> ⚠️ Si Cloudflare passe en **Flexible** par erreur, le browser sert HTTPS
> mais l'app reçoit du HTTP → cookie `secure: true` ne sera jamais envoyé,
> sessions cassées.

---

## 8.2 Docker

### 8.2.1 Dockerfile

Multi-stage, Node 20 alpine. Versionné dans le repo.

| Stage | Rôle |
|---|---|
| `builder` | `npm ci`, `npm run build` (Vite + esbuild) |
| `runner` | Copie `dist/`, `node_modules/`, `package.json`, `drizzle.config.ts`, `shared/` (nécessaires pour `db:push` au boot) |

> **Piège connu** (PR #19) : ne PAS oublier de copier `drizzle.config.ts` +
> `shared/` dans le runner stage, sinon `drizzle-kit` échoue à `db:push`.

User : `node` (default, non-root). Pas explicitement re-déclaré (à durcir).

### 8.2.2 docker-compose.yml

Versionné dans le repo. 2 services :

```yaml
services:
  app:
    build: .
    ports: ["127.0.0.1:3000:3000"]
    env_file: .env.production
    networks: [mybeez-net]
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      # Pings /api/health via le runtime Node embarqué (pas de curl/wget
      # dans node:20-alpine). PR #70.
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3

  db:
    image: postgres:16-alpine
    ports: ["127.0.0.1:5434:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: mybeez
      POSTGRES_USER: mybeez
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mybeez -d mybeez"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [mybeez-net]

volumes:
  pgdata:

networks:
  mybeez-net:
    driver: bridge
```

### 8.2.3 État

| Aspect | État |
|---|---|
| Multi-stage Dockerfile | ✅ |
| `.dockerignore` complet | ✅ |
| Service `db` healthcheck | ✅ |
| Volume `pgdata` persistant | ✅ |
| Network bridge isolé | ✅ |
| Service `app` HEALTHCHECK | ✅ PR #70 (ping `/api/health` via Node embarqué) |
| User non-root explicite | ❌ (utilise `node` par défaut, à expliciter) |

---

## 8.3 Deploy

### 8.3.1 Script `deploy/deploy.sh`

Idempotent. Steps :

1. `git pull` sur main (ou la branche checkée-out).
2. `docker compose up -d --build` — rebuild + restart.
3. Wait healthcheck db.
4. `docker compose exec -T app npm run db:push` — sync schéma.
5. `nginx -t && systemctl reload nginx`.

### 8.3.2 Rollback

Manuel. Procédure :

```bash
ssh root@65.21.209.102 'cd /opt/mybeez && git log --oneline -10'
ssh root@65.21.209.102 'cd /opt/mybeez && git reset --hard <previous-sha>'
ssh root@65.21.209.102 'cd /opt/mybeez && bash deploy/deploy.sh'
```

> ⚠️ Pas de tag versioning automatique. Si rollback nécessaire après une
> migration destructive, restore Postgres depuis R2 via `npm run restore`.

### 8.3.3 Re-déploiement courant

```bash
ssh root@65.21.209.102 "cd /opt/mybeez && bash deploy/deploy.sh"
```

### 8.3.4 Premier déploiement (one-time)

Documenté dans `CLAUDE.md` §9 :

1. `git clone https://github.com/ulyssemdbh-commits/mybeez.git /opt/mybeez`
2. `cp .env.production.example .env.production` puis remplir secrets
   (utiliser `deploy/init-secrets.sh` qui auto-génère SESSION_SECRET,
   SUPERADMIN_TOKEN, POSTGRES_PASSWORD).
3. Poser le Cloudflare Origin Cert : `/etc/ssl/cloudflare/mybeez-ai.com.{pem,key}`.
4. Symlink vhost : `ln -s /opt/mybeez/deploy/nginx/mybeez-ai.com.conf /etc/nginx/sites-enabled/`.
5. `cd /opt/mybeez && bash deploy/deploy.sh`.

### 8.3.5 Pièges connus

| # | Piège | Fix |
|---|---|---|
| 1 | `import.meta.dirname` undefined dans bundle CJS | PR #18 : fallback `process.cwd()` côté serveur |
| 2 | `drizzle-kit push` échoue dans le container : `drizzle.config.ts` absent | PR #19 : Dockerfile runner copie `drizzle.config.ts` + `shared/` |
| 3 | `nano` édite `.env.production` et inclut la commande shell dans le buffer | Vérifier la dernière ligne après save : `unexpected character in variable name` au boot |
| 4 | Cloudflare en mode Flexible → cookies `secure` jamais envoyés | Forcer Full strict, vérifier en dashboard CF |
| 5 | `APP_BASE_URL` ou `SESSION_SECRET` manquants en prod | Boot fail (`process.exit(1)`) — c'est intentionnel (Host-header injection guard) |

---

## 8.4 Backups

Fichier : `scripts/backup-postgres.ts`, `scripts/restore-postgres.ts`.

### 8.4.1 Pipeline backup

```
pg_dump --no-owner --no-privileges
  | gzip
  | upload multipart vers R2
    (bucket r2mybeez, key mybeezdb/YYYY-MM-DD/postgres-YYYY-MM-DDTHH-MM-SS.sql.gz)
```

- **Streaming** (constant memory).
- **Retention auto** : `BACKUP_RETENTION_DAYS` (default 30). Foreign objects
  jamais supprimés (parsing strict de la key).
- **Logs** : passwords masqués.
- ❌ **Pas de chiffrement R2** (côté serveur ou client) — à planifier.

### 8.4.2 Pipeline restore

```bash
# Liste les 20 dumps les plus récents
npm run restore

# Dry-run (default)
npm run restore -- latest
npm run restore -- mybeezdb/2026-05-08/postgres-2026-05-08T03-00-00.sql.gz

# Réellement écraser la DB
RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING npm run restore -- latest
```

### 8.4.3 Cron systemd

✅ **Livré en PR #70** (`deploy/systemd/`). Units versionnées dans le repo.

Schedule : **daily 03:15 host-local**, fenêtre randomisée 30 min
(`RandomizedDelaySec=1800`) pour smoother la charge si d'autres apps du host
backupent au même moment. `Persistent=true` pour catch-up si le host était
offline au scheduled.

```ini
# deploy/systemd/mybeez-backup.service
[Unit]
Description=myBeez Postgres backup to R2
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/mybeez
ExecStart=/usr/bin/docker compose exec -T app npm run backup
Restart=no                  # next timer firing retries; pas de boucle d'échec
TimeoutStartSec=900

# deploy/systemd/mybeez-backup.timer
[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=1800
Persistent=true
Unit=mybeez-backup.service

[Install]
WantedBy=timers.target
```

**Install one-time** sur le host (cf. `deploy/systemd/README.md`) :

```bash
sudo cp /opt/mybeez/deploy/systemd/mybeez-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mybeez-backup.timer
systemctl list-timers mybeez-backup.timer    # vérifier next firing
```

Failure mode : `Restart=no` est intentionnel — le prochain firing retry. Une
panne persistante se signale par (a) `journalctl -u mybeez-backup.service`
non-zero exit, (b) la listing R2 `mybeezdb/` qui n'avance pas au-delà de 24h.

### 8.4.4 R2 bucket

| Aspect | Valeur |
|---|---|
| Bucket | `r2mybeez` |
| Préfixe backups DB | `mybeezdb/` |
| Préfixe fichiers utilisateurs | `files/{tenantId}/` (Files module PR #71) |
| Account | `c6d762e456464de419619694dfa83b8d` |
| Token | `mybeez-prod` IP-restricted au host |

> **R2 ≠ DB.** R2 est S3-compatible, c'est où les dumps atterrissent. Postgres
> reste sur Hetzner NVMe. Toute confusion future avec « héberger la DB sur R2 »
> doit être tranchée vers backups offsite.

---

## 8.5 CI/CD

Fichier : `.github/workflows/ci.yml`.

| Step | Cmd |
|---|---|
| 1 | `actions/checkout@v4` |
| 2 | `setup-node@v4` (Node 20, cache npm) |
| 3 | `npm ci` |
| 4 | `npm run check` (typecheck) |
| 5 | `npm run lint` |
| 6 | `npm test` (vitest) |
| 7 | `npm run build` |

Déclenchée sur push `main` + PR vers `main`. Bloque le merge si une étape échoue.

### 8.5.1 Pas de CD automatique

Le déploiement reste **manuel** via SSH. C'est volontaire :
- Pas de risque de déploy sauvage sur une migration destructive.
- L'opérateur valide la PR mergée avant de pousser.

À ré-évaluer Phase 2 (CD vers staging avec smoke tests, prod gardée manuelle).

### 8.5.2 Branch protection

Convention sur `main` :
- PR obligatoire (pas de push direct).
- CI verte requise avant merge.
- 1 review ou self-merge OK selon protocole (l'utilisateur est seul mainteneur).
- Squash-merge.
- ⚠️ Branch protection à configurer côté GitHub repo (assumée, à vérifier
  périodiquement).

---

## 8.6 Tests

### 8.6.1 Vitest

15 fichiers de test, ~150 tests au 2026-05-08.

| Zone | Couvre |
|---|---|
| `scripts/__tests__/backup.test.ts` | Pipeline backup (key, retention, sort) |
| `server/__tests__/smoke.test.ts` | Boot Express OK |
| `server/middleware/__tests__/{auth,mfaPending,requireUserAndRole}.test.ts` | Middlewares auth |
| `server/services/__tests__/domainService.test.ts` | Résolution host + cache TTL |
| `server/services/auth/__tests__/*.test.ts` | passwordService, tokenService, mailService, mfaService, auditService |
| `server/services/alfred/__tests__/alfredService.test.ts` | History, prompt |
| `server/services/parsing/__tests__/invoiceParser.test.ts` | Vision API mock + matchSupplierByName |
| `server/services/files/__tests__/{naming,trashService}.test.ts` | Sanitisation + TTL purge |
| `server/seed/__tests__/templates.test.ts` | Catalog richness + presentation invariants |
| `client/src/components/templates/__tests__/IconRenderer.test.tsx` | Whitelist Lucide |
| `client/src/lib/__tests__/taxRulesLabels.test.ts` | Helpers UI taux TVA |
| `shared/schema/__tests__/users.test.ts` | Validation insertUser |
| `shared/__tests__/modules.test.ts` | Registre modules toggleable |

### 8.6.2 Trous de couverture

- Routes API en intégration (zero test E2E sur les routes).
- Tenant isolation cross-table (pas de test qui valide qu'une route ne fuite
  pas un autre tenant).
- SSE end-to-end.
- Frontend (uniquement IconRenderer + taxRulesLabels).
- Modules métier UI (PurchasesSection, ExpensesSection, …).

### 8.6.3 Stratégie

Ajouter progressivement des tests d'intégration sur les routes sensibles
(auth, RBAC, tenant scoping) plutôt qu'une refonte massive. Les tests
unitaires sur services purs (passwordService, tokenService, audit scrub)
restent la base solide.

---

## 8.7 Lint / Format

### 8.7.1 ESLint

Flat config 9 (`eslint.config.js`). Recommended TS + React + react-hooks.

| Règle | Niveau |
|---|---|
| `no-explicit-any` | warn |
| `no-unused-vars` | warn (pattern `^_`) |
| `react/prop-types` | off (TS) |
| Convention args underscored | warn |

### 8.7.2 Prettier

Config dans `package.json` ou `.prettierrc` :

| Setting | Valeur |
|---|---|
| `printWidth` | 100 |
| `singleQuote` | false |
| `trailingComma` | all |

### 8.7.3 Hooks pre-commit

❌ **Pas de Husky / lint-staged**. Repose sur la CI pour bloquer les régressions.

> **Trade-off.** Pre-commit hooks = friction locale, peuvent être bypassés
> avec `--no-verify`. La CI bloque définitivement. Pas de besoin urgent
> d'ajouter Husky.

---

## 8.8 Observabilité

| Aspect | État |
|---|---|
| `/api/health` (uptime, SSE stats, AI provider flags) | ✅ |
| Logger structuré (pino, winston, …) | ❌ `console.log` only, préfixes `[Module]` (Sprint 5 sécu/ops) |
| Metrics (Prometheus, OpenTelemetry) | ❌ (Sprint 7 sécu/ops) |
| Alerting | ❌ |
| `process.on("uncaughtException"/"unhandledRejection")` | ✅ logs stderr |
| Persistence logs (ELK, Datadog, Loki…) | ❌ |
| Sentry frontend | ❌ (Sprint 7 sécu/ops) |

### 8.8.1 Plan Sprint 5 — pino

Migration vers pino :
- Stdout JSON structuré.
- Niveaux trace/debug/info/warn/error/fatal.
- Champs auto : `time`, `level`, `pid`, `hostname`.
- Champs contextuels : `tenantId`, `userId`, `route`, `requestId`.
- Couplage léger : `pino-pretty` en dev, JSON brut en prod.
- Persistence via redirection stdout → fichier ou agent (à choisir).

### 8.8.2 Plan Sprint 7 — Prometheus + Sentry

- `prom-client` : `/metrics` (latence par route, error rate, DB pool stats,
  process metrics).
- Sentry frontend : capture erreurs JS + traces React.
- Alerting via Alertmanager ou Cloudflare/BetterStack (à décider).

---

## 8.9 Logs en prod (manuels)

```bash
# Logs app (live tail)
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose logs -f app"

# Logs db
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose logs -f db"

# Logs nginx
ssh root@65.21.209.102 "tail -f /var/log/nginx/access.log /var/log/nginx/error.log"

# DB shell
ssh root@65.21.209.102 "cd /opt/mybeez && docker compose exec -T db psql -U mybeez -d mybeez"
```

---

*Suite du livre → [09-roadmap-et-synthese.md](./09-roadmap-et-synthese.md)*
