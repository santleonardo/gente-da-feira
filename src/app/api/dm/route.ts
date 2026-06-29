import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols } from "@/lib/safe-columns";

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:create", user?.id);
    if (blocked) return blocked;

    const { receiverId } = await req.json();
    if (!receiverId) return NextResponse.json({ error: "receiverId obrigatório" }, { status: 400 });
    if (user.id === receiverId) return NextResponse.json({ error: "Não pode conversar consigo" }, { status: 400 });

    // SEC-004: Check bidirectional block before creating conversation
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${user.id})`
      )
      .maybeSingle();

    if (blockRows) {
      return NextResponse.json(
        { error: "Não é possível iniciar conversa com este usuário" },
        { status: 403 }
      );
    }

    const [a, b] = user.id < receiverId ? [user.id, receiverId] : [receiverId, user.id];

    const { data: existing } = await supabase.from("direct_chats")
      .select(`${DM_CHAT_COLUMNS}, initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}), receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})`)
      .eq("initiator_id", a).eq("receiver_id", b).maybeSingle();

    if (existing) return NextResponse.json({ conversation: existing });

    const { data: conversation, error } = await supabase.from("direct_chats")
      .insert({ initiator_id: a, receiver_id: b })
      .select(`${DM_CHAT_COLUMNS}, initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}), receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})`)
      .single();

    if (error) throw error;
    return NextResponse.json({ conversation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}