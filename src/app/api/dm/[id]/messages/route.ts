import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanupExpiredMessageMedia, getMessageMediaExpiration } from "@/lib/media-expiration";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";
import { validateMediaUrl } from "@/lib/storage-security";

const MEDIA_MESSAGE_EXPIRATION_HOURS = 1;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:messages:list", user?.id);
    if (blocked) return blocked;

    const { data: chat } = await supabase.from("direct_chats")
      .select("id, initiator_id, receiver_id")
      .eq("id", id)
      .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .maybeSingle();
    if (!chat) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    // SEC-004: Check block between participants
    const otherId = chat.initiator_id === user.id ? chat.receiver_id : chat.initiator_id;
    const { data: blockRow } = await supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`
      )
      .maybeSingle();
    if (blockRow) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const { data: messages, error } = await supabase.from("messages")
      .select(`*, sender:profiles(id, display_name, username, avatar_url)`)
      .eq("dm_id", id).eq("target_type", "dm").eq("is_deleted", false)
      .order("created_at", { ascending: true }).limit(50);

    if (error) throw error;

    const now = new Date().toISOString();
    const sanitized = (messages || []).map((m: any) => {
      if (m.media_url && m.expires_at && m.expires_at < now) {
        return { ...m, media_url: null, media_type: null };
      }
      return m;
    });

    cleanupExpiredMessageMedia().catch(() => {});

    return NextResponse.json({ messages: sanitized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:messages:send", user?.id);
    if (blocked) return blocked;

    const { data: chat } = await supabase.from("direct_chats")
      .select("id, initiator_id, receiver_id")
      .eq("id", id)
      .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .maybeSingle();
    if (!chat) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    // SEC-004: Check block between participants before sending
    const otherId = chat.initiator_id === user.id ? chat.receiver_id : chat.initiator_id;
    const { data: blockRow } = await supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`
      )
      .maybeSingle();
    if (blockRow) return NextResponse.json({ error: "Não é possível enviar mensagens para este usuário" }, { status: 403 });

    const body = await req.json();
    const { content, media_url, media_type } = body;

    if ((!content || !content.trim()) && !media_url) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    }
    if (content && content.length > 2000) {
      return NextResponse.json({ error: "Mensagem muito longa (máx 2000 chars)" }, { status: 400 });
    }

    if (media_url && !["image", "video", "audio"].includes(media_type)) {
      return NextResponse.json({ error: "Tipo de mídia inválido" }, { status: 400 });
    }

    const insertData: any = {
      sender_id: user.id,
      dm_id: id,
      target_type: "dm",
    };

    // SEC-007: Sanitizar conteúdo de texto
    if (content && content.trim()) {
      insertData.content = sanitizePlainText(content.trim());
    } else {
      insertData.content = null;
    }

    // SEC-008: Validar URL de mídia (antes ausente — agora com ownership)
    if (media_url) {
      const safeUrl = validateMediaUrl(media_url, { requireUserId: user.id });
      if (!safeUrl) {
        return NextResponse.json({ error: "URL de mídia inválida" }, { status: 400 });
      }
      insertData.media_url = safeUrl;
      insertData.media_type = media_type;
      insertData.expires_at = getMessageMediaExpiration(MEDIA_MESSAGE_EXPIRATION_HOURS);
    }

    const { data: message, error } = await supabase.from("messages")
      .insert(insertData)
      .select(`*, sender:profiles(id, display_name, username, avatar_url)`)
      .single();

    if (error) throw error;
    return NextResponse.json({ message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}