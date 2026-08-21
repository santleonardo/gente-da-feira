import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import {
  computeRelevanceScore,
  isCityCategory,
  isCityPlatform,
} from "@/lib/city-monitoring";

/**
 * GET  /api/admin/city-updates — lista todos (incl. rascunhos)
 * POST /api/admin/city-updates — cria / publica card editorial
 * PATCH body { id, is_published?, title?, summary?, ... }
 * DELETE ?id=
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

    const published = req.nextUrl.searchParams.get("published");
    const admin = createAdminClient();
    let query = admin
      .from("city_updates")
      .select(
        "id, title, summary, url, category, platform, image_url, neighborhood, relevance_score, is_published, published_at, source_published_at, source_id, created_at, meta"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (published === "1") query = query.eq("is_published", true);
    if (published === "0") query = query.eq("is_published", false);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ updates: data || [] });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/city-updates GET]"
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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const summary =
      typeof body.summary === "string" ? body.summary.trim().slice(0, 2000) : null;
    const url = typeof body.url === "string" ? body.url.trim() : null;
    const category =
      typeof body.category === "string" && isCityCategory(body.category)
        ? body.category
        : "geral";
    const platform =
      typeof body.platform === "string" && isCityPlatform(body.platform)
        ? body.platform
        : "manual";
    const neighborhood =
      typeof body.neighborhood === "string"
        ? body.neighborhood.trim().slice(0, 80)
        : null;
    const image_url =
      typeof body.image_url === "string" ? body.image_url.trim() : null;
    const publish = body.publish !== false;

    if (!title || title.length < 3) {
      return NextResponse.json(
        { error: "Título obrigatório (mín. 3 caracteres)" },
        { status: 400 }
      );
    }

    const relevance_score = computeRelevanceScore({
      trustScore: 90,
      sourcePublishedAt: new Date().toISOString(),
      text: `${title} ${summary || ""}`,
      hasImage: !!image_url,
    });

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("city_updates")
      .insert({
        title,
        summary,
        url,
        category,
        platform,
        neighborhood,
        image_url,
        relevance_score,
        is_published: publish,
        published_at: publish ? now : null,
        source_published_at: body.source_published_at || now,
        created_by: user.id,
        meta: body.meta && typeof body.meta === "object" ? body.meta : {},
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ update: data }, { status: 201 });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/city-updates POST]"
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
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.summary === "string")
      patch.summary = body.summary.trim().slice(0, 2000);
    if (typeof body.url === "string") patch.url = body.url.trim() || null;
    if (typeof body.category === "string" && isCityCategory(body.category))
      patch.category = body.category;
    if (typeof body.is_published === "boolean") {
      patch.is_published = body.is_published;
      if (body.is_published) {
        patch.published_at = new Date().toISOString();
      }
    }
    if (typeof body.relevance_score === "number") {
      patch.relevance_score = Math.min(
        100,
        Math.max(0, Math.round(body.relevance_score))
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("city_updates")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ update: data });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/city-updates PATCH]"
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
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("city_updates").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/city-updates DELETE]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
