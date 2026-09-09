-- ============================================================
-- Avisos (app_banners): vários ativos ao mesmo tempo
-- Rode no Supabase → SQL Editor (obrigatório se o antigo "some")
-- ============================================================

-- 1) Índices (procure UNIQUE em is_active)
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'app_banners';

-- 2) Triggers (podem desativar anteriores no INSERT)
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.app_banners'::regclass
  AND NOT tgisinternal;

-- 3) Remover índices UNIQUE ligados a is_active / partial
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'app_banners'
      AND indexdef ILIKE '%UNIQUE%'
      AND (
        indexdef ILIKE '%is_active%'
        OR indexdef ILIKE '%WHERE%'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    RAISE NOTICE 'Dropped index: %', r.indexname;
  END LOOP;
END $$;

-- 4) Remover triggers de usuário
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.app_banners'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.app_banners', r.tgname);
    RAISE NOTICE 'Dropped trigger: %', r.tgname;
  END LOOP;
END $$;

-- 5) Reativar os 10 mais recentes
WITH ranked AS (
  SELECT id
  FROM public.app_banners
  ORDER BY created_at DESC
  LIMIT 10
)
UPDATE public.app_banners b
SET is_active = true
FROM ranked r
WHERE b.id = r.id;

-- 6) Conferir resultado
SELECT id, left(message, 50) AS msg, is_active, created_at
FROM public.app_banners
ORDER BY created_at DESC
LIMIT 15;
