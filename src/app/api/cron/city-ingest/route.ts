import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import { fetchRssFeed } from "@/lib/rss-fetch";
import {
  computeRelevanceScore,
  looksLikeFeiraDeSantana,
} from "@/lib/city-monitoring";
import { publishCityFeedPost } from "@/lib/city-feed-post";

/**
 * GET /api/cron/city-ingest
 *
 * 1) Lê RSS das fontes em city_sources
 * 2) Filtra Feira de Santana + score
 * 3) Grava em city_updates (bloco / admin)
 * 4) Se score alto → cria POST no feed principal (conta Cidade)
 *
 * Auth: INTERNAL_API_SECRET / CRON_SECRET (Vercel Cron).
 */

const MAX_SOURCES_PER_RUN = 30;

export async function GET(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    const admin = createAdminClient();

    const { data: sources, error: sourcesError } = await admin
      .from("city_sources")
      .select("id, slug, name, rss_url, category, trust_score, is_active, scope")
      .eq("is_active", true)
      .eq("platform", "rss")
      .not("rss_url", "is", null)
      .limit(MAX_SOURCES_PER_RUN);

    if (sourcesError) throw sourcesError;

    if (!sources || sources.length === 0) {
      return NextResponse.json({
        ok: true,
        sources: 0,
        inserted: 0,
        feedPosts: 0,
        skipped: 0,
        duplicates: 0,
        message: "Nenhuma fonte RSS ativa cadastrada em city_sources.",
      });
    }

    let totalInserted = 0;
    let totalFeedPosts = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    const perSourceErrors: { source: string; error: string }[] = [];
    const feedSkipReasons: string[] = [];

    for (const source of sources) {
      try {
        const items = await fetchRssFeed(source.rss_url as string);
        // Fontes "national" (política, esporte, entretenimento etc. de
        // abrangência nacional) não precisam mencionar Feira de Santana —
        // o filtro local só se aplica a fontes "local" (padrão).
        const isNationalSource = source.scope === "national";

        for (const item of items) {
          const blob = `${item.title} ${item.summary || ""}`;

          if (!isNationalSource && !looksLikeFeiraDeSantana(blob)) {
            totalSkipped++;
            continue;
          }
          if (!item.link && !item.guid) {
            totalSkipped++;
            continue;
          }

          const relevance_score = computeRelevanceScore({
            trustScore: source.trust_score ?? 50,
            sourcePublishedAt: item.pubDate,
            text: blob,
            hasImage: !!item.imageUrl,
          });

          const autoPublish = relevance_score >= 65;
          const now = new Date().toISOString();

          const { error: insertError } = await admin.from("city_updates").insert({
            source_id: source.id,
            external_id: (item.guid || item.link || "").slice(0, 200),
            url: item.link ? item.link.slice(0, 2000) : null,
            title: item.title,
            summary: item.summary,
            raw_excerpt: item.summary,
            category:
              typeof source.category === "string" ? source.category : "geral",
            platform: "rss",
            image_url: item.imageUrl ? item.imageUrl.slice(0, 2000) : null,
            neighborhood: null,
            relevance_score,
            is_published: autoPublish,
            published_at: autoPublish ? now : null,
            source_published_at: item.pubDate || null,
            meta: { ingested: true, auto_publish: autoPublish, via: "cron-rss" },
          });

          if (insertError) {
            if (insertError.code === "23505") {
              totalDuplicates++;
            } else {
              perSourceErrors.push({
                source: source.slug || source.id,
                error: insertError.message,
              });
            }
            continue;
          }
          totalInserted++;

          // ── Feed principal: post automático para todos os usuários ──
          if (autoPublish) {
            const feed = await publishCityFeedPost(admin, {
              title: item.title,
              summary: item.summary,
              url: item.link || null,
              sourceName: source.name || source.slug,
              category:
                typeof source.category === "string" ? source.category : "geral",
              relevanceScore: relevance_score,
            });
            if (feed.ok) {
              totalFeedPosts++;
            } else if (feedSkipReasons.length < 8) {
              feedSkipReasons.push(feed.reason);
            }
          }
        }
      } catch (err: any) {
        perSourceErrors.push({
          source: source.slug || source.id,
          error: err?.message || "erro desconhecido",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sources: sources.length,
      inserted: totalInserted,
      feedPosts: totalFeedPosts,
      skipped: totalSkipped,
      duplicates: totalDuplicates,
      feedSkipReasons: feedSkipReasons.slice(0, 5),
      errors: perSourceErrors.slice(0, 10),
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[cron/city-ingest]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
