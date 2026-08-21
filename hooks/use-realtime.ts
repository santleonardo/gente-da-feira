"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================
// SEC-002: Hook de Realtime com RLS-aware filtering
//
// IMPORTANTE: Este hook depende que o Supabase esteja com
// "Realtime Authorization" habilitado nas tabelas (configurado
// via supabase/sql/005_enable_realtime_rls.sql).
//
// Com Realtime Authorization ON, o servidor aplica as RLS
// policies automaticamente — mesmo se um cliente malicioso
// enviar filter com ID de sala da qual não participa,
// o servidor NÃO entregará eventos.
//
// Defesa em profundidade:
//   1. O filtro `filter` reduz o tráfego (apenas eventos da sala)
//   2. O RLS bloqueia eventos não autorizados no servidor
//   3. O componente `enabled` flag impede subscription se o
//      usuário não deveria estar ouvindo (extra safety)
// ============================================================

interface UseRealtimeMessagesOptions {
  table: string;
  filter?: string;
  onInsert?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  enabled?: boolean;
}

export function useRealtimeMessages({
  table, filter, onInsert, onDelete, onUpdate, enabled = true,
}: UseRealtimeMessagesOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onInsertRef = useRef(onInsert);
  const onDeleteRef = useRef(onDelete);
  const onUpdateRef = useRef(onUpdate);

  // Keep refs up to date without causing re-subscriptions
  onInsertRef.current = onInsert;
  onDeleteRef.current = onDelete;
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    // SEC-002: Não permitir subscription sem filter — defense-in-depth
    // contra bugs no código do componente que esqueça de passar filter.
    // Se a tabela exige filter (messages, room_members, etc.), abortar.
    const tablesRequiringFilter = ["messages", "room_members", "notifications", "reactions", "comments"];
    if (tablesRequiringFilter.includes(table) && !filter) {
      console.warn(`[SEC-002 use-realtime] Subscription em ${table} sem filter foi bloqueada`);
      return;
    }

    const supabase = createClient();
    let channelName = `realtime:${table}`;
    if (filter) channelName += `:${filter}`;

    const channel = supabase.channel(channelName).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table, filter: filter || undefined },
      (payload) => { onInsertRef.current?.(payload.new); }
    );

    if (onDeleteRef.current) {
      channel.on("postgres_changes",
        { event: "DELETE", schema: "public", table, filter: filter || undefined },
        (payload) => { onDeleteRef.current?.(payload.old); }
      );
    }
    if (onUpdateRef.current) {
      channel.on("postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: filter || undefined },
        (payload) => { onUpdateRef.current?.(payload.new); }
      );
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`[SEC-002 use-realtime] Canal ${channelName} falhou:`, status);
      }
    });
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter, enabled]);

  return channelRef;
}
