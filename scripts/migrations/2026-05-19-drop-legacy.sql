-- =====================================================================
-- 2026-05-19-drop-legacy.sql
--
-- DESCRIPTION
--   Drop final des éléments legacy laissés "déclarés mais non utilisés"
--   depuis PR #55 (colonnes pin_code/admin_code, auth PIN purgée) et
--   PR #83 (tables bank_entries / cash_entries v1, remplacées par
--   bank_entries_v2 / cash_entries_v2 dans shared/schema/finance.ts).
--
--   Cette migration est manuelle (cf. README.md) car deploy.sh fait
--   tourner `db:push` non-interactif, qui refuse les DROP destructifs
--   sans `--force`. `db:push --force` est interdit en prod (memory
--   reference_ulysseclaude_hetzner et reference_mybeez_hetzner).
--
-- PRÉ-REQUIS
--   1. Backup frais : `docker compose exec -T app npm run backup`
--      puis vérifier le dump récent dans R2 bucket r2mybeez/mybeezdb/
--   2. Pre-flight queries (cf. README.md) montrant tables vides
--   3. PR docs/schéma associée mergée APRÈS l'exécution de ce script
--
-- TRANSACTION
--   Toute la migration tourne dans une seule transaction. Si l'une des
--   pre-flight assertions échoue, BEGIN est rollback et rien n'est touché.
--
-- IDEMPOTENCE
--   `DROP TABLE IF EXISTS` et `ALTER TABLE ... DROP COLUMN IF EXISTS` →
--   ré-exécuter le script après une exec partielle est safe.
-- =====================================================================

BEGIN;

-- Pre-flight assertions : refuse de drop si data présente
DO $$
DECLARE
  bank_count INTEGER := 0;
  cash_count INTEGER := 0;
  pin_count  INTEGER := 0;
BEGIN
  -- Comptages défensifs (les tables peuvent ne plus exister si re-run)
  IF to_regclass('public.bank_entries') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM bank_entries' INTO bank_count;
  END IF;
  IF to_regclass('public.cash_entries') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM cash_entries' INTO cash_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name IN ('pin_code', 'admin_code')
  ) THEN
    SELECT COUNT(*) INTO pin_count FROM tenants
      WHERE pin_code IS NOT NULL OR admin_code IS NOT NULL;
  END IF;

  -- Bloquer si les tables _v1 ne sont pas vides (perte de data réelle)
  IF bank_count > 0 THEN
    RAISE EXCEPTION 'bank_entries non vide (% rows). Migrer vers bank_entries_v2 avant de drop. Annulé.', bank_count;
  END IF;
  IF cash_count > 0 THEN
    RAISE EXCEPTION 'cash_entries non vide (% rows). Migrer vers cash_entries_v2 avant de drop. Annulé.', cash_count;
  END IF;

  -- Tolérer mais signaler pour pin_code/admin_code (auth PIN purgée PR #55)
  IF pin_count > 0 THEN
    RAISE NOTICE '% tenants ont encore pin_code/admin_code renseigné. Colonnes dropées (auth PIN retirée PR #55, valeurs orphelines).', pin_count;
  END IF;
END $$;

-- 1. Colonnes legacy de la table tenants
ALTER TABLE tenants DROP COLUMN IF EXISTS pin_code;
ALTER TABLE tenants DROP COLUMN IF EXISTS admin_code;

-- 2. Tables legacy bank_entries / cash_entries (remplacées par _v2)
DROP TABLE IF EXISTS bank_entries;
DROP TABLE IF EXISTS cash_entries;

COMMIT;

-- =====================================================================
-- VÉRIFICATIONS POST-EXÉCUTION (à coller dans psql après le script)
--
-- 1. Colonnes drop confirmées :
--    SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'tenants'
--      AND column_name IN ('pin_code', 'admin_code');
--    -- attendu : 0 rows
--
-- 2. Tables drop confirmées :
--    SELECT to_regclass('public.bank_entries') AS bank,
--           to_regclass('public.cash_entries') AS cash;
--    -- attendu : (NULL, NULL)
--
-- 3. Nouvelles tables v2 toujours présentes :
--    SELECT to_regclass('public.bank_entries_v2') AS bank_v2,
--           to_regclass('public.cash_entries_v2') AS cash_v2,
--           to_regclass('public.bank_accounts')   AS accounts;
--    -- attendu : 3 oids non-NULL
-- =====================================================================
