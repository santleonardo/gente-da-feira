import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import { fetchRssFeed } from "@/lib/rss-fetch";
import {
  computeRelevanceScore,
  looksLikeFeiraDeSantana,
  isScopedFilterExempt,
  shouldAutoPublish,
} from "@/lib/city-monitoring";
import { publishCityFeedPost } from "@/lib/city-feed-post";

/**
 * GET /api/cron/city-ingest
 *
 * Processa um SUBCONJUNTO das fontes por execução (rotação), para caber no
 * timeout do pg_net (~60–110s) e no maxDuration da Vercel.
 *
 * Prioridade editorial no score:
 *   FSA → Bahia → política nacional → esporte de interesse → cultura
 *
 * Auth: INTERNAL_API_SECRET.
 * Agendamento: pg_cron + pg_net no Supabase.
 */

// Vercel Pro permite até 300s; Hobby ~10–60s. 60s é um alvo seguro.
export const maxDuration = 60;
export const runtime = "nodejs";

/** Quantas fontes RSS processar por disparo do cron */
const MAX_SOURCES_PER_RUN = 8;
/** Itens por feed (mais novos primeiro — o parser já costuma vir ordenado) */
const MAX_ITEMS_PER_SOURCE = 12;

export async function GET(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    const admin = createAdminClient();

    // Busca todas ativas; a rotação escolhe um fatia por hora
    const { data: allSources, error: sourcesError } = await admin
      .from("city_sources")
      .select("id, slug, name, rss_url, category, trust_score, is_active, scope")
      .eq("is_active", true)
      .eq("platform", "rss")
      .not("rss_url", "is", null)
      .order("slug", { ascending: true });

    if (sourcesError) throw sourcesError;

    if (!allSources || allSources.length === 0) {
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

    // Rotação estável: a cada hora do dia muda a janela de fontes
    const hourBucket = new Date().getUTCHours(); // 0–23
    const start = (hourBucket * MAX_SOURCES_PER_RUN) % allSources.length;
    const sources: typeof allSources = [];
    for (let i = 0; i < Math.min(MAX_SOURCES_PER_RUN, allSources.length); i++) {
      sources.push(allSources[(start + i) % allSources.length]);
    }

    let totalInserted = 0;
    let totalFeedPosts = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    const perSourceErrors: { source: string; error: string }[] = [];
    const feedSkipReasons: string[] = [];
    const processedSlugs = sources.map((s) => s.slug);

    for (const source of sources) {
      try {
        const items = await fetchRssFeed(source.rss_url as string);
        const filterExempt = isScopedFilterExempt(source.scope as string | null);
        const limitedItems = items.slice(0, MAX_ITEMS_PER_SOURCE);

        for (const item of limitedItems) {
          const blob = `${item.title} ${item.summary || ""}`;

          if (!filterExempt && !looksLikeFeiraDeSantana(blob)) {
            totalSkipped++;
            continue;
          }
          if (!item.link && !item.guid) {
            totalSkipped++;
            continue;
          }

          const category =
            typeof source.category === "string" ? source.category : "geral";

          const relevance_score = computeRelevanceScore({
            trustScore: source.trust_score ?? 50,
            sourcePublishedAt: item.pubDate,
            text: blob,
            hasImage: !!item.imageUrl,
            scope: source.scope as string | null,
            category,
          });

          const decision = shouldAutoPublish({
            relevanceScore: relevance_score,
            text: blob,
            category,
            scope: source.scope as string | null,
          });
          const autoPublish = decision.publish;
          const now = new Date().toISOString();

          const { error: insertError } = await admin.from("city_updates").insert({
            source_id: source.id,
            external_id: (item.guid || item.link || "").slice(0, 200),
            url: item.link ? item.link.slice(0, 2000) : null,
            title: item.title,
            summary: item.summary,
            raw_excerpt: item.summary,
            category,
            platform: "rss",
            image_url: item.imageUrl ? item.imageUrl.slice(0, 2000) : null,
            neighborhood: null,
            relevance_score,
            is_published: autoPublish,
            published_at: autoPublish ? now : null,
            source_published_at: item.pubDate || null,
            meta: {
              ingested: true,
              auto_publish: autoPublish,
              via: "cron-rss",
              tier: decision.tier,
              threshold: decision.threshold,
            },
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

          if (autoPublish) {
            const feed = await publishCityFeedPost(admin, {
              title: item.title,
              summary: item.summary,
              url: item.link || null,
              sourceName: source.name || source.slug,
              category,
              relevanceScore: relevance_score,
            });
            if (feed.ok) {
              totalFeedPosts++;
            } else if (feedSkipReasons.length < 8) {
              feedSkipReasons.push(feed.reason);
            }
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "erro desconhecido";
        perSourceErrors.push({
          source: source.slug || source.id,
          error: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sources: sources.length,
      sourcesTotal: allSources.length,
      processedSlugs,
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
