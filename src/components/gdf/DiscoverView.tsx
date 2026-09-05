"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, MessageCircle, UserRound, Newspaper, Heart, MessageSquare, Repeat2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { LazyImage } from "./LazyImage";
import { toast } from "sonner";
import { timeAgo } from "@/lib/constants";

// ═══════════════════════════════════════════════════════════
// Bento grid de publicações — "vitrine" estilo blog no Descobrir
// Mostra posts de TODOS os usuários e bairros, independentemente
// de o viewer seguir o autor ou não (a API já cuida de respeitar
// posts marcados como "apenas seguidores" / privados).
// ═══════════════════════════════════════════════════════════

const BENTO_TONES = [
  { bg: "#FBF3EC", accent: "#D96C4A" }, // pêssego
  { bg: "#F2F1EA", accent: "#8B7355" }, // areia
  { bg: "#EEF3EF", accent: "#5B7B6B" }, // sálvia
  { bg: "#F6EEF1", accent: "#B4637A" }, // rosa empoeirado
  { bg: "#EEF1F6", accent: "#4A6FA5" }, // azul empoeirado
] as const;

function getBentoTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return BENTO_TONES[Math.abs(hash) % BENTO_TONES.length];
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function bentoSpanClass(index: number, hasImage: boolean): string {
  if (hasImage && index % 5 === 0) return "col-span-2 row-span-2";
  if (index % 7 === 3) return "col-span-2";
  return "";
}

export function DiscoverView({ openUserProfile }: { openUserProfile?: (userId: string) => void }) {
  const { profile } = useStore();

  const navigateToProfile = (uid: string) => {
    if (openUserProfile) {
      openUserProfile(uid);
    } else {
      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: uid } }));
    }
  };

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  // Sugestões e salas pré-carregadas ao montar
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [popularRoomsLoaded, setPopularRoomsLoaded] = useState<any[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);

  // SEC-004: client-side block list for defense in depth
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Publicações (bento grid) — de todos os usuários e bairros
  const [discoverPosts, setDiscoverPosts] = useState<any[]>([]);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  const loadMorePosts = async () => {
    if (loadingMorePosts || !postsCursor) return;
    setLoadingMorePosts(true);
    try {
      const params = new URLSearchParams({ limit: "18", cursor: postsCursor });
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      setDiscoverPosts((prev) => [...prev, ...(data.posts || []).filter((p: any) => !blockedUserIds.has(p.author_id))]);
      setPostsCursor(data.nextCursor ?? null);
      setPostsHasMore(!!data.hasMore);
    } catch { /* silent */ }
    finally { setLoadingMorePosts(false); }
  };

  const openPost = (post: any) => {
    window.dispatchEvent(new CustomEvent("openPostDetail", { detail: { post } }));
  };

  // Fetch block list + suggestions + rooms + publicações on mount
  // (block list first, para filtrar sugestões e publicações)
  useEffect(() => {
    const init = async () => {
      try {
        // Load block list first
        const blockRes = await fetch("/api/blocks");
        const blockData = await blockRes.json();
        if (blockData.blocks) {
          setBlockedUserIds(new Set(blockData.blocks.map((b: any) => b.blocked_id)));
        }
        const ids = new Set((blockData.blocks || []).map((b: any) => b.blocked_id));

        // Then load suggestions, rooms e publicações — filtrando usuários bloqueados
        // Sem parâmetro "neighborhood" => todos os bairros. Sem "authorId" => todos os usuários.
        // A visibilidade (pública/seguidores/privada) continua sendo respeitada pela API.
        const [userData, roomData, postsData] = await Promise.all([
          fetch("/api/users?limit=6").then((r) => r.json()),
          fetch("/api/rooms").then((r) => r.json()),
          fetch("/api/posts?limit=18").then((r) => r.json()),
        ]);
        setSuggestedUsers((userData.users || []).filter((u: any) => !ids.has(u.id)));
        setPopularRoomsLoaded((roomData.rooms || []).filter((r: any) => r.type === "official").slice(0, 5));
        setDiscoverPosts((postsData.posts || []).filter((p: any) => !ids.has(p.author_id)));
        setPostsCursor(postsData.nextCursor ?? null);
        setPostsHasMore(!!postsData.hasMore);
      } catch { /* silent */ }
      finally { setLoadingSuggested(false); setLoadingPosts(false); }
    };
    init();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      const [userRes, roomRes] = await Promise.all([
        fetch(`/api/users?q=${encodeURIComponent(query)}`),
        fetch("/api/rooms"),
      ]);
      const userData = await userRes.json();
      const roomData = await roomRes.json();
      // SEC-004: filter out blocked users client-side
      setUsers((userData.users || []).filter((u: any) => !blockedUserIds.has(u.id)));
      setRooms((roomData.rooms || []).filter((r: any) =>
        r.name.toLowerCase().includes(query.toLowerCase())
      ));
      setSearched(true);
    } catch { /* silent */ }
  };

  const startDM = async (otherUser: any) => {
    if (!profile) return;
    // SEC-004: client-side block check before attempting DM
    if (blockedUserIds.has(otherUser.id)) {
      toast.error("Você não pode enviar mensagens para este usuário");
      return;
    }
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: otherUser.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.conversation) {
        useStore.getState().setSelectedDM(data.conversation);
        useStore.getState().setTab("dms");
      }
    } catch { toast.error("Erro ao iniciar conversa"); }
  };

  return (
    <div className="discover-blog w-full max-w-full min-w-0 overflow-x-hidden space-y-6 sm:space-y-7">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        .discover-blog {
          font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
        }
        .discover-blog .font-serif {
          font-family: "Playfair Display", ui-serif, Georgia, serif;
        }
      `}</style>

      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-[#1A1A1A]">
          Descobrir
        </h1>
        <p className="text-sm text-[#4A4A4A]/70 mt-1">
          Encontre pessoas e salas em Feira de Santana
        </p>
      </div>

      {/* Busca */}
      <div className="flex gap-2 w-full min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A4A4A]/50 pointer-events-none" />
          <Input
            placeholder="Buscar pessoas ou salas..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setSearched(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 h-11 w-full min-w-0 rounded-full border-black/10 bg-white/80 text-[15px] placeholder:text-[#4A4A4A]/45 focus-visible:ring-[#D96C4A]/25"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 px-4 sm:px-5 h-11 shrink-0 disabled:opacity-40"
        >
          Buscar
        </Button>
      </div>

      {/* Resultados */}
      {searched && (
        <div className="space-y-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]/60">
            Resultados para &quot;{query}&quot;
          </h3>

          {users.length > 0 && (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2.5 sm:gap-3 rounded-xl border border-black/[0.06] bg-white/70 p-3 sm:p-3.5 hover:border-black/10 transition-colors min-w-0 w-full"
                >
                  <button onClick={() => navigateToProfile(u.id)} className="shrink-0">
                    <UserAvatar
                      user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }}
                      className="h-11 w-11 hover:opacity-80 transition-opacity"
                    />
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer overflow-hidden" onClick={() => navigateToProfile(u.id)}>
                    <span className="text-sm font-semibold text-[#1A1A1A] truncate block">{u.display_name}</span>
                    <p className="text-xs text-[#4A4A4A]/60">@{u.username}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startDM(u)}
                    className="gap-1.5 shrink-0 rounded-full border-black/10 text-[#1A1A1A] hover:bg-black/5 px-2.5 sm:px-3"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> <span className="hidden xs:inline sm:inline">Conversar</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {rooms.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]/60">Salas</p>
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => useStore.getState().setSelectedRoom(room)}
                  className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white/70 p-3.5 text-left hover:border-black/10 transition-colors"
                >
                  <span className="text-xl w-11 text-center shrink-0">{room.icon || "💬"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-[#1A1A1A]">{room.name}</span>
                    {room.description && (
                      <p className="text-xs text-[#4A4A4A]/60 line-clamp-1">{room.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#4A4A4A]/55 shrink-0">
                    <Users className="h-3.5 w-3.5" />
                    {room.memberCount || 0}
                  </div>
                </button>
              ))}
            </div>
          )}

          {users.length === 0 && rooms.length === 0 && (
            <div className="py-12 text-center">
              <Search className="h-8 w-8 text-black/10 mx-auto mb-2" />
              <p className="font-serif text-lg text-[#4A4A4A]/50">Nenhum resultado</p>
              <p className="text-sm text-[#4A4A4A]/40 mt-1">Tente outro termo de busca</p>
            </div>
          )}
        </div>
      )}

      {/* Sugestões (quando não buscou) */}
      {!searched && (
        <div className="space-y-8">
          {/* Publicações — vitrine estilo blog com posts de todos os bairros e usuários */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Newspaper className="h-4 w-4 text-[#D96C4A]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]/70">
                Publicações da comunidade
              </h2>
            </div>

            {loadingPosts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-[150px] sm:auto-rows-[170px]">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-2xl bg-black/5 animate-pulse" />
                ))}
              </div>
            ) : discoverPosts.length === 0 ? (
              <p className="text-sm text-[#4A4A4A]/50 py-4">Nenhuma publicação por aqui ainda</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-[150px] sm:auto-rows-[170px] grid-flow-row-dense">
                  {discoverPosts.map((post, index) => {
                    const hasImage = !!(post.image_urls && post.image_urls.length > 0);
                    const span = bentoSpanClass(index, hasImage);
                    const author = post.author || {};
                    const snippetSource = post.content?.trim()
                      ? post.content
                      : post.shared_post?.content || "";
                    const snippet = stripHtml(snippetSource);
                    const reactionCount = post.reactions?.length ?? 0;
                    const commentCount = post.comment_count ?? 0;
                    const tone = getBentoTone(post.author_id || author.id || String(index));

                    return (
                      <button
                        key={post.id}
                        onClick={() => openPost(post)}
                        className={`group relative rounded-2xl overflow-hidden border border-black/[0.06] hover:border-black/15 hover:shadow-md transition-all text-left w-full h-full ${span}`}
                        style={!hasImage ? { backgroundColor: tone.bg } : undefined}
                      >
                        {hasImage ? (
                          <>
                            <LazyImage
                              src={post.image_urls[0]}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                            {post.neighborhood && (
                              <span className="absolute top-2.5 left-2.5 rounded-full bg-white/85 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-[#1A1A1A]">
                                {post.neighborhood}
                              </span>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-3.5">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <UserAvatar user={author} className="h-5 w-5 ring-1 ring-white/40" />
                                <span className="text-[11px] font-medium text-white/90 truncate">
                                  {author.display_name}
                                </span>
                                <span className="text-[10px] text-white/60 shrink-0">
                                  · {timeAgo(post.created_at)}
                                </span>
                              </div>
                              {snippet && (
                                <p className="font-serif text-sm text-white leading-snug line-clamp-2">
                                  {snippet}
                                </p>
                              )}
                              {(reactionCount > 0 || commentCount > 0) && (
                                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/70">
                                  {reactionCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" /> {reactionCount}
                                    </span>
                                  )}
                                  {commentCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" /> {commentCount}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col p-3.5 sm:p-4">
                            <span
                              className="font-serif leading-none select-none pointer-events-none"
                              style={{ color: tone.accent, opacity: 0.18, fontSize: "2.75rem" }}
                              aria-hidden="true"
                            >
                              &ldquo;
                            </span>
                            <p
                              className={`font-serif italic text-[#1A1A1A]/85 leading-snug -mt-3 flex-1 ${
                                span.includes("row-span-2") ? "text-lg line-clamp-6" : "text-[13px] line-clamp-3"
                              }`}
                            >
                              {snippet || "Sem legenda"}
                            </p>
                            {post.shared_post && (
                              <span className="flex items-center gap-1 text-[10px] text-[#4A4A4A]/60 mb-1">
                                <Repeat2 className="h-3 w-3" /> compartilhou
                              </span>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <UserAvatar user={author} className="h-5 w-5" />
                                <span className="text-[11px] font-medium text-[#1A1A1A]/80 truncate">
                                  {author.display_name}
                                </span>
                              </div>
                              {post.neighborhood && (
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
                                  style={{ backgroundColor: tone.accent }}
                                >
                                  {post.neighborhood}
                                </span>
                              )}
                            </div>
                            {(reactionCount > 0 || commentCount > 0) && (
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-[#4A4A4A]/55">
                                {reactionCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3 w-3" /> {reactionCount}
                                  </span>
                                )}
                                {commentCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" /> {commentCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {postsHasMore && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      onClick={loadMorePosts}
                      disabled={loadingMorePosts}
                      className="rounded-full border-black/10 text-xs text-[#1A1A1A] hover:bg-black/5 h-9 px-5 disabled:opacity-50"
                    >
                      {loadingMorePosts ? "Carregando..." : "Ver mais publicações"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Pessoas */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <UserRound className="h-4 w-4 text-[#D96C4A]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]/70">
                Pessoas para conhecer
              </h2>
            </div>
            {loadingSuggested ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse p-2">
                    <div className="h-11 w-11 rounded-full bg-black/5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-28 rounded bg-black/5" />
                      <div className="h-2.5 w-20 rounded bg-black/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : suggestedUsers.length === 0 ? (
              <p className="text-sm text-[#4A4A4A]/50 py-4">Nenhuma sugestão no momento</p>
            ) : (
              <div className="space-y-1.5">
                {suggestedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-black/[0.03] transition-colors"
                  >
                    <button onClick={() => navigateToProfile(u.id)} className="shrink-0">
                      <UserAvatar
                        user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }}
                        className="h-11 w-11"
                      />
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToProfile(u.id)}>
                      <span className="text-sm font-medium text-[#1A1A1A]">{u.display_name}</span>
                      <p className="text-xs text-[#4A4A4A]/55">@{u.username}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startDM(u)}
                      className="rounded-full border-black/10 text-xs text-[#1A1A1A] hover:bg-black/5 h-8 px-3"
                    >
                      Conversar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Salas oficiais */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-[#D96C4A]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#4A4A4A]/70">
                Salas em destaque
              </h2>
            </div>
            {loadingSuggested ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-black/5 animate-pulse" />
                ))}
              </div>
            ) : popularRoomsLoaded.length === 0 ? (
              <p className="text-sm text-[#4A4A4A]/50 py-4">Nenhuma sala disponível</p>
            ) : (
              <div className="space-y-2">
                {popularRoomsLoaded.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => useStore.getState().setSelectedRoom(room)}
                    className="flex w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white/60 p-3.5 text-left hover:border-[#D96C4A]/25 hover:bg-white transition-colors"
                  >
                    <span className="text-xl w-10 text-center shrink-0">{room.icon || "💬"}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[#1A1A1A]">{room.name}</span>
                      {room.description && (
                        <p className="text-xs text-[#4A4A4A]/55 line-clamp-1 mt-0.5">{room.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#4A4A4A]/55 shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      {room.memberCount || 0}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
