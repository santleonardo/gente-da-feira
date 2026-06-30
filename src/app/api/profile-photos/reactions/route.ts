// ============================================================
// API de reações nas fotos do perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked, getProfilePhotoOwnerId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// REL-003: Toggle de reação totalmente atômico via RPC
// (public.rpc_toggle_profile_photo_reaction). Elimina a race
// condition do padrão anterior "SELECT existing → INSERT/DELETE".
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "photos:react", user?.id);
    if (blocked) return blocked;

    const { photoId, type } = await req.json();
    if (!photoId || !type) {
      return NextResponse.json({ error: "photoId e type são obrigatórios" }, { status: 400 });
    }

    // SEC-004: Check bidirectional block with photo owner
    const ownerId = await getProfilePhotoOwnerId(supabase, photoId);
    if (ownerId && ownerId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, ownerId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível reagir a esta foto" }, { status: 403 });
      }
    }

    // REL-003: operação atômica no banco — sem janela de corrida entre
    // leitura e escrita.
    const { data, error } = await supabase
      .rpc("rpc_toggle_profile_photo_reaction", { p_photo_id: photoId, p_type: type })
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

    return NextResponse.json({ reacted: !!result.reacted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[profile-photos/reactions POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
