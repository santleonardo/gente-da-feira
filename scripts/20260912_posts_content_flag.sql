-- ============================================================
-- content_flag: autoclassificação opcional do autor no momento
-- do post ("Aviso", "Achados e perdidos", "Publicidade", "Pedido
-- de ajuda"). Usada como CONTEXTO para a moderação por IA
-- (spam-check.ts) reduzir falsos positivos — NÃO substitui a
-- checagem, só ajuda o modelo a decidir melhor.
--
-- Rodar no Supabase → SQL Editor.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_flag text;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_content_flag_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_content_flag_check
  CHECK (
    content_flag IS NULL OR content_flag IN (
      'aviso',
      'achados_e_perdidos',
      'pedido_de_ajuda',
      'publicidade',
      'outro'
    )
  );

COMMENT ON COLUMN public.posts.content_flag IS
  'Autoclassificação opcional do autor (aviso | achados_e_perdidos | pedido_de_ajuda | publicidade | outro). Usada como contexto pela moderação de spam, não é confiável sozinha.';
