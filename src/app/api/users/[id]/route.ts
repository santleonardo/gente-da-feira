import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { PROFILE_SAFE_COLUMNS, selectCols, AUTHOR_PROFILE_COLUMNS_FULL } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizeShortText, sanitizePlainText } from "@/lib/sanitize";
import {
  buildPrivacyContext,
  filterProfileView,
} from "@/lib/privacy-filter";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const blocked = await rateLimitByRule(req, "users:profile", undefined);
    if (blocked) return blocked;
    const supabase = await createClient();

    // SEC-003: Select explícito de colunas — nunca SELECT *
    const { data: _profile, error } = await supabase
      .from("profiles")
      .select(`${selectCols(PROFILE_SAFE_COLUMNS)}, posts(count)`)
      .eq("id", id)
      .single();

    // Type assertion necessário porque selectCols() retorna string dinâmica
    const profile = _profile as any;
    if (error || !profile) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const viewerId = authUser?.id || null;

    // Determine follow relationship and block status
    let followRow: { status: string } | null | undefined = undefined;
    let isBlockedByViewer = false;
    let isBlockedByTarget = false;

    if (viewerId && viewerId !== id) {
      const [followRes, blockByViewerRes, blockByTargetRes] = await Promise.all([
        supabase
          .from("follows")
          .select("id, status")
          .eq("follower_id", viewerId)
          .eq("following_id", id)
          .maybeSingle(),
        supabase
          .from("blocks")
          .select("id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", id)
          .maybeSingle(),
        supabase
          .from("blocks")
          .select("id")
          .eq("blocker_id", id)
          .eq("blocked_id", viewerId)
          .maybeSingle(),
      ]);
      followRow = followRes.data;
      isBlockedByViewer = !!blockByViewerRes.data;
      isBlockedByTarget = !!blockByTargetRes.data;
    }

    // SEC-009: Build privacy context and filter
    const ctx = buildPrivacyContext(
      viewerId,
      id,
      profile,
      followRow,
      isBlockedByViewer,
      isBlockedByTarget
    );

    return NextResponse.json(filterProfileView(profile, ctx));
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[users profile GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    const blocked = await rateLimitByRule(req, "users:update", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const data = await req.json();
    const updates: Record<string, any> = {};

    if (data.name !== undefined) {
      const name = sanitizeShortText(String(data.name), 50);
      if (!name) return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
      updates.display_name = name;
    }

    if (data.bio !== undefined) {
      updates.bio = sanitizePlainText(String(data.bio)).slice(0, 300);
    }

    if (data.neighborhood !== undefined) {
      updates.neighborhood = sanitizeShortText(data.neighborhood || "", 100) || null;
    }

    if (data.theme !== undefined) {
      updates.theme = String(data.theme).slice(0, 20);
    }

    if (data.username !== undefined) {
      const username = String(data.username).trim().slice(0, 30).toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!username || username.length < 3) {
        return NextResponse.json({ error: "Username deve ter pelo menos 3 caracteres (apenas letras, números e _)" }, { status: 400 });
      }
      updates.username = username;
    }

    if (data.is_private !== undefined) {
      updates.is_private = Boolean(data.is_private);
    }

    if (data.hide_following !== undefined) {
      updates.hide_following = Boolean(data.hide_following);
    }

    if (data.hide_followers !== undefined) {
      updates.hide_followers = Boolean(data.hide_followers);
    }

    if (data.hide_neighborhood !== undefined) {
      updates.hide_neighborhood = Boolean(data.hide_neighborhood);
    }

    if (data.approve_followers !== undefined) {
      updates.approve_followers = Boolean(data.approve_followers);

      if (!data.approve_followers) {
        await supabase
          .from("follows")
          .update({ status: "accepted" })
          .eq("following_id", id)
          .eq("status", "pending");
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    // SEC-003: Select explícito de colunas no retorno
    const { data: _profile, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select(selectCols(PROFILE_SAFE_COLUMNS))
      .single();

    if (error) throw error;
    // Type assertion necessário porque selectCols() retorna string dinâmica
    const profile = _profile as any;
    const responseData = { user: { ...profile, name: profile.display_name } };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[users profile PUT]");
    return NextResponse.json({ error: message }, { status });
  }
}