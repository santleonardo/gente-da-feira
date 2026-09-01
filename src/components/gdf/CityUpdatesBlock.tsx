"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Newspaper,
  MapPin,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CityUpdate {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  category: string;
  platform: string;
  image_url?: string | null;
  neighborhood?: string | null;
  relevance_score?: number;
  published_at: string | null;
  source_published_at?: string | null;
  meta?: Record<string, unknown>;
}

const CATEGORY_LABELS: Record<string, string> = {
  geral: "Geral",
  eventos: "Eventos",
  emprego: "Emprego",
  transito: "Trânsito",
  seguranca: "Segurança",
  clima: "Clima",
  cultura: "Cultura",
  esporte: "Esporte",
  politica: "Política",
  saude: "Saúde",
  educacao: "Educação",
};

const PLATFORM_LABELS: Record<string, string> = {
  rss: "RSS",
  news: "Notícias",
  x: "X",
  youtube: "YouTube",
  website: "Site",
  manual: "Editorial",
  other: "Web",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function CityUpdatesBlock() {
  const [updates, setUpdates] = useState<CityUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/city-updates?limit=8");
      if (!res.ok) {
        setUpdates([]);
        return;
      }
      const data = await res.json();
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
    } catch {
      setUpdates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sem dados e sem loading: não ocupa espaço no feed
  if (!loading && updates.length === 0) return null;

  return (
    <section className="mt-4 mb-1 rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-background overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-primary/[0.04] transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Newspaper className="h-4.5 w-4.5 h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Na cidade
            </h3>
            <Badge
              variant="secondary"
              className="text-[9px] px-1.5 py-0 h-4 font-semibold bg-primary/10 text-primary border-0"
            >
              Feira de Santana
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            O que está acontecendo em FSA
          </p>
        </div>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Carregando…</span>
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x snap-mandatory scrollbar-thin">
              {updates.map((u) => {
                const cat = CATEGORY_LABELS[u.category] || u.category;
                const fonte = PLATFORM_LABELS[u.platform] || u.platform;
                const when = formatWhen(u.published_at || u.source_published_at);
                const href = u.url && /^https?:\/\//i.test(u.url) ? u.url : null;

                const CardInner = (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 font-semibold shrink-0 bg-muted text-muted-foreground border-0"
                      >
                        {cat}
                      </Badge>
                      {when && (
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                          {when}
                        </span>
                      )}
                    </div>
                    <h4 className="text-[11px] font-bold leading-snug text-foreground line-clamp-2 mb-1">
                      {u.title}
                    </h4>
                    {u.summary && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                        {truncate(u.summary, 500)}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
                        <span className="font-semibold text-primary/80 shrink-0">
                          {fonte}
                        </span>
                        {u.neighborhood && (
                          <>
                            <span className="opacity-40">·</span>
                            <MapPin className="h-2.5 w-2.5 shrink-0 opacity-60" />
                            <span className="truncate">{u.neighborhood}</span>
                          </>
                        )}
                      </div>
                      {href && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary shrink-0">
                          Abrir
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </>
                );

                const cardClass =
                  "snap-start shrink-0 w-[min(100%,320px)] sm:w-[300px] flex flex-col rounded-xl border border-border/60 bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/25 transition-all text-left";

                if (href) {
                  return (
                    <a
                      key={u.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClass}
                    >
                      {CardInner}
                    </a>
                  );
                }

                return (
                  <div key={u.id} className={cardClass}>
                    {CardInner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
