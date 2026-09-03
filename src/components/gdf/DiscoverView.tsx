"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, MessageCircle, UserRound } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { toast } from "sonner";

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

  // Fetch block list + suggestions + rooms on mount (block list first to filter suggestions)
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

        // Then load suggestions and rooms, filtering out blocked users
        const [userData, roomData] = await Promise.all([
          fetch("/api/users?limit=6").then((r) => r.json()),
          fetch("/api/rooms").then((r) => r.json()),
        ]);
        setSuggestedUsers((userData.users || []).filter((u: any) => !ids.has(u.id)));
        setPopularRoomsLoaded((roomData.rooms || []).filter((r: any) => r.type === "official").slice(0, 5));
      } catch { /* silent */ }
      finally { setLoadingSuggested(false); }
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
    <div className="discover-blog space-y-7">
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A4A4A]/50" />
          <Input
            placeholder="Buscar pessoas ou salas..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setSearched(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 h-11 rounded-full border-black/10 bg-white/80 text-[15px] placeholder:text-[#4A4A4A]/45 focus-visible:ring-[#D96C4A]/25"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="rounded-full bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/90 px-5 h-11 disabled:opacity-40"
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
                  className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white/70 p-3.5 hover:border-black/10 transition-colors"
                >
                  <button onClick={() => navigateToProfile(u.id)} className="shrink-0">
                    <UserAvatar
                      user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }}
                      className="h-11 w-11 hover:opacity-80 transition-opacity"
                    />
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToProfile(u.id)}>
                    <span className="text-sm font-semibold text-[#1A1A1A]">{u.display_name}</span>
                    <p className="text-xs text-[#4A4A4A]/60">@{u.username}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startDM(u)}
                    className="gap-1.5 shrink-0 rounded-full border-black/10 text-[#1A1A1A] hover:bg-black/5"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Conversar
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
