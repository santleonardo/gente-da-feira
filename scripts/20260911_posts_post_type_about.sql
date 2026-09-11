-- ============================================================
-- Notas em Sobre: permitir post_type = 'about'
--
-- Rodar no Supabase → SQL Editor.
-- Seguro se a constraint já estiver ampla ou não existir.
-- ============================================================

-- 1) Descobrir constraint de check em posts (opcional, só leitura)
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.posts'::regclass AND contype = 'c';

-- 2) Se existir CHECK que limita post_type (ex.: só 'simple'),
--    dropar e recriar permitindo 'simple' | 'about'.
--    Ajuste o nome da constraint se for diferente no seu banco.

DO $$
DECLARE
  cname text;
BEGIN
  -- Procura constraints CHECK em posts que mencionam post_type
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'posts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%post_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS %I', cname);
    RAISE NOTICE 'Dropped constraint %', cname;
  END LOOP;
END $$;

-- 3) Garante coluna (se ainda não existir)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'simple';

-- 4) CHECK explícito permitindo simple + about
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_post_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('simple', 'about'));

-- 5) Índice parcial para listar notas em Sobre com eficiência
CREATE INDEX IF NOT EXISTS posts_author_about_created_idx
  ON public.posts (author_id, created_at DESC)
  WHERE is_deleted = false AND post_type = 'about';

COMMENT ON COLUMN public.posts.post_type IS
  'simple = feed/entradas; about = blog interno só na aba Sobre';
