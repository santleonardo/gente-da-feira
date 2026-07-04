// ============================================================
// API de reações nos vídeos do perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked, getProfileVideoOwnerId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { canViewProfileMedia } from "@/lib/content-visibility";

// REL-003: Toggle de reação totalmente atômico via RPC
// (public.rpc_toggle_profile_video_reaction). Elimina a race
// condition do padrão anterior "SELECT existing → INSERT/DELETE".
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:react", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { videoId, type } = await req.json();
    if (!videoId || !type) {
      return NextResponse.json({ error: "videoId e type são obrigatórios" }, { status: 400 });
    }

    // SEC-010: Check profile privacy before allowing reaction.
    // Prevents reacting to videos on private profiles the user can't see.
    const ownerId = await getProfileVideoOwnerId(supabase, videoId);
    if (ownerId) {
      const canView = await canViewProfileMedia(supabase, ownerId, user.id);
      if (!canView) {
        return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
      }
    }

    // SEC-004: Check bidirectional block with video owner
    if (ownerId && ownerId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, ownerId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível reagir a este vídeo" }, { status: 403 });
      }
    }

    // REL-003: operação atômica no banco — sem janela de corrida entre
    // leitura e escrita.
    const { data, error } = await supabase
      .rpc("rpc_toggle_profile_video_reaction", { p_video_id: videoId, p_type: type })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; reacted?: boolean };
    if (!result.ok) {
      if (result.error === "not_authenticated") {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      return NextResponse.json({ error: "Não foi possível processar a reação" }, { status: 400 });
    }

    const responseData = { reacted: !!result.reacted };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos/reactions POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
