-- ============================================================
-- Mini-sala da equipe (criador + moderadores) dentro de cada sala
-- Mensagens com target_type = 'room_staff' e o mesmo room_id.
-- Rode no Supabase → SQL Editor
-- ============================================================

-- 1) Permitir target_type 'room_staff' (ajusta constraint se existir)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'messages'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%target_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_target_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_target_type_check
  CHECK (target_type IN ('user', 'room', 'room_staff', 'dm', 'feed'));

-- Se a constraint acima falhar por valores legados, use só:
-- ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_target_type_check;
-- (e não recrie — a API valida o tipo)

CREATE INDEX IF NOT EXISTS messages_room_staff_idx
  ON public.messages (room_id, created_at DESC)
  WHERE target_type = 'room_staff' AND is_deleted = false;

-- 2) RLS: leitura/escrita só criador ou moderador da sala
-- (policies extras; as existentes de 'room' não cobrem room_staff)

DROP POLICY IF EXISTS messages_room_staff_select ON public.messages;
CREATE POLICY messages_room_staff_select ON public.messages
  FOR SELECT
  USING (
    target_type = 'room_staff'
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
        AND rm.is_banned IS NOT TRUE
        AND rm.role IN ('creator', 'moderator')
    )
  );

DROP POLICY IF EXISTS messages_room_staff_insert ON public.messages;
CREATE POLICY messages_room_staff_insert ON public.messages
  FOR INSERT
  WITH CHECK (
    target_type = 'room_staff'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = messages.room_id
        AND rm.user_id = auth.uid()
        AND rm.is_banned IS NOT TRUE
        AND rm.role IN ('creator', 'moderator')
    )
  );

DROP POLICY IF EXISTS messages_room_staff_update ON public.messages;
CREATE POLICY messages_room_staff_update ON public.messages
  FOR UPDATE
  USING (
    target_type = 'room_staff'
    AND (
      sender_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = messages.room_id
          AND rm.user_id = auth.uid()
          AND rm.is_banned IS NOT TRUE
          AND rm.role IN ('creator', 'moderator')
      )
    )
  );

-- Nota: se o SELECT geral de messages já bloquear room_staff, estas policies
-- precisam ser OR-combinadas conforme o padrão do projeto (várias policies = OR).
