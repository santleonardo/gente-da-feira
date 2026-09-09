import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const MAX_ACTIVE_BANNERS = 10;

/**
 * GET  /api/admin/banners
 * POST /api/admin/banners — cria aviso; NUNCA desativa os anteriores
 * DELETE /api/admin/banners?id=
 * PATCH /api/admin/banners — reativa avisos
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

    const list = banners || [];
    return NextResponse.json({
      banners: list,
      activeCount: list.filter((b) => b.is_active).length,
      maxActive: MAX_ACTIVE_BANNERS,
    });
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

    // NUNCA desativa avisos anteriores. Só saem com DELETE ou PATCH.

    const { count, error: countErr } = await supabase
      .from("app_banners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (countErr) throw countErr;

    if ((count ?? 0) >= MAX_ACTIVE_BANNERS) {
      return NextResponse.json(
        {
          error: `Já existem ${MAX_ACTIVE_BANNERS} avisos ativos. Apague um no painel para liberar espaço. Os antigos NÃO são removidos automaticamente.`,
        },
        { status: 409 }
      );
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

export async function PATCH(req: NextRequest) {
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

    if (body.reactivateAll === true) {
      const { data: recent, error: listErr } = await supabase
        .from("app_banners")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(MAX_ACTIVE_BANNERS);
      if (listErr) throw listErr;
      const ids = (recent || []).map((r) => r.id);
      if (ids.length === 0) {
        return NextResponse.json({ ok: true, reactivated: 0 });
      }
      const { error: updErr } = await supabase
        .from("app_banners")
        .update({ is_active: true })
        .in("id", ids);
      if (updErr) throw updErr;
      return NextResponse.json({ ok: true, reactivated: ids.length });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }
    const isActive = body.is_active === true;
    const { error } = await supabase
      .from("app_banners")
      .update({ is_active: isActive })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, id, is_active: isActive });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/banners PATCH]"
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
