import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { extractStoragePathFromUrl } from "@/lib/storage-security";

// GET /api/blocks — Listar usuários bloqueados
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "blocks:list", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("targetId");

    if (targetId) {
      const { data: blockedByViewer } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetId)
        .maybeSingle();

      const { data: blockedByTarget } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", targetId)
        .eq("blocked_id", user.id)
        .maybeSingle();

      return NextResponse.json({
        isBlockedByViewer: !!blockedByViewer,
        isBlockedByTarget: !!blockedByTarget,
      });
    }

    const { data: blocks, error } = await supabase
      .from("blocks")
      .select("id, blocked_id, created_at, blocked:profiles!blocks_blocked_id_fkey(id, display_name, username, avatar_url)")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ blocks: blocks || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/blocks — Bloquear ou desbloquear
// REL-006: Operação totalmente atômica via rpc_block_user.
// Insere block + remove follows + soft-delete DMs em transação única.
// Retorna URLs de mídia DM para limpeza de storage.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "blocks:toggle", user?.id);
    if (blocked) return blocked;

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId é obrigatório" }, { status: 400 });
    }

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_block_user", { p_target_user_id: targetUserId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; blocked?: boolean; dm_media_urls?: string[] };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "cannot_block_self":
          return NextResponse.json({ error: "Não pode bloquear a si mesmo" }, { status: 400 });
        default:
          return NextResponse.json({ error: "Não foi possível processar" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort) — após sucesso do DB
    if (result.blocked && result.dm_media_urls && result.dm_media_urls.length > 0) {
      const admin = createAdminClient();
      (async () => {
        for (const url of result.dm_media_urls!) {
          try {
            const parsed = extractStoragePathFromUrl(url);
            if (parsed) {
              await admin.storage.from(parsed.bucket).remove([parsed.path]);
            }
          } catch { /* silent — best effort */ }
        }
      })();
    }

    return NextResponse.json({ blocked: !!result.blocked });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}