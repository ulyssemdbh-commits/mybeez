# scripts/migrations/

Scripts SQL manuels exécutés hors du flow `drizzle-kit push`. Réservés aux
opérations destructives (drop de colonnes/tables, renames non-additifs) que
`db:push` non-interactif refuserait sans `--force`, et que `db:push --force`
ferait silencieusement (interdit en prod, cf. memory `reference_mybeez_hetzner`).

## Convention

Un fichier par migration : `YYYY-MM-DD-<slug>.sql`. Chaque script :
- ouvre une `BEGIN` / `COMMIT` (atomicité)
- contient des pre-flight assertions (refuse l'exécution si l'état attendu
  n'est pas réuni)
- est idempotent (`IF EXISTS` / `IF NOT EXISTS`)
- documente sa raison d'être en commentaire en tête

## Procédure d'exécution (prod Hetzner)

### 1. Backup frais

```bash
ssh root@65.21.209.102
cd /opt/mybeez
docker compose exec -T app npm run backup
```

Vérifier qu'un dump récent (< 5 min) est apparu dans R2 :
```bash
docker compose exec -T app npm run restore | head -5
```

### 2. Pre-flight queries

Vérifier l'état attendu **avant** d'exécuter le script. Par exemple pour
`2026-05-19-drop-legacy.sql` :

```bash
docker compose exec -T db psql -U mybeez -d mybeez <<'EOF'
SELECT 'bank_entries' AS t, COUNT(*) FROM bank_entries
UNION ALL SELECT 'cash_entries', COUNT(*) FROM cash_entries
UNION ALL SELECT 'tenants_with_pin', COUNT(*) FROM tenants WHERE pin_code IS NOT NULL OR admin_code IS NOT NULL;
EOF
```

Si les comptes sont conformes au plan documenté en tête du script, continuer.
Sinon **stopper** et investiguer.

### 3. Copier le script sur le host

Soit via SCP, soit en passant par git (le script vit dans le repo) :

```bash
# Le script est déjà dans /opt/mybeez/scripts/migrations/ après un git pull
docker compose exec -T db psql -U mybeez -d mybeez \
  -v ON_ERROR_STOP=1 \
  -1 \
  -f /tmp/migration.sql
```

Note : `psql -1` force le mode single-transaction (équivalent à un `BEGIN`
implicite englobant). Combiné au `BEGIN` interne du script, on garde une
transaction mais avec une garantie supplémentaire côté psql lui-même.

Alternative en copiant via heredoc (pas besoin de SCP) :

```bash
cat scripts/migrations/2026-05-19-drop-legacy.sql | \
  docker compose exec -T db psql -U mybeez -d mybeez -v ON_ERROR_STOP=1
```

### 4. Vérification post-exécution

Coller les blocks `VÉRIFICATIONS POST-EXÉCUTION` documentés en bas du script
(commentés dans le fichier `.sql`).

### 5. Merger la PR TS associée

Le script SQL et la suppression des déclarations TypeScript sont dans la
**même PR** mais doivent être appliqués **dans l'ordre** :
1. D'abord exec SQL en prod (manual, étape 3)
2. Puis merger la PR (qui retire les déclarations TS)

Si on inverse l'ordre, `deploy.sh` qui tourne `db:push` après le merge va
voir un schema TS sans `pin_code` mais une table avec → soit `db:push`
laisse comme ça (additif tolère le surplus), soit demande confirmation (ce
qui casse le deploy non-interactif).

## En cas de pépin

- Le script tourne dans une transaction. Si une assertion échoue, **rien
  n'est appliqué**. Investiguer le message d'erreur.
- Si un drop part de travers en prod : restore depuis R2.
  ```bash
  docker compose exec -T app npm run restore -- latest  # dry-run d'abord
  RESTORE_CONFIRM=I_KNOW_WHAT_IM_DOING docker compose exec -e RESTORE_CONFIRM \
    -T app npm run restore -- latest                    # vraie restore
  ```

## Pourquoi ce dossier

Sans ces scripts, on serait obligé de :
- soit garder éternellement les colonnes/tables legacy dans le schema TS
  (dette permanente)
- soit autoriser `db:push --force` en prod (perte de data potentielle, FK
  cascades imprévues)

Les deux sont pires que des migrations SQL manuelles documentées.

À long terme, basculer sur `drizzle-kit generate` + `drizzle-kit migrate`
(versionné, append-only) résoudra ce problème — cf. booksystem §9.7 et §9.8
(Phase 2).
