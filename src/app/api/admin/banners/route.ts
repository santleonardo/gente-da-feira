import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * GET  /api/admin/banners — lista banners (ativos e recentes)
 * POST /api/admin/banners — cria um novo banner ativo
 * DELETE /api/admin/banners?id= — remove (hard delete) um banner
 *
 * Acesso: is_moderator === true
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { data: banners, error } = await supabase
      .from("app_banners")
      .select("id, message, created_by, created_at, is_active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ banners: banners || [] });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/banners GET]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message || message.length < 1 || message.length > 500) {
      return NextResponse.json(
        { error: "Mensagem deve ter entre 1 e 500 caracteres" },
        { status: 400 }
      );
    }

    // Opcional: desativar banners anteriores para manter só um ativo
    const deactivateOthers = body.deactivate_others !== false;
    if (deactivateOthers) {
      await supabase
        .from("app_banners")
        .update({ is_active: false })
        .eq("is_active", true);
    }

    const { data: banner, error } = await supabase
      .from("app_banners")
      .insert({
        message,
        created_by: user.id,
        is_active: true,
      })
      .select("id, message, created_by, created_at, is_active")
      .single();

    if (error) throw error;

    return NextResponse.json({ banner }, { status: 201 });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/banners POST]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const { error } = await supabase.from("app_banners").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/banners DELETE]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
