"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/gdf/UserAvatar";

export type MentionUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

/**
 * Detecta se o cursor está em uma menção parcial (@query) e devolve a query.
 * Retorna null se não houver @ ativo.
 */
export function detectMentionAtCursor(value: string, cursorPos: number): string | null {
  const before = value.slice(0, cursorPos);
  // @ no início ou após espaço/quebra/pontuação; query só [a-z0-9_]
  const match = before.match(/(?:^|[\s([{])@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  return match[1] ?? "";
}

/**
 * Substitui a menção parcial sob o cursor por @username + espaço.
 */
export function insertMentionAtCursor(
  value: string,
  cursorPos: number,
  username: string
): { next: string; newCursor: number } {
  const before = value.slice(0, cursorPos);
  const after = value.slice(cursorPos);
  const replaced = before.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `);
  const next = replaced + after;
  return { next, newCursor: replaced.length };
}

/**
 * Hook de autocomplete de @menção via /api/users?q=
 */
export function useMentionAutocomplete(options?: {
  /** Se true, não busca na API (ex.: lista local de membros) */
  localOnly?: boolean;
  /** Candidatos locais (salas) — usados quando localOnly ou como fallback */
  localCandidates?: MentionUser[];
  debounceMs?: number;
  limit?: number;
}) {
  const {
    localOnly = false,
    localCandidates = [],
    debounceMs = 200,
    limit = 6,
  } = options || {};

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  // Busca remota com debounce
  useEffect(() => {
    if (mentionQuery === null) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (localOnly) {
      const q = mentionQuery.toLowerCase();
      const filtered = localCandidates
        .filter((p) => {
          if (!p?.username) return false;
          if (!q) return true;
          const un = p.username.toLowerCase();
          const dn = (p.display_name || "").toLowerCase();
          return un.includes(q) || dn.includes(q);
        })
        .slice(0, limit);
      setSuggestions(filtered);
      setLoading(false);
      return;
    }

    const seq = ++seqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const q = mentionQuery.trim();
        const url = q
          ? `/api/users?q=${encodeURIComponent(q)}`
          : `/api/users`;
        const res = await fetch(url);
        const data = await res.json();
        if (seq !== seqRef.current) return;
        const users: MentionUser[] = (data.users || [])
          .filter((u: any) => u?.username)
          .slice(0, limit)
          .map((u: any) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
          }));
        setSuggestions(users);
      } catch {
        if (seq === seqRef.current) setSuggestions([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(t);
  }, [mentionQuery, localOnly, localCandidates, debounceMs, limit]);

  const onChangeWithMention = useCallback(
    (value: string, cursorPos: number) => {
      const q = detectMentionAtCursor(value, cursorPos);
      if (q !== null) {
        setMentionQuery(q);
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    },
    []
  );

  const closeMentions = useCallback(() => {
    setMentionQuery(null);
    setSuggestions([]);
  }, []);

  /**
   * Trata teclas do autocomplete. Retorna true se consumiu o evento.
   */
  const onKeyDownMention = useCallback(
    (e: React.KeyboardEvent, onPick: (user: MentionUser) => void): boolean => {
      if (mentionQuery === null || suggestions.length === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = suggestions[mentionIndex];
        if (pick) onPick(pick);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMentions();
        return true;
      }
      return false;
    },
    [mentionQuery, suggestions, mentionIndex, closeMentions]
  );

  return {
    mentionQuery,
    mentionIndex,
    suggestions,
    loading,
    setMentionIndex,
    onChangeWithMention,
    onKeyDownMention,
    closeMentions,
  };
}

/** Dropdown de sugestões de @menção */
export function MentionSuggestions({
  open,
  suggestions,
  activeIndex,
  loading,
  onSelect,
  onHover,
  className = "",
}: {
  open: boolean;
  suggestions: MentionUser[];
  activeIndex: number;
  loading?: boolean;
  onSelect: (user: MentionUser) => void;
  onHover?: (index: number) => void;
  className?: string;
}) {
  if (!open) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <div
      className={`absolute z-50 left-0 right-0 bottom-full mb-1 max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg ${className}`}
      role="listbox"
    >
      {loading && suggestions.length === 0 ? (
        <div className="px-3 py-2.5 text-xs text-[#4A4A4A]/60">Buscando pessoas…</div>
      ) : (
        suggestions.map((u, i) => (
          <button
            key={u.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseDown={(e) => {
              // mousedown evita blur do textarea antes do click
              e.preventDefault();
              onSelect(u);
            }}
            onMouseEnter={() => onHover?.(i)}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              i === activeIndex ? "bg-[#0A4D5C]/08" : "hover:bg-black/[0.03]"
            }`}
          >
            <UserAvatar
              user={{ id: u.id, display_name: u.display_name || u.username, avatar_url: u.avatar_url }}
              className="h-8 w-8 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#1A1A1A] truncate">
                {u.display_name || u.username}
              </div>
              <div className="text-[11px] text-[#4A4A4A]/60 truncate">@{u.username}</div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
