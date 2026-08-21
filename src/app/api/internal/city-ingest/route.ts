import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import {
  computeRelevanceScore,
  isCityCategory,
  isCityPlatform,
  looksLikeFeiraDeSantana,
} from "@/lib/city-monitoring";
import { publishCityFeedPost } from "@/lib/city-feed-post";

/**
 * POST /api/internal/city-ingest
 * Ingestão de itens coletados (RSS, news, X, etc.).
 * Auth: INTERNAL_API_SECRET (mesmo padrão de push/account-cleanup).
 *
 * Body: {
 *   items: Array<{
 *     title, summary?, url?, external_id?, source_slug?,
 *     category?, platform?, image_url?, neighborhood?,
 *     source_published_at?, raw_excerpt?
 *   }>
 * }
 *
 * Itens que não passam no filtro local são ignorados (skipped).
 */
export async function POST(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "items[] obrigatório" },
        { status: 400 }
      );
    }
    if (items.length > 50) {
      return NextResponse.json(
        { error: "Máximo 50 items por request" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Resolve source_slug → id
    const slugs = [
      ...new Set(
        items
          .map((i: any) =>
            typeof i.source_slug === "string" ? i.source_slug : null
          )
          .filter(Boolean)
      ),
    ] as string[];

    const sourceMap = new Map<string, { id: string; trust_score: number }>();
    if (slugs.length > 0) {
      const { data: sources } = await admin
        .from("city_sources")
        .select("id, slug, trust_score")
        .in("slug", slugs);
      for (const s of sources || []) {
        sourceMap.set(s.slug, { id: s.id, trust_score: s.trust_score });
      }
    }

    let inserted = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const raw of items) {
      const title =
        typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
      if (!title || title.length < 3) {
        skipped++;
        continue;
      }

      const summary =
        typeof raw.summary === "string"
          ? raw.summary.trim().slice(0, 2000)
          : null;
      const raw_excerpt =
        typeof raw.raw_excerpt === "string"
          ? raw.raw_excerpt.trim().slice(0, 4000)
          : null;
      const blob = `${title} ${summary || ""} ${raw_excerpt || ""}`;

      // Filtro local obrigatório na ingestão automática
      if (!looksLikeFeiraDeSantana(blob)) {
        skipped++;
        continue;
      }

      const sourceSlug =
        typeof raw.source_slug === "string" ? raw.source_slug : null;
      const source = sourceSlug ? sourceMap.get(sourceSlug) : null;

      const category =
        typeof raw.category === "string" && isCityCategory(raw.category)
          ? raw.category
          : "geral";
      const platform =
        typeof raw.platform === "string" && isCityPlatform(raw.platform)
          ? raw.platform
          : "other";

      const relevance_score = computeRelevanceScore({
        trustScore: source?.trust_score ?? 50,
        sourcePublishedAt: raw.source_published_at || null,
        text: blob,
        hasImage: !!raw.image_url,
      });

      // Auto-publica só se score alto; senão fica rascunho para o admin
      const autoPublish = relevance_score >= 65;
      const now = new Date().toISOString();

      const row = {
        source_id: source?.id ?? null,
        external_id:
          typeof raw.external_id === "string"
            ? raw.external_id.slice(0, 200)
            : null,
        url: typeof raw.url === "string" ? raw.url.trim().slice(0, 2000) : null,
        title,
        summary,
        raw_excerpt,
        category,
        platform,
        image_url:
          typeof raw.image_url === "string"
            ? raw.image_url.trim().slice(0, 2000)
            : null,
        neighborhood:
          typeof raw.neighborhood === "string"
            ? raw.neighborhood.trim().slice(0, 80)
            : null,
        relevance_score,
        is_published: autoPublish,
        published_at: autoPublish ? now : null,
        source_published_at: raw.source_published_at || null,
        meta: {
          ingested: true,
          auto_publish: autoPublish,
        },
      };

      const { error } = await admin.from("city_updates").insert(row);
      if (error) {
        // unique violation = duplicata
        if (error.code === "23505") {
          duplicates++;
        } else {
          errors.push(error.message);
        }
        continue;
      }
      inserted++;

      // Post no feed principal (timeline de todos)
      if (autoPublish) {
        await publishCityFeedPost(admin, {
          title,
          summary,
          url: row.url,
          sourceName: sourceSlug || "Cidade",
          category,
          relevanceScore: relevance_score,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped,
      duplicates,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[internal/city-ingest]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
