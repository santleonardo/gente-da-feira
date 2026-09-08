/**
 * Helper de ingestão automática — busca e parseia feeds RSS/Atom.
 *
 * Usado pelo cron job (/api/cron/city-ingest) para coletar itens de
 * portais de notícias cadastrados em `city_sources` e alimentar
 * `city_updates` sem intervenção manual.
 *
 * Tolerante a falhas: um feed fora do ar ou malformado nunca derruba
 * a ingestão dos outros — cada fonte é isolada em try/catch.
 */

import { XMLParser } from "fast-xml-parser";

export interface RssItem {
  title: string;
  link: string | null;
  summary: string | null;
  guid: string | null;
  pubDate: string | null;
  imageUrl: string | null;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_FEED = 20;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractImage(item: any): string | null {
  // <media:content url="..."> ou <enclosure url="..." type="image/...">
  const mediaContent = item["media:content"];
  if (mediaContent) {
    const first = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
    if (first?.["@_url"]) return first["@_url"];
  }
  const enclosure = item.enclosure;
  if (enclosure) {
    const first = Array.isArray(enclosure) ? enclosure[0] : enclosure;
    if (first?.["@_type"]?.startsWith("image") && first?.["@_url"]) {
      return first["@_url"];
    }
  }
  // Tenta achar <img src="..."> dentro do content:encoded ou description
  const html =
    (typeof item["content:encoded"] === "string" && item["content:encoded"]) ||
    (typeof item.description === "string" && item.description) ||
    "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Busca um feed RSS 2.0 ou Atom e retorna itens normalizados.
 * Nunca lança — em caso de erro retorna [].
 */
export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GenteDaFeiraBot/1.0; +https://gentedafeira.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    if (!xml || xml.length < 20) return [];

    const parsed = parser.parse(xml);

    // RSS 2.0: rss.channel.item[]
    const rssItems = toArray(parsed?.rss?.channel?.item);
    // Atom: feed.entry[]
    const atomEntries = toArray(parsed?.feed?.entry);

    const items: RssItem[] = [];

    for (const raw of rssItems.slice(0, MAX_ITEMS_PER_FEED)) {
      const title =
        typeof raw.title === "string" ? raw.title : raw.title?.["#text"] || "";
      const rawDescription =
        typeof raw.description === "string"
          ? raw.description
          : raw.description?.["#text"] || "";
      const rawContent =
        typeof raw["content:encoded"] === "string"
          ? raw["content:encoded"]
          : "";
      const summarySource = rawDescription || rawContent;

      items.push({
        title: stripHtml(title).slice(0, 300),
        link: typeof raw.link === "string" ? raw.link : raw.link?.["#text"] || null,
        summary: summarySource ? stripHtml(summarySource).slice(0, 2000) : null,
        guid:
          typeof raw.guid === "string"
            ? raw.guid
            : raw.guid?.["#text"] || (typeof raw.link === "string" ? raw.link : null),
        pubDate: raw.pubDate || raw["dc:date"] || null,
        imageUrl: extractImage(raw),
      });
    }

    for (const raw of atomEntries.slice(0, MAX_ITEMS_PER_FEED)) {
      const linkField = toArray(raw.link)[0];
      const link =
        typeof linkField === "string"
          ? linkField
          : linkField?.["@_href"] || null;
      const title =
        typeof raw.title === "string" ? raw.title : raw.title?.["#text"] || "";
      const summarySource =
        (typeof raw.summary === "string" && raw.summary) ||
        raw.summary?.["#text"] ||
        (typeof raw.content === "string" && raw.content) ||
        raw.content?.["#text"] ||
        "";

      items.push({
        title: stripHtml(title).slice(0, 300),
        link,
        summary: summarySource ? stripHtml(summarySource).slice(0, 2000) : null,
        guid: typeof raw.id === "string" ? raw.id : link,
        pubDate: raw.updated || raw.published || null,
        imageUrl: extractImage(raw),
      });
    }

    return items.filter((i) => i.title && i.title.length >= 3);
  } catch {
    // Timeout, feed fora do ar, XML malformado, etc. — nunca propaga.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
