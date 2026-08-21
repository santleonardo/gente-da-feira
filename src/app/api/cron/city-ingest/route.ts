import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import { fetchRssFeed } from "@/lib/rss-fetch";
import {
  computeRelevanceScore,
  looksLikeFeiraDeSantana,
} from "@/lib/city-monitoring";

/**
 * GET /api/cron/city-ingest
 *
 * Job agendado (Vercel Cron, ver vercel.json) que substitui a etapa que
 * faltava no pipeline do bloco "Na cidade": busca os feeds RSS das fontes
 * cadastradas em `city_sources`, filtra o que parece ser sobre Feira de
 * Santana e insere direto em `city_updates` — sem depender de ninguém
 * abrir o painel admin.
 *
 * Auth: mesmo padrão SEC-001 dos outros endpoints internos
 * (validateInternalAuth / INTERNAL_API_SECRET). Configure também
 * CRON_SECRET na Vercel com o MESMO valor de INTERNAL_API_SECRET — a
 * Vercel injeta automaticamente `Authorization: Bearer $CRON_SECRET`
 * nas chamadas de Cron Jobs, o que faz essa rota se autenticar sozinha.
 *
 * Idempotente: duplicatas são resolvidas pela constraint única em
 * city_updates(external_id) — ver SQL em CITY_MONITORING.md.
 */

const MAX_SOURCES_PER_RUN = 30;

export async function GET(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    const admin = createAdminClient();

    const { data: sources, error: sourcesError } = await admin
      .from("city_sources")
      .select("id, slug, name, rss_url, category, trust_score, is_active")
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
        skipped: 0,
        duplicates: 0,
        message: "Nenhuma fonte RSS ativa cadastrada em city_sources.",
      });
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    const perSourceErrors: { source: string; error: string }[] = [];

    for (const source of sources) {
      try {
        const items = await fetchRssFeed(source.rss_url as string);

        for (const item of items) {
          const blob = `${item.title} ${item.summary || ""}`;

          // Filtro local — mesmo critério do /api/internal/city-ingest
          if (!looksLikeFeiraDeSantana(blob)) {
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
        }
      } catch (err: any) {
        // Uma fonte com problema nunca derruba as outras.
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
      skipped: totalSkipped,
      duplicates: totalDuplicates,
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
