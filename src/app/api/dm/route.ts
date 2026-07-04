import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";

// SEC-009: Explicit columns for DM conversation list — no SELECT * on direct_chats
const DM_CHAT_COLUMNS = "id, initiator_id, receiver_id, updated_at";
// SEC-009: Minimal profile columns for DM participant display
const DM_PROFILE_COLS = selectCols([
  "id", "display_name", "username", "avatar_url",
] as const);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:list", user?.id);
    if (blocked) return blocked;

    const [conversationsRes, blockedIds] = await Promise.all([
      supabase
        .from("direct_chats")
        .select(`
          ${DM_CHAT_COLUMNS},
          initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}),
          receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})
        `)
        .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("updated_at", { ascending: false }),
      getBlockedUserIds(supabase, user.id),
    ]);

    const conversations = (conversationsRes.data || []).filter((c: any) => {
      const otherId = c.initiator_id === user.id ? c.receiver_id : c.initiator_id;
      return !blockedIds.has(otherId);
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[dm GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// REL-004: Criação de conversa DM totalmente atômica via RPC
// (public.rpc_get_or_create_dm). Elimina a race condition do padrão
// anterior "SELECT existing → INSERT", onde duplo-tap em "Conversar"
// podia criar duas linhas direct_chats para o mesmo par de usuários.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:create", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { receiverId } = await req.json();
    if (!receiverId) return NextResponse.json({ error: "receiverId obrigatório" }, { status: 400 });
    if (user.id === receiverId) return NextResponse.json({ error: "Não pode conversar consigo" }, { status: 400 });

    // REL-004: get-or-create atômico no banco — sem janela de corrida
    // entre a checagem de existência e o INSERT.
    const { data, error } = await supabase
      .rpc("rpc_get_or_create_dm", { p_other_user_id: receiverId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; chat_id?: string };

    if (!result.ok) {
      if (result.error === "not_authenticated") {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      if (result.error === "blocked") {
        return NextResponse.json(
          { error: "Não é possível iniciar conversa com este usuário" },
          { status: 403 }
        );
      }
      if (result.error === "cannot_dm_self") {
        return NextResponse.json({ error: "Não pode conversar consigo" }, { status: 400 });
      }
      return NextResponse.json({ error: "Não foi possível iniciar a conversa" }, { status: 400 });
    }

    const { data: conversation, error: fetchErr } = await supabase
      .from("direct_chats")
      .select(`${DM_CHAT_COLUMNS}, initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}), receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})`)
      .eq("id", result.chat_id as string)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    const responseData = { conversation };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[dm POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
