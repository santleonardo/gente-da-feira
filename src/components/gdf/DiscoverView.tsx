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
    <div className="space-y-6">
      {/* Barra de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar pessoas ou salas..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setSearched(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={!query.trim()}>
          Buscar
        </Button>
      </div>

      {/* Resultados da busca */}
      {searched && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Resultados para &quot;{query}&quot;
          </h3>

          {/* Usuários encontrados */}
          {users.length > 0 && (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <button onClick={() => navigateToProfile(u.id)} className="shrink-0">
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-10 w-10 hover:opacity-80 transition-opacity" />
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToProfile(u.id)}>
                    <span className="text-sm font-semibold">{u.display_name}</span>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startDM(u)} className="gap-1 shrink-0">
                    <MessageCircle className="h-3.5 w-3.5" /> Conversar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Salas encontradas */}
          {rooms.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Salas</p>
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => useStore.getState().setSelectedRoom(room)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-xl">{room.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{room.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Users className="h-3.5 w-3.5" />
                    {room.memberCount || 0}
                  </div>
                </button>
              ))}
            </div>
          )}

          {users.length === 0 && rooms.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado</p>
          )}
        </div>
      )}

      {/* Estado inicial — sugestões */}
      {!searched && (
        <div className="space-y-6">
          {/* Pessoas sugeridas */}
          <div>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Pessoas que você pode conhecer
            </h3>
            {loadingSuggested ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : suggestedUsers.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center">
                <UserRound className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma sugestão por enquanto</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {suggestedUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => navigateToProfile(u.id)}
                    className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-colors hover:bg-accent/50 active:scale-[0.97]"
                  >
                    <UserAvatar
                      user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }}
                      className="h-11 w-11"
                    />
                    <div className="min-w-0 w-full">
                      <p className="truncate text-sm font-medium">{u.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                      {u.neighborhood && (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">{u.neighborhood}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Salas populares */}
          {popularRoomsLoaded.length > 0 && (
            <div>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Salas populares
              </h3>
              <div className="space-y-2">
                {popularRoomsLoaded.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => useStore.getState().setSelectedRoom(room)}
                    className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent"
                  >
                    <span className="text-xl">{room.icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{room.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      {room.memberCount || 0}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
