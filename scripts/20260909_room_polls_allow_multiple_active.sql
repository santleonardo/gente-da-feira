-- ============================================================
-- 20260909_room_polls_allow_multiple_active.sql
--
-- Remove a regra de "só 1 enquete ativa por sala" criada em
-- 20260908_room_polls.sql, para permitir várias enquetes ativas
-- ao mesmo tempo (até 10, limite aplicado pela API em
-- src/app/api/rooms/[id]/poll/route.ts).
--
-- Rode este arquivo manualmente no SQL Editor do Supabase.
-- ============================================================

-- O índice único parcial criado originalmente chama-se
-- room_polls_one_active_idx (ver 20260908_room_polls.sql). Removendo-o
-- por nome direto; o bloco DO abaixo é um fallback que remove qualquer
-- índice único parcial equivalente, caso o nome tenha sido outro.

DROP INDEX IF EXISTS room_polls_one_active_idx;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'room_polls'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%is_closed%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    RAISE NOTICE 'Dropped index: %', r.indexname;
  END LOOP;
END $$;

-- Conferência: não deve sobrar nenhum índice único parcial em room_polls
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'room_polls';

-- Nota: o limite de 10 enquetes ativas por sala é aplicado na API
-- (não no banco) — não é necessário criar nenhuma constraint nova aqui.
