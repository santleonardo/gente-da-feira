// ============================================================
// API de reações nas fotos do perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked, getProfilePhotoOwnerId } from "@/lib/block-check";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

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

    const { data: existing } = await supabase
      .from("profile_photo_reactions")
      .select("id")
      .eq("photo_id", photoId)
      .eq("user_id", user.id)
      .eq("type", type)
      .maybeSingle();

    if (existing) {
      const admin = createAdminClient();
      const { error } = await admin
        .from("profile_photo_reactions")
        .delete()
        .eq("id", existing.id);

      if (error) throw error;
      return NextResponse.json({ reacted: false });
    } else {
      const { error } = await supabase
        .from("profile_photo_reactions")
        .insert({
          photo_id: photoId,
          user_id: user.id,
          type,
        });

      if (error) throw error;
      return NextResponse.json({ reacted: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}