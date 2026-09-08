import React, { Fragment } from "react";

const MENTION_REGEX = /@(\w+)/g;
const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu;

// Regex combinado: URL | @menção | #hashtag | ***negrito itálico*** | **negrito** | _itálico_
// Usado por parseInlineFormatting — fonte única de verdade para
// renderização inline em posts (feed/detalhe) e mensagens (DM/salas).
const INLINE_REGEX = /(https?:\/\/[^\s<>"')\]]+)|@(\w+)|#([\p{L}\p{N}_]{2,40})|(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|_(.+?)_/gu;

/** Rótulo curto para não estourar o layout com URLs enormes */
function formatUrlLabel(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "");
    // Só domínio — limpo no feed; path longo fica no title/tooltip
    if (host.length <= 40) return host;
    return host.slice(0, 37) + "…";
  } catch {
    if (raw.length <= 36) return raw;
    return raw.slice(0, 33) + "…";
  }
}

// Cache username → userId to avoid repeated lookups
const usernameCache = new Map<string, string | null>();

/**
 * Resolves a username to a user ID via the API, with caching.
 */
export async function resolveUsernameToId(username: string): Promise<string | null> {
  const lower = username.toLowerCase();
  if (usernameCache.has(lower)) return usernameCache.get(lower)!;
  try {
    const res = await fetch(`/api/users?username=${encodeURIComponent(lower)}`);
    if (!res.ok) { usernameCache.set(lower, null); return null; }
    const data = await res.json();
    const userId = data.user?.id || null;
    usernameCache.set(lower, userId);
    return userId;
  } catch {
    usernameCache.set(lower, null);
    return null;
  }
}

/**
 * Opens a user profile from a mention click.
 * First resolves the username to a user ID, then opens the profile dialog.
 */
export function openProfileFromMention(username: string, openUserProfile?: (userId: string) => void) {
  if (!openUserProfile) return;
  const lower = username.toLowerCase();
  const cached = usernameCache.get(lower);
  if (cached) {
    openUserProfile(cached);
    return;
  }
  resolveUsernameToId(lower).then((userId) => {
    if (userId) openUserProfile(userId);
  });
}

/** Abre a busca por hashtag (Descobrir). Normaliza sem # e em minúsculas. */
export function openHashtagSearch(tag: string) {
  const normalized = tag.replace(/^#/, "").trim();
  if (!normalized) return;
  window.dispatchEvent(
    new CustomEvent("openHashtag", { detail: { tag: normalized } })
  );
}

/** Extrai hashtags únicas de um texto (sem #, minúsculas). */
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const plain = text.replace(/<[^>]*>/g, " ");
  const tags = new Set<string>();
  const re = /#([\p{L}\p{N}_]{2,40})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return Array.from(tags);
}

/**
 * Renderiza um texto inline tratando, em uma única passada:
 *  - URLs (clicáveis, abrindo em nova aba)
 *  - @menções (abrem o perfil do usuário mencionado)
 *  - **negrito**, ***negrito itálico*** e _itálico_ (markdown leve)
 *
 * Fonte única de verdade para renderização inline de posts (feed,
 * detalhe) e mensagens (DM, salas) — substitui as antigas
 * `renderContentWithMentions` (link-utils) e `parseInlineFormatting`
 * (duplicada em FeedView.tsx).
 */
export function parseInlineFormatting(
  text: string | null,
  openUserProfile?: (userId: string) => void,
  options?: {
    mentionClassName?: string;
    linkClassName?: string;
    isMine?: boolean;
  }
): React.ReactNode[] {
  if (!text) return [];

  const { mentionClassName, linkClassName, isMine } = options || {};

  const defaultMentionClass = isMine
    ? "text-primary-foreground/90 font-semibold underline decoration-primary-foreground/30 underline-offset-2 hover:decoration-primary-foreground/60 cursor-pointer transition-colors"
    : "text-primary font-semibold underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60 cursor-pointer transition-colors";

  const defaultLinkClass = linkClassName || "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors";

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  INLINE_REGEX.lastIndex = 0;
  while ((match = INLINE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Fragment key={`t${key++}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }

    if (match[1]) {
      // URL — mostra rótulo curto (domínio); href continua completo
      parts.push(
        <a
          key={`url-${key++}`}
          href={match[1]}
          target="_blank"
          rel="noopener noreferrer"
          className={defaultLinkClass}
          title={match[1]}
          onClick={(e) => e.stopPropagation()}
        >
          {formatUrlLabel(match[1])}
        </a>
      );
    } else if (match[2]) {
      // @menção
      const username = match[2];
      parts.push(
        <span
          key={`mention-${key++}`}
          className={mentionClassName || defaultMentionClass}
          onClick={(e) => {
            e.stopPropagation();
            openProfileFromMention(username, openUserProfile);
          }}
        >
          @{username}
        </span>
      );
    } else if (match[3]) {
      // #hashtag
      const tag = match[3];
      parts.push(
        <span
          key={`tag-${key++}`}
          className="text-[#0A4D5C] font-semibold cursor-pointer hover:underline underline-offset-2 decoration-[#0A4D5C]/40"
          onClick={(e) => {
            e.stopPropagation();
            openHashtagSearch(tag);
          }}
        >
          #{tag}
        </span>
      );
    } else if (match[5]) {
      // ***negrito itálico***
      parts.push(<strong key={`bi${key++}`}><em>{match[5]}</em></strong>);
    } else if (match[7]) {
      // **negrito**
      parts.push(<strong key={`b${key++}`}>{match[7]}</strong>);
    } else if (match[8]) {
      // _itálico_
      parts.push(<em key={`i${key++}`}>{match[8]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`t${key++}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts.length > 0 ? parts : [<Fragment key="empty">{text}</Fragment>];
}
