"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Users, Plus, LogOut, UserPlus, UserCheck,
  ChevronUp, ChevronDown, X, MoreVertical, Hash, Crown, Shield,
  Camera, Video, Mic, StopCircle, ImagePlus, Music,
  Play, Pause, Volume2, Loader2, Send, Lock, Ban,
  Eye, EyeOff, ShieldAlert, Settings, Search, UserX,
  DoorOpen, DoorClosed, KeyRound, Trash2, AlertTriangle, Flag,
  Reply, SmilePlus,
} from "lucide-react";

const ROOM_REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "😢"] as const;
import { getInitials, getAvatarColor, timeAgo } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
import { useRealtimeMessages } from "@/hooks/use-realtime";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { parseInlineFormatting } from "@/lib/link-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROOM_ICONS = [
  "💬", "🏠", "🎮", "⚽", "🎵", "📸", "🎬", "📚",
  "🍕", "💡", "🔧", "🎯", "🌟", "🚀", "❤️", "🔥",
  "🎨", "💻", "🐶", "🌈", "☕", "🛒", "📣", "🤝",
];

const MAX_AUDIO_DURATION = 60;
const MAX_VIDEO_DURATION = 60;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
// RoomsView (main component)
// ═══════════════════════════════════════════════════════════
export function RoomsView({ openUserProfile }: { openUserProfile?: (userId: string) => void }) {
  const { profile, selectedRoom, setSelectedRoom } = useStore();
  const navigateToProfile = (uid: string) => {
    if (openUserProfile) {
      openUserProfile(uid);
    } else {
      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: uid } }));
    }
  };
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [preEntryRoom, setPreEntryRoom] = useState<any>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      const roomsList = data.rooms || [];
      setRooms(roomsList);
      // Manter selectedRoom sincronizado com dados atualizados da API
      const currentSelectedId = useStore.getState().selectedRoom?.id;
      if (currentSelectedId) {
        const updated = roomsList.find((r: any) => r.id === currentSelectedId);
        if (updated) {
          useStore.getState().setSelectedRoom(updated);
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // Re-buscar salas quando a página ganha foco (garante persistência)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchRooms();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchRooms]);

  // If a room is selected (user has entered), show RoomChat
  if (selectedRoom) return <RoomChat room={selectedRoom} onBack={() => setSelectedRoom(null)} onRefreshRooms={fetchRooms} openUserProfile={navigateToProfile} />;

  // If a pre-entry screen is shown
  if (preEntryRoom) return <PreEntryScreen room={preEntryRoom} onBack={() => setPreEntryRoom(null)} onEnter={(room) => { setSelectedRoom(room); setPreEntryRoom(null); }} openUserProfile={navigateToProfile} onRefreshRooms={fetchRooms} />;

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
      ))}
    </div>
  );

  // Minhas salas: não lidas primeiro, depois por última atividade
  const myRooms = rooms
    .filter((r) => r.isMember === true)
    .slice()
    .sort((a, b) => {
      const ua = Number(a.unreadCount) || 0;
      const ub = Number(b.unreadCount) || 0;
      if (ua > 0 && ub === 0) return -1;
      if (ub > 0 && ua === 0) return 1;
      if (ua !== ub) return ub - ua;
      const ta = a.lastMessage?.created_at || a.created_at || "";
      const tb = b.lastMessage?.created_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
  const official = rooms.filter((r) => r.type === "official" && !r.isMember && !r.isBanned);
  const community = rooms.filter((r) => r.type === "community" && !r.isMember && !r.isBanned);

  const openMemberRoom = (room: any) => {
    // Optimistic: zera badge ao abrir (API marca last_read_at no GET /messages)
    if (room.unreadCount) {
      setRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );
    }
    setSelectedRoom(room);
  };

  const handleRoomClick = (room: any) => {
    if (room.isMember) {
      openMemberRoom(room);
    } else if (room.isBanned) {
      // Usuário banido — mostrar PreEntryScreen com indicador de banimento
      setPreEntryRoom(room);
    } else {
      setPreEntryRoom(room);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 pb-2 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Salas</h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
            {rooms.length} sala{rooms.length !== 1 ? "s" : ""} ativa{rooms.length !== 1 ? "s" : ""} · Feira de Santana
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 rounded-full px-3 sm:px-4 h-10 min-h-10 shadow-sm shrink-0">
          <Plus className="h-4 w-4" />
          <span className="text-sm">Nova</span>
        </Button>
      </div>

      {myRooms.length > 0 && (
        <section className="rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.07] to-primary/[0.02] p-3 sm:p-4">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-primary/80 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Minhas Salas
            <span className="ml-auto normal-case tracking-normal font-semibold text-primary/50 flex items-center gap-2">
              {(() => {
                const totalUnread = myRooms.reduce(
                  (acc, r) => acc + (Number(r.unreadCount) || 0),
                  0
                );
                return totalUnread > 0 ? (
                  <span className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground tabular-nums">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                ) : null;
              })()}
              {myRooms.length}
            </span>
          </h3>
          <div className="space-y-2">
            {myRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onClick={() => openMemberRoom(room)}
              />
            ))}
          </div>
        </section>
      )}
      {official.length > 0 && (
        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-primary/60" /> Oficiais
          </h3>
          <div className="space-y-2">
            {official.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
            ))}
          </div>
        </section>
      )}
      {community.length > 0 && (
        <section>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" /> Comunidades
          </h3>
          <div className="space-y-2">
            {community.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
            ))}
          </div>
        </section>
      )}
      {official.length === 0 && community.length === 0 && myRooms.length > 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground">Você já está em todas as salas disponíveis!</p>
        </div>
      )}
      {rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            <Hash className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhuma sala ainda</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Crie a primeira!</p>
        </div>
      )}

      <CreateRoomDialog open={showCreate} onOpenChange={setShowCreate} onCreated={(room) => {
        setSelectedRoom(room);
        fetchRooms();
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Helpers — prévia de última mensagem
// ═══════════════════════════════════════════════════════════
function formatLastMessagePreview(lastMessage: {
  content?: string | null;
  media_type?: string | null;
  sender_name?: string | null;
} | null | undefined): string | null {
  if (!lastMessage) return null;
  const name = lastMessage.sender_name?.trim() || "Alguém";
  if (lastMessage.media_type === "image") return `${name}: 📷 Foto`;
  if (lastMessage.media_type === "video") return `${name}: 🎬 Vídeo`;
  if (lastMessage.media_type === "audio") return `${name}: 🎤 Áudio`;
  const text = (lastMessage.content || "").replace(/\s+/g, " ").trim();
  if (!text || text === "📷") return `${name}: 📷 Foto`;
  const clipped = text.length > 48 ? text.slice(0, 48) + "…" : text;
  return `${name}: ${clipped}`;
}

// ═══════════════════════════════════════════════════════════
// RoomCard — Card de sala com indicadores visuais
// Regras de renderização:
//   isMember=true  → NUNCA mostra "Entrar", mostra "Abrir Sala"
//   isBanned=true  → Indicador de banimento, sem botão de entrada
//   isClosed=true  → "Sala Fechada"
//   isFull=true    → "Sala Lotada"
//   canJoin=true   → "Entrar"
//   lastMessage    → prévia da última mensagem (membros)
//   unreadCount    → badge numérico de não lidas
// ═══════════════════════════════════════════════════════════
function RoomCard({ room, onClick }: { room: any; onClick: () => void }) {
  const memberCount = room.memberCount || room.member_count || room._count?.members || 0;
  const isOfficial = room.type === "official";
  const isClosed = room.is_open === false || room.isOpen === false;
  const isPrivate = room.has_password;
  const isFull = room.max_members && memberCount >= room.max_members;
  const isMember = room.isMember === true;
  const isBanned = room.isBanned === true;
  const unreadCount = isMember ? Math.max(0, Number(room.unreadCount) || 0) : 0;
  const hasUnread = unreadCount > 0;
  const lastPreview = isMember ? formatLastMessagePreview(room.lastMessage) : null;
  const lastAt = room.lastMessage?.created_at ? timeAgo(room.lastMessage.created_at) : null;

  // Determinar o badge de ação do lado direito
  const renderActionBadge = () => {
    if (isBanned) {
      return <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400">🚫 Banido</Badge>;
    }
    if (isMember) {
      if (hasUnread) {
        return (
          <span className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground tabular-nums shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        );
      }
      return (
        <Badge className="text-[8px] px-2 py-0 h-5 bg-[#2EC4B6]/10 text-[#2EC4B6] hover:bg-[#2EC4B6]/15 border-0 gap-1 font-semibold">
          <DoorOpen className="h-2.5 w-2.5" /> Abrir
        </Badge>
      );
    }
    if (isClosed) {
      return <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400">Fechada</Badge>;
    }
    if (isFull) {
      return <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400">Lotada</Badge>;
    }
    if (isPrivate) {
      return (
        <Badge className="text-[8px] px-2 py-0 h-5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0 gap-1">
          <Lock className="h-2.5 w-2.5" /> Entrar
        </Badge>
      );
    }
    return (
      <Badge className="text-[8px] px-2 py-0 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1 font-semibold">
        <UserPlus className="h-2.5 w-2.5" /> Entrar
      </Badge>
    );
  };

  return (
    <button
      onClick={onClick}
      className={`group flex w-full min-w-0 max-w-full items-center gap-2.5 sm:gap-3.5 rounded-2xl px-3 sm:px-4 py-3 sm:py-3.5 text-left transition-all duration-200 active:scale-[0.98] border shadow-sm hover:shadow-md touch-manipulation ${
        isMember
          ? hasUnread
            ? "bg-primary/[0.08] border-primary/25 hover:bg-primary/[0.11]"
            : "bg-primary/[0.04] border-primary/15 hover:bg-primary/[0.07]"
          : "bg-card border-border/50 hover:bg-accent/60 hover:border-border"
      }`}
    >
      {/* Icon + ponto de não lida */}
      <div className="relative shrink-0">
        <div
          className={`flex h-13 w-13 min-h-[3.25rem] min-w-[3.25rem] items-center justify-center rounded-2xl text-2xl transition-transform group-hover:scale-105 ${
            isOfficial
              ? "bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20"
              : "bg-secondary ring-1 ring-border/40"
          }`}
        >
          {room.icon}
        </div>
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
        )}
      </div>

      {/* Name + última mensagem / description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[15px] truncate leading-tight ${
              hasUnread ? "font-bold" : "font-semibold"
            }`}
          >
            {room.name}
          </span>
          {isOfficial && <Crown className="h-3.5 w-3.5 text-primary shrink-0" />}
          {isMember && room.myRole === "creator" && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              Dono
            </span>
          )}
          {isMember && room.myRole === "moderator" && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              Mod
            </span>
          )}
        </div>
        {lastPreview ? (
          <p
            className={`text-xs truncate mt-1 leading-snug ${
              hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"
            }`}
          >
            {lastPreview}
          </p>
        ) : room.description ? (
          <p className="text-xs text-muted-foreground truncate mt-1 leading-snug">{room.description}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-1">
            {memberCount} membro{memberCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Horário / membros + action badge */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {lastAt ? (
          <span
            className={`text-[10px] tabular-nums ${
              hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            {lastAt}
          </span>
        ) : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 opacity-70" />
            <span className="font-semibold tabular-nums">
              {memberCount}
              {room.max_members ? (
                <span className="font-normal text-muted-foreground/70">/{room.max_members}</span>
              ) : null}
            </span>
          </div>
        )}
        {renderActionBadge()}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// CreateRoomDialog — Criar sala com todos os campos
// ═══════════════════════════════════════════════════════════
function CreateRoomDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (room: any) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("💬");
  const [rules, setRules] = useState("");
  const [maxMembers, setMaxMembers] = useState("30");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Nome da sala é obrigatório");
      return;
    }
    setLoading(true);
    try {
      const body: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        icon,
        max_members: parseInt(maxMembers),
        rules: rules.trim() || undefined,
        is_open: isOpen,
      };
      if (password.trim()) {
        body.password = password.trim();
      }
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`Sala "${data.room.name}" criada!`);
      onCreated(data.room);
      onOpenChange(false);
      setName("");
      setDescription("");
      setIcon("💬");
      setRules("");
      setMaxMembers("30");
      setPassword("");
      setShowPassword(false);
      setIsOpen(true);
    } catch {
      toast.error("Erro ao criar sala");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto" aria-describedby="create-room-desc">
        <DialogHeader>
          <DialogTitle className="text-lg">Criar nova sala</DialogTitle>
          <DialogDescription id="create-room-desc" className="text-xs text-muted-foreground">
            Defina nome, regras e limites da sala comunitária.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Icon picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Ícone da sala</Label>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`h-10 w-10 rounded-xl text-lg flex items-center justify-center transition-all duration-150 ${
                    icon === emoji
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 scale-110"
                      : "bg-muted hover:bg-accent hover:scale-105"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Nome da sala *</Label>
            <Input placeholder="Ex: Bate-papo do Centro" value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} maxLength={50} className="h-11 rounded-xl" />
            <span className="text-[10px] text-muted-foreground">{name.length}/50</span>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</Label>
            <Input placeholder="Do que essa sala é sobre?" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} maxLength={200} className="h-11 rounded-xl" />
            <span className="text-[10px] text-muted-foreground">{description.length}/200</span>
          </div>

          {/* Rules */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Regras da sala (opcional)</Label>
            <Textarea
              placeholder="Ex: Respeite todos, sem spam..."
              value={rules}
              onChange={(e) => setRules(e.target.value.slice(0, 500))}
              maxLength={500}
              className="rounded-xl min-h-[80px] resize-none"
              rows={3}
            />
            <span className="text-[10px] text-muted-foreground">{rules.length}/500</span>
          </div>

          {/* Max members */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Máximo de membros</Label>
            <Select value={maxMembers} onValueChange={setMaxMembers}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} membros</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Senha (opcional — sala privada)</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Deixe vazio para sala pública"
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, 30))}
                maxLength={30}
                className="h-11 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Is open switch */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Sala aberta</Label>
              <p className="text-xs text-muted-foreground">Permitir que novos membros entrem</p>
            </div>
            <Switch checked={isOpen} onCheckedChange={setIsOpen} />
          </div>

          <Button onClick={handleCreate} disabled={loading || !name.trim()} className="w-full h-11 rounded-xl">
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...</>
            ) : "Criar sala"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// PreEntryScreen — Tela antes de entrar na sala
// ═══════════════════════════════════════════════════════════
function PreEntryScreen({
  room,
  onBack,
  onEnter,
  openUserProfile,
  onRefreshRooms,
}: {
  room: any;
  onBack: () => void;
  onEnter: (room: any) => void;
  openUserProfile?: (userId: string) => void;
  onRefreshRooms: () => void;
}) {
  const { profile } = useStore();
  const [joining, setJoining] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);

  const memberCount = room.memberCount || room.member_count || room._count?.members || 0;
  const isClosed = room.is_open === false;
  const isPrivate = room.has_password;
  const isFull = room.max_members && memberCount >= room.max_members;

  // Se já é membro, mostrar "Voltar à sala" em vez de "Entrar"
  const alreadyMember = room.isMember === true;

  // Re-validar participação ao montar o PreEntryScreen
  const [freshRoom, setFreshRoom] = useState(room);
  useEffect(() => {
    const revalidate = async () => {
      try {
        const res = await fetch(`/api/rooms/${room.id}`);
        const data = await res.json();
        if (data.room) {
          setFreshRoom(data.room);
          // Se já é membro, o alreadyMember será recalculado
        }
      } catch { /* manter dados existentes */ }
    };
    revalidate();
  }, [room.id]);

  const isActuallyMember = freshRoom.isMember === true;

  useEffect(() => {
    if (room.created_by) {
      const fetchCreator = async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .eq("id", room.created_by)
            .maybeSingle();
          if (data) setCreatorProfile(data);
        } catch { /* silent */ }
      };
      fetchCreator();
    }
  }, [room.created_by]);

  const handleJoin = async (password?: string) => {
    if (!profile) {
      toast.error("Faça login para entrar na sala");
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const body: any = {};
      if (password) body.password = password;
      const res = await fetch(`/api/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (data.error) {
        if (data.requiresPassword) {
          setShowPasswordModal(true);
        } else {
          setError(data.error);
          toast.error(data.error);
        }
        setJoining(false);
        return;
      }
      if (data.joined) {
        toast.success("Você entrou na sala!");
        onRefreshRooms();
        // Atualizar o objeto da sala com isMember=true antes de navegar
        const updatedRoom = { ...room, isMember: true, myRole: room.myRole || "member", canJoin: false, isBanned: false };
        onEnter(updatedRoom);
      }
    } catch {
      setError("Erro ao entrar na sala");
      toast.error("Erro ao entrar na sala");
    } finally {
      setJoining(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (!passwordInput.trim()) {
      toast.error("Digite a senha da sala");
      return;
    }
    setShowPasswordModal(false);
    handleJoin(passwordInput.trim());
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-full hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-bold">Informações da sala</h2>
      </div>

      {/* Room Card */}
      <div className="rounded-2xl bg-card border shadow-sm overflow-hidden">
        {/* Icon + Name Header */}
        <div className="p-6 text-center bg-gradient-to-b from-primary/5 to-transparent">
          <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl ${
            room.type === "official" ? "bg-primary/10" : "bg-secondary"
          }`}>
            {room.icon}
          </div>
          <h3 className="text-xl font-bold">{room.name}</h3>
          {room.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{room.description}</p>
          )}
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!isClosed ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 border-0 gap-1">
                <DoorOpen className="h-3 w-3" /> Aberta
              </Badge>
            ) : (
              <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/15 border-0 gap-1">
                <DoorClosed className="h-3 w-3" /> Fechada
              </Badge>
            )}
            {!isPrivate ? (
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" /> Pública
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 border-0 gap-1">
                <Lock className="h-3 w-3" /> Privada
              </Badge>
            )}
            {room.type === "official" && (
              <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 gap-1">
                <Crown className="h-3 w-3" /> Oficial
              </Badge>
            )}
          </div>

          {/* Member count */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="font-medium">{memberCount}{room.max_members ? `/${room.max_members}` : ""} membros</span>
            {isFull && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">Lotada</Badge>
            )}
          </div>

          {/* Rules */}
          {room.rules && (
            <div className="rounded-xl bg-muted/50 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Shield className="h-3 w-3" /> Regras da sala
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{room.rules}</p>
            </div>
          )}

          {/* Creator info */}
          {creatorProfile && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Criada por</span>
              <button
                onClick={() => openUserProfile?.(creatorProfile.id)}
                className="flex items-center gap-1.5 hover:underline underline-offset-2 transition-all"
              >
                <UserAvatar user={{ id: creatorProfile.id, display_name: creatorProfile.display_name, avatar_url: creatorProfile.avatar_url }} className="h-5 w-5" />
                <span className="font-medium text-foreground">{creatorProfile.display_name}</span>
              </button>
            </div>
          )}

          <Separator />

          {/* Error message */}
          {error && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm p-3 text-center">
              {error}
            </div>
          )}

          {/* Action buttons */}
          {freshRoom.isBanned ? (
            <div className="rounded-xl bg-red-500/10 p-4 text-center">
              <Ban className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-red-600">Você está banido desta sala</p>
            </div>
          ) : isActuallyMember ? (
            <Button
              onClick={() => onEnter(freshRoom)}
              className="w-full h-12 rounded-xl text-base gap-2 shadow-sm bg-[#2EC4B6] hover:bg-[#25b0a3] text-white"
            >
              <UserCheck className="h-5 w-5" /> Voltar à sala
            </Button>
          ) : isClosed ? (
            <div className="text-center space-y-2">
              <div className="rounded-xl bg-muted/50 p-4 text-center">
                <DoorClosed className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Sala fechada</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">No momento esta sala não está aceitando novos membros.</p>
              </div>
            </div>
          ) : isFull ? (
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Sala lotada</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Esta sala atingiu o número máximo de membros.</p>
            </div>
          ) : (
            <Button
              onClick={() => {
                if (isPrivate) {
                  setShowPasswordModal(true);
                } else {
                  handleJoin();
                }
              }}
              disabled={joining}
              className="w-full h-12 rounded-xl text-base gap-2 shadow-sm"
            >
              {joining ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Entrando...</>
              ) : (
                <><UserPlus className="h-5 w-5" /> Entrar na sala</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Password modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" /> Sala privada
            </DialogTitle>
            <DialogDescription>
              Esta sala exige senha para entrar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Digite a senha"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                className="h-11 rounded-xl pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPasswordModal(false)} className="flex-1 rounded-xl h-10">
                Cancelar
              </Button>
              <Button onClick={handlePasswordSubmit} disabled={joining || !passwordInput.trim()} className="flex-1 rounded-xl h-10">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ChatAudioPlayer — Player de áudio nítido com duração real
// ═══════════════════════════════════════════════════════════
function ChatAudioPlayer({ src, isMine }: { src: string; isMine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const trySetDuration = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration;
    if (isFinite(d) && d > 0) {
      setDuration(d);
    }
  }, []);

  const safeDuration = isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const progress = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
      setTimeout(trySetDuration, 200);
      setTimeout(trySetDuration, 1000);
    }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !safeDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * safeDuration;
  };

  const seekTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !safeDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * safeDuration;
  };

  return (
    <div className="rounded-2xl mt-1 min-w-[240px] overflow-hidden bg-white dark:bg-[#2a2a2a]">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <button
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all shadow-md active:scale-95 bg-[#2EC4B6] text-white hover:bg-[#25b0a3]"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-[#0A4D5C] dark:text-white/90">Áudio</span>
              {playing && (
                <div className="flex items-end gap-[2px] h-3.5">
                  <span className="inline-block w-[3px] rounded-full bg-[#2EC4B6]" style={{ height: "5px", animation: "eqBar 0.35s ease-in-out infinite alternate" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#2EC4B6]" style={{ height: "12px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.12s" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#2EC4B6]" style={{ height: "7px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.24s" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#2EC4B6]" style={{ height: "9px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.36s" }} />
                </div>
              )}
            </div>
            <span className="text-xs tabular-nums font-semibold text-[#0A4D5C]/80 dark:text-white/70">
              {formatDuration(safeDuration)}
            </span>
          </div>

          <div
            className="relative h-4 rounded-full cursor-pointer bg-[#8fb5ae] dark:bg-white/25"
            onClick={seek}
            onTouchMove={seekTouch}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 bg-[#2EC4B6]"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md border-2 border-white transition-[left] duration-100 bg-[#2EC4B6]"
              style={{ left: `calc(${Math.max(progress, 1)}% - 8px)` }}
            />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[11px] tabular-nums font-medium text-[#0A4D5C]/60 dark:text-white/60">
              {formatDuration(safeCurrentTime)}
            </span>
            {playing && (
              <span className="text-[10px] tabular-nums text-[#0A4D5C]/40 dark:text-white/40">
                {safeDuration > 0 ? `${Math.round(progress)}%` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime || 0;
          setCurrentTime(isFinite(t) ? t : 0);
          if (!safeDuration) trySetDuration();
        }}
        onLoadedMetadata={() => trySetDuration()}
        onDurationChange={() => trySetDuration()}
        onCanPlay={() => trySetDuration()}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <style jsx>{`
        @keyframes eqBar {
          0% { height: 3px; }
          100% { height: 13px; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BanDialog — Dialog para banir membro com duração
// ═══════════════════════════════════════════════════════════
function BanDialog({
  open,
  onOpenChange,
  targetUser,
  roomId,
  onBanned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: any;
  roomId: string;
  onBanned: () => void;
}) {
  // null = permanente | 1 | 7
  const [duration, setDuration] = useState<number | null>(1);
  const [loading, setLoading] = useState(false);

  const presets: { label: string; value: number | null; hint: string }[] = [
    { label: "1 dia", value: 1, hint: "Ban temporário de 24 horas" },
    { label: "7 dias", value: 7, hint: "Ban temporário de uma semana" },
    { label: "Permanente", value: null, hint: "Só sai com desbanimento manual" },
  ];

  const durationLabel =
    duration === null ? "permanentemente" : duration === 1 ? "por 1 dia" : `por ${duration} dias`;

  const handleBan = async () => {
    if (!targetUser) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { user_id: targetUser.id };
      // API: omitir duration_days (ou null) = permanente
      if (duration !== null) body.duration_days = duration;
      const res = await fetch(`/api/rooms/${roomId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`${targetUser.display_name} foi banido ${durationLabel}`);
      onBanned();
      onOpenChange(false);
      setDuration(1);
    } catch {
      toast.error("Erro ao banir membro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setDuration(1);
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl" aria-describedby="ban-dialog-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" /> Banir membro
          </DialogTitle>
          <DialogDescription id="ban-dialog-desc">
            Banir <strong>{targetUser?.display_name}</strong> da sala. Escolha o prazo:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Duração do ban</Label>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDuration(p.value)}
                  className={`rounded-xl px-3 py-2.5 text-left transition-all border ${
                    duration === p.value
                      ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                      : "bg-muted/60 hover:bg-accent text-foreground border-transparent"
                  }`}
                >
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span
                    className={`block text-[11px] mt-0.5 ${
                      duration === p.value ? "text-destructive-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {p.hint}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Confirmação: ban <strong>{durationLabel}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl h-10">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={loading} className="flex-1 rounded-xl h-10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Banir ${durationLabel}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// InviteDialog — Dialog para convidar usuários
// ═══════════════════════════════════════════════════════════
function InviteDialog({
  open,
  onOpenChange,
  roomId,
  existingMemberIds,
  maxMembers,
  currentMemberCount,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  existingMemberIds: string[];
  maxMembers?: number | null;
  currentMemberCount: number;
  onInvited: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const isFull = maxMembers ? currentMemberCount >= maxMembers : false;

  const handleSearch = useCallback(async (query: string) => {
    setSearch(query);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, neighborhood")
        .or(`display_name.ilike.%${query.trim()}%,username.ilike.%${query.trim()}%`)
        .limit(20);
      const filtered = (data || []).filter((p: any) => !existingMemberIds.includes(p.id));
      setResults(filtered);
    } catch { /* silent */ }
    setSearching(false);
  }, [existingMemberIds]);

  const handleInvite = async (userId: string) => {
    setInviting(userId);
    try {
      const res = await fetch(`/api/rooms/${roomId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Convite enviado!");
      onInvited();
      setResults((prev) => prev.filter((p) => p.id !== userId));
    } catch {
      toast.error("Erro ao enviar convite");
    } finally {
      setInviting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Convidar para a sala
          </DialogTitle>
          <DialogDescription>
            Busque pelo nome ou @username
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isFull && (
            <div className="rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm p-3 text-center">
              Sala lotada — não é possível convidar mais membros
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pessoa..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-11 rounded-xl pl-9"
              disabled={isFull}
            />
          </div>
          <ScrollArea className="max-h-60">
            {searching && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {!searching && search.trim().length >= 2 && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum resultado encontrado</p>
            )}
            <div className="space-y-1">
              {results.map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-accent/50 transition-colors">
                  <UserAvatar user={{ id: user.id, display_name: user.display_name, avatar_url: user.avatar_url }} className="h-9 w-9" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInvite(user.id)}
                    disabled={inviting === user.id || isFull}
                    className="rounded-full px-3 h-8 text-xs"
                  >
                    {inviting === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Convidar"}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// DeleteRoomDialog — Modal de exclusão com confirmação por texto
// ═══════════════════════════════════════════════════════════
function DeleteRoomDialog({
  open,
  onOpenChange,
  room,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: any;
  onDeleted: () => void;
}) {
  const { setSelectedRoom } = useStore();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const roomName = room?.name || "";
  const isMatch = confirmText.trim() === roomName;

  const handleDelete = async () => {
    if (!isMatch) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao excluir sala");
        // Se houve erros parciais, informar
        if (data.deletionErrors && data.deletionErrors.length > 0) {
          console.warn("Erros parciais na exclusão:", data.deletionErrors);
        }
        setDeleting(false);
        return;
      }

      // Emitir evento broadcast em tempo real para todos os usuários da sala
      try {
        const supabase = createClient();
        const channel = supabase.channel(`room-events:${room.id}`);
        await channel.send({
          type: "broadcast",
          event: "room_deleted",
          payload: {
            roomId: room.id,
            roomName: roomName,
            deletedBy: "creator",
            deletedAt: new Date().toISOString(),
          },
        });
        // Aguardar um momento para o broadcast ser enviado antes de remover o canal
        await new Promise((r) => setTimeout(r, 300));
        supabase.removeAllChannels();
      } catch { /* silent — broadcast é best-effort */ }

      toast.success(`Sala "${roomName}" excluída com sucesso`);

      // Limpar estado e redirecionar
      setConfirmText("");
      setDeleting(false);
      onOpenChange(false);
      setSelectedRoom(null);
      onDeleted();
    } catch (err: any) {
      toast.error(err.message || "Erro de conexão ao excluir sala");
      setDeleting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmText("");
      setDeleting(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir sala
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            Esta ação é <strong className="text-destructive">irreversível</strong> e não poderá ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Aviso detalhado */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-medium text-destructive">
              Todos os dados da sala serão permanentemente removidos:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Todas as mensagens da sala</li>
              <li>Todos os membros e moderadores</li>
              <li>Registros de banimento</li>
              <li>Convites pendentes</li>
              <li>Configurações e regras da comunidade</li>
            </ul>
          </div>

          {/* Identificação da sala */}
          <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-lg shrink-0">
              {room?.icon || "💬"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{roomName}</p>
              <p className="text-xs text-muted-foreground">
                {room?.member_count || room?.memberCount || 0} membro{(room?.member_count || room?.memberCount || 0) !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Campo de confirmação */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Digite <strong className="text-foreground">{roomName}</strong> para confirmar a exclusão
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={roomName}
              className="h-11 rounded-xl border-destructive/30 focus-visible:ring-destructive/30"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isMatch || deleting}
            className="rounded-xl gap-2"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Excluir definitivamente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// AdminPanel — Painel administrativo para criador/moderador
// ═══════════════════════════════════════════════════════════
function AdminPanel({
  open,
  onOpenChange,
  room,
  members,
  onRefresh,
  currentProfile,
  onDeleteRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: any;
  members: any[];
  onRefresh: () => void;
  currentProfile: any;
  onDeleteRoom: () => void;
}) {
  const [isOpen, setIsOpen] = useState(room.is_open !== false);
  const [bannedMembers, setBannedMembers] = useState<any[]>([]);
  const [loadingBanned, setLoadingBanned] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<string>(room.rules || "");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const fetchBanned = useCallback(async () => {
    setLoadingBanned(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/members?banned=1`);
      const data = await res.json();
      if (res.ok) {
        // Normaliza para o formato do painel (profile aninhado)
        const list = (data.banned || data.members || []).map((b: any) => ({
          id: b.id,
          user_id: b.user_id,
          banned_until: b.banned_until,
          profiles: b.profile,
        }));
        setBannedMembers(list);
      } else {
        setBannedMembers([]);
      }
    } catch {
      /* silent */
    }
    setLoadingBanned(false);
  }, [room.id]);

  useEffect(() => {
    if (open) fetchBanned();
  }, [open, fetchBanned]);

  const handleToggleOpen = async () => {
    setToggling(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/toggle-open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_open: !isOpen }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setIsOpen(data.is_open);
      toast.success(data.is_open ? "Sala aberta" : "Sala fechada");
      onRefresh();
    } catch {
      toast.error("Erro ao alterar status da sala");
    } finally {
      setToggling(false);
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      const res = await fetch(`/api/rooms/${room.id}/ban`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Membro desbanido");
      fetchBanned();
    } catch {
      toast.error("Erro ao desbanir");
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const body: Record<string, unknown> = {
        rules: rulesDraft.trim(),
      };
      if (clearPassword) {
        body.password = "";
      } else if (passwordDraft.trim()) {
        body.password = passwordDraft.trim();
      }
      const res = await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Configurações salvas");
      setPasswordDraft("");
      setClearPassword(false);
      onRefresh();
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSavingSettings(false);
    }
  };

  const moderators = members.filter((m: any) => m.role === "moderator");
  const isCreator = room.created_by === currentProfile?.id || members.some((m: any) => m.user_id === currentProfile?.id && m.role === "creator");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> Painel de administração
          </DialogTitle>
          <DialogDescription>
            Gerencie a sala {room.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Toggle open/closed */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                {isOpen ? <DoorOpen className="h-4 w-4 text-emerald-500" /> : <DoorClosed className="h-4 w-4 text-red-500" />}
                {isOpen ? "Sala aberta" : "Sala fechada"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isOpen ? "Novos membros podem entrar" : "Ninguém pode entrar na sala"}
              </p>
            </div>
            <Switch checked={isOpen} onCheckedChange={handleToggleOpen} disabled={toggling} />
          </div>

          <Separator />

          {/* Moderators list */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Moderadores</Label>
            {moderators.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum moderador</p>
            ) : (
              <div className="space-y-1">
                {moderators.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2.5 rounded-xl p-2 bg-muted/30">
                    <UserAvatar user={{ id: m.profile?.id || m.user_id, display_name: m.profile?.display_name || "?", avatar_url: m.profile?.avatar_url }} className="h-8 w-8" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.profile?.display_name || "Usuário"}</p>
                    </div>
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0 text-[9px] px-1.5">
                      <Shield className="h-2.5 w-2.5 mr-0.5" /> Mod
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Banned members */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
              <Ban className="h-3 w-3" /> Membros banidos
            </Label>
            {loadingBanned ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : bannedMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum membro banido</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {bannedMembers.map((ban: any) => {
                  const prof = ban.profiles;
                  const isPermanent = !ban.banned_until;
                  return (
                    <div key={ban.id} className="flex items-center gap-2.5 rounded-xl p-2 bg-muted/30">
                      <UserAvatar user={{ id: prof?.id || ban.user_id, display_name: prof?.display_name || "?", avatar_url: prof?.avatar_url }} className="h-8 w-8" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{prof?.display_name || "Usuário"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {isPermanent ? "Banimento permanente" : `Até ${new Date(ban.banned_until).toLocaleDateString("pt-BR")}`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleUnban(ban.user_id)} className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 h-7 px-2 rounded-lg">
                        Desbanir
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ Configurações da Sala (somente criador) ═══ */}
          {isCreator && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                  <Settings className="h-3 w-3" /> Configurações da Sala
                </Label>

                <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{room.icon || "💬"}</span>
                    <span className="text-sm font-semibold">{room.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Users className="h-3 w-3" />
                      {room.member_count || room.memberCount || 0} membros
                    </span>
                    {(room.has_password || clearPassword === false) && room.has_password && !clearPassword && (
                      <span className="flex items-center gap-0.5">
                        <Lock className="h-3 w-3" /> Protegida
                      </span>
                    )}
                    <span>{isOpen ? "Aberta" : "Fechada"}</span>
                  </div>
                </div>

                {/* Regras */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Regras da sala</Label>
                  <textarea
                    value={rulesDraft}
                    onChange={(e) => setRulesDraft(e.target.value.slice(0, 500))}
                    placeholder="Ex.: Respeito mútuo, sem spam..."
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-[10px] text-muted-foreground">{rulesDraft.length}/500</span>
                </div>

                {/* Senha (opcional) */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> Senha da sala
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {room.has_password && !clearPassword
                      ? "Sala protegida. Digite uma nova senha para trocar, ou remova a proteção."
                      : "Opcional. Deixe em branco para manter sem senha."}
                  </p>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={passwordDraft}
                      disabled={clearPassword}
                      onChange={(e) => {
                        setPasswordDraft(e.target.value.slice(0, 64));
                        if (e.target.value) setClearPassword(false);
                      }}
                      placeholder={room.has_password ? "Nova senha" : "Definir senha"}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-10 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {room.has_password && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clearPassword}
                        onChange={(e) => {
                          setClearPassword(e.target.checked);
                          if (e.target.checked) setPasswordDraft("");
                        }}
                        className="rounded border-border"
                      />
                      Remover senha (sala pública)
                    </label>
                  )}
                </div>

                <Button
                  size="sm"
                  className="w-full rounded-xl gap-2"
                  disabled={savingSettings}
                  onClick={handleSaveSettings}
                >
                  {savingSettings ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Salvar regras e senha"
                  )}
                </Button>

                {/* Zona de perigo */}
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-semibold text-destructive">Zona de perigo</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    A exclusão da sala é permanente e não pode ser desfeita. Todos os dados serão removidos.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full rounded-xl gap-2 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onDeleteRoom();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir esta sala
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// MemberActionMenu — Dropdown de ações do membro
// ═══════════════════════════════════════════════════════════
function MemberActionMenu({
  member,
  currentMember,
  roomId,
  onRefresh,
  openUserProfile,
  onInviteOpen,
  isOnline = false,
}: {
  member: any;
  currentMember: any;
  roomId: string;
  onRefresh: () => void;
  openUserProfile?: (userId: string) => void;
  onInviteOpen: () => void;
  isOnline?: boolean;
}) {
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const targetRole = member.role;
  const myRole = currentMember?.role;
  const isSelf = member.user_id === currentMember?.user_id;

  // Determine what actions are available
  const canModerate = myRole === "creator" || myRole === "moderator";
  const canPromote = myRole === "creator";
  const canKick = canModerate && targetRole === "member" && !isSelf;
  const canBan = canModerate && targetRole === "member" && !isSelf;
  const canDemote = myRole === "creator" && targetRole === "moderator";
  const canPromoteToMod = myRole === "creator" && targetRole === "member";

  const handleKick = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.user_id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`${member.profile?.display_name || "Membro"} foi expulso`);
      onRefresh();
    } catch {
      toast.error("Erro ao expulsar membro");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromote = async (role: "moderator" | "member") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.user_id, role }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success(role === "moderator"
        ? `${member.profile?.display_name || "Membro"} agora é moderador`
        : `${member.profile?.display_name || "Membro"} voltou a ser membro`
      );
      onRefresh();
    } catch {
      toast.error("Erro ao alterar cargo");
    } finally {
      setActionLoading(false);
    }
  };

  const mp = member.profile;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 w-full rounded-xl px-2 py-1.5 hover:bg-accent/50 transition-colors text-left">
            <div className="relative shrink-0">
              <UserAvatar user={{ id: mp?.id || member.user_id, display_name: mp?.display_name || "?", avatar_url: mp?.avatar_url }} className="h-8 w-8" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                  isOnline ? "bg-emerald-500" : "bg-muted-foreground/35"
                }`}
                title={isOnline ? "Online" : "Offline"}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{mp?.display_name || "Usuário"}</span>
                {isSelf && (
                  <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 shrink-0">Você</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {member.role === "creator" && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                    <Crown className="h-2.5 w-2.5" /> Criador
                  </span>
                )}
                {member.role === "moderator" && (
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                    <Shield className="h-2.5 w-2.5" /> Moderador
                  </span>
                )}
                {member.role === "member" && (
                  <span className="text-[10px] text-muted-foreground">Membro</span>
                )}
                <span
                  className={`text-[10px] ${
                    isOnline ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground/70"
                  }`}
                >
                  · {isOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            {!isSelf && (
              <MoreVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* View profile */}
          <DropdownMenuItem onClick={() => openUserProfile?.(mp?.id || member.user_id)} className="gap-2">
            <Users className="h-4 w-4" /> Ver perfil
          </DropdownMenuItem>

          {/* Invite to room */}
          <DropdownMenuItem onClick={onInviteOpen} className="gap-2">
            <UserPlus className="h-4 w-4" /> Convidar para sala
          </DropdownMenuItem>

          {/* Creator/moderator actions */}
          {canPromoteToMod && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handlePromote("moderator")} disabled={actionLoading} className="gap-2 text-blue-600 dark:text-blue-400 focus:text-blue-600">
                <Shield className="h-4 w-4" /> Promover a moderador
              </DropdownMenuItem>
            </>
          )}

          {canDemote && (
            <DropdownMenuItem onClick={() => handlePromote("member")} disabled={actionLoading} className="gap-2 text-amber-600 dark:text-amber-400 focus:text-amber-600">
              <ShieldAlert className="h-4 w-4" /> Rebaixar para membro
            </DropdownMenuItem>
          )}

          {canKick && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleKick} disabled={actionLoading} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Expulsar da sala
              </DropdownMenuItem>
            </>
          )}

          {canBan && (
            <DropdownMenuItem onClick={() => setBanDialogOpen(true)} disabled={actionLoading} className="gap-2 text-destructive focus:text-destructive">
              <Ban className="h-4 w-4" /> Banir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <BanDialog
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
        targetUser={mp}
        roomId={roomId}
        onBanned={onRefresh}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// RoomChat — Chat principal com sidebar de membros
// ═══════════════════════════════════════════════════════════
function RoomChat({ room, onBack, onRefreshRooms, openUserProfile }: { room: any; onBack: () => void; onRefreshRooms: () => void; openUserProfile?: (userId: string) => void }) {
  const { profile, setSelectedRoom } = useStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  /** Mensagem sendo respondida (quote) */
  const [replyTo, setReplyTo] = useState<any | null>(null);
  /** Autocomplete de @menção: query após o @ e índice selecionado */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(true);
  /** Infinite scroll: há mensagens mais antigas? */
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Usuário não está no final do chat → mostra botão “Ir para o final” */
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  /** Se true, auto-scroll quando chega mensagem nova */
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const MSG_PAGE_SIZE = 40;
  /** Sheet de reações (mobile-friendly) */
  const [reactionSheetMsgId, setReactionSheetMsgId] = useState<string | null>(null);
  /** Long-press → sheet de ações da mensagem */
  const [messageActionMsg, setMessageActionMsg] = useState<any | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Presença: user_ids online nesta sala */
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  /** Busca na lista de membros */
  const [memberSearch, setMemberSearch] = useState("");
  // isMember e isBanned são derivados exclusivamente do objeto room (vindo da API / Zustand)
  // Nunca usar estado local para participação — a API é a única fonte de verdade
  const isMember = room.isMember === true;
  const isBanned = room.isBanned === true;
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersTab, setMembersTab] = useState<"active" | "banned">("active");
  const [bannedMembers, setBannedMembers] = useState<any[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteRoom, setShowDeleteRoom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Mídia no chat ──
  const [sendingMedia, setSendingMedia] = useState(false);
  /** Preview local antes do upload (foto/vídeo/áudio) */
  const [mediaPreview, setMediaPreview] = useState<{
    file: File;
    type: "image" | "video" | "audio";
    objectUrl: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  // ── Menu de anexos (para cima) ──
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // ── Gravação de áudio com overlay ──
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPausedRecording, setIsPausedRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // ── Gravação de vídeo ──
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoRecSeconds, setVideoRecSeconds] = useState(0);
  const videoMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoRecTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Determine current user's role in the room
  const currentMember = members.find((m: any) => m.user_id === profile?.id);
  const myRole = room.myRole || currentMember?.role || "member";
  const isAdmin = myRole === "creator" || myRole === "moderator";
  const isCreator = myRole === "creator";

  // Fechar menu ao clicar fora
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [attachMenuOpen]);

  // Cleanup gravação e preview ao desmontar
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (videoRecTimerRef.current) clearInterval(videoRecTimerRef.current);
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach((t) => t.stop());
      if (uploadXhrRef.current) {
        uploadXhrRef.current.abort();
        uploadXhrRef.current = null;
      }
    };
  }, []);

  // Revoga object URL do preview quando muda/some
  useEffect(() => {
    return () => {
      if (mediaPreview?.objectUrl) {
        URL.revokeObjectURL(mediaPreview.objectUrl);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPreview?.objectUrl]);

  // Conecta stream da câmera ao preview de vídeo quando a gravação começa
  useEffect(() => {
    if (isRecordingVideo && videoStreamRef.current && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = videoStreamRef.current;
    }
  }, [isRecordingVideo]);

  // ── Escutar evento broadcast de exclusão da sala em tempo real ──
  useEffect(() => {
    if (!profile || !room?.id) return;
    const supabase = createClient();
    const channel = supabase.channel(`room-events:${room.id}`);

    channel.on("broadcast", { event: "room_deleted" }, (payload) => {
      // A sala foi excluída pelo criador — redirecionar imediatamente
      toast.error(`Esta sala foi excluída pelo criador`, {
        duration: 5000,
      });
      // Limpar canais e estado
      supabase.removeAllChannels();
      setSelectedRoom(null);
      onRefreshRooms();
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, room?.id, setSelectedRoom, onRefreshRooms]);

  // ── Presença online/offline na sala (Supabase Realtime Presence) ──
  useEffect(() => {
    if (!profile?.id || !room?.id || !isMember) {
      setOnlineUserIds(new Set());
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`room-presence:${room.id}`, {
      config: { presence: { key: profile.id } },
    });

    const syncPresence = () => {
      const state = channel.presenceState() as Record<
        string,
        { user_id?: string }[]
      >;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        const metas = state[key] || [];
        for (const meta of metas) {
          if (meta?.user_id) ids.add(meta.user_id);
        }
        // fallback: a key do presence costuma ser o user id
        if (key) ids.add(key);
      }
      // Sempre inclui a si mesmo enquanto a aba estiver ativa
      ids.add(profile.id);
      setOnlineUserIds(ids);
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.on("presence", { event: "join" }, syncPresence);
    channel.on("presence", { event: "leave" }, syncPresence);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: profile.id,
          display_name: profile.display_name || "",
          online_at: new Date().toISOString(),
        });
        syncPresence();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        channel.track({
          user_id: profile.id,
          display_name: profile.display_name || "",
          online_at: new Date().toISOString(),
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.display_name, room?.id, isMember]);

  // ── Detectar sala inexistente via erro 404 ao carregar mensagens ──
  // Se a sala foi excluída e o broadcast falhou, detectar via API
  const [roomDeletedDetected, setRoomDeletedDetected] = useState(false);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/members`);
      const data = await res.json();
      if (data.members && data.members.length > 0) {
        setMembers(data.members);
        setMembersLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: rawMembers, error: rmErr } = await supabase
        .from("room_members")
        .select("id, user_id, created_at, role")
        .eq("room_id", room.id);

      if (!rmErr && rawMembers && rawMembers.length > 0) {
        const userIds = rawMembers.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url, neighborhood")
          .in("id", userIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const enriched = rawMembers.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          joined_at: m.created_at,
          role: m.role || "member",
          profile: profileMap.get(m.user_id) || null,
        }));

        setMembers(enriched);
        setMembersLoading(false);
        return;
      }

      if (profile) {
        const isAlreadyInList = members.some((m: any) => m.user_id === profile.id);
        if (!isAlreadyInList) {
          setMembers([{
            id: "self",
            user_id: profile.id,
            joined_at: new Date().toISOString(),
            role: "member",
            profile: { id: profile.id, display_name: profile.display_name, username: profile.username, avatar_url: profile.avatar_url, neighborhood: profile.neighborhood }
          }]);
        }
      }
    } catch (err) {
      if (profile) {
        setMembers([{
          id: "self",
          user_id: profile.id,
          joined_at: new Date().toISOString(),
          role: "member",
          profile: { id: profile.id, display_name: profile.display_name, username: profile.username, avatar_url: profile.avatar_url, neighborhood: profile.neighborhood }
        }]);
      }
    }
    setMembersLoading(false);
  }, [room.id, profile]);

  const fetchBannedMembers = useCallback(async () => {
    setBannedLoading(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/members?banned=1`);
      const data = await res.json();
      if (res.ok) {
        setBannedMembers(data.banned || data.members || []);
      } else {
        setBannedMembers([]);
      }
    } catch {
      setBannedMembers([]);
    }
    setBannedLoading(false);
  }, [room.id]);

  const handleUnbanMember = async (userId: string) => {
    setUnbanningId(userId);
    try {
      const res = await fetch(`/api/rooms/${room.id}/ban`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Membro desbanido");
      setBannedMembers((prev) => prev.filter((b) => b.user_id !== userId));
      fetchMembers();
    } catch {
      toast.error("Erro ao desbanir");
    } finally {
      setUnbanningId(null);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (showMembers && membersTab === "banned" && isAdmin) {
      fetchBannedMembers();
    }
  }, [showMembers, membersTab, isAdmin, fetchBannedMembers]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${room.id}/messages?limit=${MSG_PAGE_SIZE}`);
      const data = await res.json();
      if (res.status === 404 || data.error === "Sala não encontrada") {
        setRoomDeletedDetected(true);
        toast.error("Esta sala foi excluída", { duration: 5000 });
        setSelectedRoom(null);
        onRefreshRooms();
        return;
      }
      if (data.error) return;
      setMessages(data.messages || []);
      setHasMoreOlder(data.hasMore !== false && (data.messages?.length || 0) >= MSG_PAGE_SIZE);
      stickToBottomRef.current = true;
      setShowJumpToBottom(false);
    } catch { /* silent */ }
    setLoading(false);
  }, [room.id, setSelectedRoom, onRefreshRooms]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  /** Carrega mensagens mais antigas (scroll para cima) */
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest?.created_at) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;

    try {
      const res = await fetch(
        `/api/rooms/${room.id}/messages?limit=${MSG_PAGE_SIZE}&before=${encodeURIComponent(oldest.created_at)}`
      );
      const data = await res.json();
      if (data.error || !Array.isArray(data.messages)) {
        setHasMoreOlder(false);
        return;
      }
      const older = data.messages as any[];
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setHasMoreOlder(data.hasMore === true && older.length >= MSG_PAGE_SIZE);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !seen.has(m.id));
        return [...unique, ...prev];
      });
      // Mantém a posição visual após prepend
      requestAnimationFrame(() => {
        if (el) {
          const newHeight = el.scrollHeight;
          el.scrollTop = prevTop + (newHeight - prevHeight);
        }
      });
    } catch {
      /* silent */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, messages, room.id]);

  const isNearBottom = (el: HTMLDivElement, threshold = 80) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom = isNearBottom(el);
    stickToBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom && messages.length > 0);

    // Infinite scroll: perto do topo
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlderRef.current) {
      loadOlderMessages();
    }
  }, [hasMoreOlder, loadOlderMessages, messages.length]);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
  }, []);

  // ── Verificar participação ao montar e quando a sala mudar ──
  // Re-valida com a API para garantir que o estado está correto
  // Usa ref para evitar loop infinito (revalidateMembership chama setSelectedRoom que muda room)
  const roomRef = useRef(room);
  roomRef.current = room;

  const revalidateMembership = useCallback(async () => {
    if (!profile) { setMembershipLoading(false); return; }
    try {
      const res = await fetch(`/api/rooms/${roomRef.current.id}`);
      const data = await res.json();
      if (data.room) {
        const currentRoom = roomRef.current;
        const updated = { ...currentRoom, isMember: data.room.isMember, myRole: data.room.myRole, isBanned: data.room.isBanned, canJoin: data.room.canJoin, isOpen: data.room.isOpen, memberCount: data.room.memberCount, has_password: data.room.has_password };
        setSelectedRoom(updated);
      }
    } catch {
      // Se falhar, manter o estado atual do room object
    }
    setMembershipLoading(false);
  }, [profile, setSelectedRoom]);

  useEffect(() => {
    revalidateMembership();
  }, [revalidateMembership, room.id]);

  // ── Re-validar participação quando a página ganha foco ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        revalidateMembership();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [revalidateMembership]);

  const handleNewMessage = useCallback((payload: any) => {
    const fetchSender = async () => {
      const supabase = createClient();
      const { data: sender } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", payload.sender_id)
        .single();
      const newMsg = { ...payload, sender: sender || { id: payload.sender_id, display_name: "Usuário", username: "" } };
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Se o usuário está com a aba visível dentro do chat, marca como lida
      // para que a mensagem não volte como "não lida" na lista.
      if (document.visibilityState === "visible" && profile?.id) {
        void supabase
          .from("room_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("room_id", room.id)
          .eq("user_id", profile.id);
      }
    };
    fetchSender();
  }, [profile?.id, room.id]);

  useRealtimeMessages({
    table: "messages",
    filter: `room_id=eq.${room.id}`,
    onInsert: handleNewMessage,
    enabled: !!profile && isMember,
  });

  const handleMemberJoin = useCallback((payload: any) => {
    const fetchProf = async () => {
      const supabase = createClient();
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, neighborhood")
        .eq("id", payload.user_id)
        .single();
      if (prof) {
        setMembers((prev) => {
          if (prev.some((m) => m.user_id === payload.user_id)) return prev;
          return [...prev, { id: payload.id, user_id: payload.user_id, joined_at: payload.created_at, role: payload.role || "member", profile: prof }];
        });
      }
    };
    fetchProf();
  }, []);

  const handleMemberLeave = useCallback((payload: any) => {
    setMembers((prev) => prev.filter((m) => m.user_id !== payload.user_id));
    // Se o usuário atual foi removido (kick), atualizar o estado
    if (payload.user_id === profile?.id) {
      setSelectedRoom({ ...roomRef.current, isMember: false, isBanned: false, canJoin: true });
      toast.error("Você foi expulso da sala");
      onRefreshRooms();
    }
  }, [profile?.id, setSelectedRoom, onRefreshRooms]);

  const handleMemberUpdate = useCallback((payload: any) => {
    if (payload.is_banned) {
      // Membro foi banido — remove da lista de membros ativos em tempo real
      setMembers((prev) => prev.filter((m) => m.user_id !== payload.user_id));
      // Se o usuário atual foi banido, atualizar o estado
      if (payload.user_id === profile?.id) {
        setSelectedRoom({ ...roomRef.current, isMember: false, isBanned: true, canJoin: false });
        toast.error("Você foi banido desta sala");
        onRefreshRooms();
      }
      return;
    }
    setMembers((prev) => {
      const exists = prev.some((m) => m.user_id === payload.user_id);
      if (!exists) {
        // Membro foi desbanido e não está na lista local — recarrega para obter o perfil
        fetchMembers();
        return prev;
      }
      return prev.map((m) => m.user_id === payload.user_id ? { ...m, role: payload.role || m.role } : m);
    });
  }, [fetchMembers]);

  useRealtimeMessages({
    table: "room_members",
    filter: `room_id=eq.${room.id}`,
    onInsert: handleMemberJoin,
    onDelete: handleMemberLeave,
    onUpdate: handleMemberUpdate,
    enabled: !!profile,
  });

  // Auto-scroll só se o usuário já estiver no final (ou na carga inicial)
  useEffect(() => {
    if (loading) return;
    if (!stickToBottomRef.current) return;
    const t = setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    }, 50);
    return () => clearTimeout(t);
  }, [messages, loading]);

  const handleJoin = async () => {
    try {
      const res = await fetch(`/api/rooms/${roomRef.current.id}/join`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.joined) {
        // Atualizar room no Zustand — única fonte de verdade
        const updatedRoom = { ...roomRef.current, isMember: true, myRole: roomRef.current.myRole || "member", canJoin: false, isBanned: false };
        setSelectedRoom(updatedRoom);
        setMembershipLoading(false);
        toast.success("Você entrou na sala!");
        fetchMembers();
        onRefreshRooms();
      }
    } catch {
      toast.error("Erro ao entrar na sala");
    }
  };

  const handleLeave = async () => {
    try {
      const res = await fetch(`/api/rooms/${roomRef.current.id}/leave`, { method: "POST" });
      const data = await res.json();
      if (data.left) {
        // Atualizar room no Zustand — única fonte de verdade
        setSelectedRoom({ ...roomRef.current, isMember: false, canJoin: true, isBanned: false });
        toast.success("Você saiu da sala");
        onRefreshRooms();
        onBack();
      }
    } catch {
      toast.error("Erro ao sair da sala");
    }
  };

  useEffect(() => {
    if (showMembers) fetchMembers();
  }, [showMembers, fetchMembers]);

  // ═══════ Preview + upload de mídia com progresso ═══════
  const openMediaPreview = (file: File, type: "image" | "video" | "audio") => {
    // Revoga URL anterior se houver
    if (mediaPreview?.objectUrl) URL.revokeObjectURL(mediaPreview.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    setMediaPreview({ file, type, objectUrl });
    setAttachMenuOpen(false);
  };

  const cancelMediaPreview = () => {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    if (mediaPreview?.objectUrl) URL.revokeObjectURL(mediaPreview.objectUrl);
    setMediaPreview(null);
    setUploadProgress(null);
    setSendingMedia(false);
  };

  const uploadChatMedia = (
    file: File,
    type: "image" | "video" | "audio",
    onProgress?: (pct: number) => void
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "chat");
      const endpoint =
        type === "image"
          ? "/api/upload"
          : type === "video"
            ? "/api/upload/video"
            : "/api/upload/audio";

      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      xhr.open("POST", endpoint);
      xhr.responseType = "json";

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
          onProgress?.(pct);
          setUploadProgress(pct);
        } else {
          onProgress?.(0);
          setUploadProgress(0);
        }
      };

      xhr.onload = () => {
        uploadXhrRef.current = null;
        setUploadProgress(100);
        try {
          const data = xhr.response ?? JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
            resolve(data.url);
            return;
          }
          toast.error(data?.error || "Erro ao enviar mídia");
          resolve(null);
        } catch {
          toast.error("Erro ao enviar mídia");
          resolve(null);
        }
      };

      xhr.onerror = () => {
        uploadXhrRef.current = null;
        toast.error("Erro ao enviar mídia");
        resolve(null);
      };

      xhr.onabort = () => {
        uploadXhrRef.current = null;
        resolve(null);
      };

      xhr.send(formData);
    });
  };

  const confirmMediaPreview = async () => {
    if (!mediaPreview || !profile || !isMember) return;
    const { file, type, objectUrl } = mediaPreview;
    const caption = input.trim();
    const replyingTo = replyTo;
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    setSendingMedia(true);
    setUploadProgress(0);
    const url = await uploadChatMedia(file, type);
    if (!url) {
      setSendingMedia(false);
      setUploadProgress(null);
      return;
    }
    try {
      setInput("");
      setReplyTo(null);
      setMentionQuery(null);
      const body: any = {
        content: caption || undefined,
        media_url: url,
        media_type: type,
      };
      if (replyingTo?.id) body.reply_to_id = replyingTo.id;
      const res = await fetch(`/api/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setInput(caption);
        if (replyingTo) setReplyTo(replyingTo);
      } else if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        URL.revokeObjectURL(objectUrl);
        setMediaPreview(null);
      }
    } catch {
      toast.error("Erro ao enviar mensagem");
      setInput(caption);
      if (replyingTo) setReplyTo(replyingTo);
    }
    setSendingMedia(false);
    setUploadProgress(null);
  };

  // ═══════ Reply + menções ═══════
  const startReply = (msg: any) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelReply = () => setReplyTo(null);

  const mentionCandidates = (() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .map((m: any) => m.profile)
      .filter((p: any) => {
        if (!p || p.id === profile?.id) return false;
        const un = (p.username || "").toLowerCase();
        const dn = (p.display_name || "").toLowerCase();
        if (!q) return true;
        return un.includes(q) || dn.includes(q);
      })
      .slice(0, 6);
  })();

  const detectMention = (value: string, cursorPos?: number) => {
    const pos = cursorPos ?? value.length;
    const before = value.slice(0, pos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (username: string) => {
    const value = input;
    const el = inputRef.current;
    const pos = el?.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const replaced = before.replace(/@\w*$/, `@${username} `);
    const next = (replaced + after).slice(0, 2000);
    setInput(next);
    setMentionQuery(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const newPos = replaced.length;
      inputRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // ═══════ Enviar mensagem ═══════
  const sendMessage = async (mediaData?: { media_url?: string; media_type?: string }) => {
    if ((!input.trim() && !mediaData) || !profile || !isMember) return;
    const text = input.trim();
    const replyingTo = replyTo;
    setInput("");
    setReplyTo(null);
    setMentionQuery(null);
    setSendingMedia(false);
    // Ao enviar, gruda no final
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
    try {
      const body: any = { content: text || undefined };
      if (mediaData) {
        if (mediaData.media_url) {
          body.media_url = mediaData.media_url;
          body.media_type = mediaData.media_type;
        }
      }
      if (replyingTo?.id) {
        body.reply_to_id = replyingTo.id;
      }
      if (!body.content && !mediaData) return;
      const res = await fetch(`/api/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        // Restaura input/reply em caso de erro
        setInput(text);
        if (replyingTo) setReplyTo(replyingTo);
        return;
      }
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    } catch {
      toast.error("Erro ao enviar mensagem");
      setInput(text);
      if (replyingTo) setReplyTo(replyingTo);
    }
  };

  // ═══════ Apagar mensagem (autor ou mod/creator) ═══════
  /** Toggle reação com optimistic UI */
  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openMessageActions = (msg: any) => {
    clearLongPress();
    setMessageActionMsg(msg);
    setReactionSheetMsgId(null);
    setAttachMenuOpen(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!profile || !isMember) return;
    setReactionSheetMsgId(null);
    setMessageActionMsg(null);

    // Snapshot para rollback
    let snapshot: any[] | null = null;
    setMessages((prev) => {
      snapshot = prev;
      return prev.map((m) => {
        if (m.id !== messageId) return m;
        const list: { emoji: string; count: number; me: boolean }[] = [
          ...(m.reactions || []),
        ];
        const idx = list.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const item = list[idx];
          if (item.me) {
            // remove minha reação
            if (item.count <= 1) list.splice(idx, 1);
            else list[idx] = { ...item, count: item.count - 1, me: false };
          } else {
            list[idx] = { ...item, count: item.count + 1, me: true };
          }
        } else {
          list.push({ emoji, count: 1, me: true });
        }
        list.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
        return { ...m, reactions: list };
      });
    });

    try {
      const res = await fetch(`/api/rooms/${room.id}/messages/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (snapshot) setMessages(snapshot);
        toast.error(data.error || "Não foi possível reagir");
        return;
      }
      // Reconcilia com o servidor
      if (Array.isArray(data.reactions)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, reactions: data.reactions } : m
          )
        );
      }
    } catch {
      if (snapshot) setMessages(snapshot);
      toast.error("Erro ao reagir");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm("Apagar esta mensagem?")) return;
    try {
      const res = await fetch(
        `/api/rooms/${room.id}/messages?messageId=${encodeURIComponent(messageId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Não foi possível apagar");
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success(data?.deletedByMod ? "Mensagem removida pela moderação" : "Mensagem apagada");
    } catch {
      toast.error("Erro ao apagar mensagem");
    }
  };

  // ═══════ Captura de foto da câmera ═══════
  const handleCameraPhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openMediaPreview(file, "image");
    if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
  };

  // ═══════ Foto da galeria ═══════
  const handleGalleryPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openMediaPreview(file, "image");
    if (galleryPhotoRef.current) galleryPhotoRef.current.value = "";
  };

  // ═══════ Captura de vídeo da câmera ═══════
  const handleCameraVideoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx 50MB)");
      if (cameraVideoRef.current) cameraVideoRef.current.value = "";
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.onloadedmetadata = () => {
      if (videoEl.duration > MAX_VIDEO_DURATION) {
        toast.error(`Vídeo muito longo (máx ${MAX_VIDEO_DURATION}s)`);
        URL.revokeObjectURL(objectUrl);
        return;
      }
      URL.revokeObjectURL(objectUrl);
      openMediaPreview(file, "video");
    };
    videoEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error("Não foi possível ler o vídeo");
    };
    videoEl.src = objectUrl;
    if (cameraVideoRef.current) cameraVideoRef.current.value = "";
  };

  // ═══════ Vídeo de arquivo ═══════
  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx 50MB)");
      if (videoFileRef.current) videoFileRef.current.value = "";
      return;
    }
    openMediaPreview(file, "video");
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  // ═══════ Áudio de arquivo ═══════
  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openMediaPreview(file, "audio");
    if (audioFileRef.current) audioFileRef.current.value = "";
  };

  // ═══════ Gravação de áudio com overlay ═══════
  const startAudioRecording = async () => {
    setAttachMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType });

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;

        setIsRecordingAudio(false);
        setIsPausedRecording(false);
        openMediaPreview(file, "audio");
      };

      mediaRecorder.start(1000);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev + 1 >= MAX_AUDIO_DURATION) {
            return MAX_AUDIO_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // Auto-stop recording when max duration is reached
  useEffect(() => {
    if (isRecordingAudio && recordingSeconds >= MAX_AUDIO_DURATION) {
      stopAudioRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingSeconds, isRecordingAudio]);

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setIsPausedRecording(false);
    setRecordingSeconds(0);
  };

  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPausedRecording) {
      mediaRecorderRef.current.resume();
      setIsPausedRecording(false);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev + 1 >= MAX_AUDIO_DURATION) {
            return MAX_AUDIO_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPausedRecording(true);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  // ═══════ Gravação de vídeo direto ═══════
  const startVideoRecording = async () => {
    setAttachMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      videoStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      let mimeType = "video/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      videoMediaRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(videoChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `video_${Date.now()}.${ext}`, { type: mimeType });

        if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach((t) => t.stop());
          videoStreamRef.current = null;
        }
        videoMediaRecorderRef.current = null;

        setIsRecordingVideo(false);
        openMediaPreview(file, "video");
      };

      mediaRecorder.start(1000);
      setIsRecordingVideo(true);
      setVideoRecSeconds(0);

      videoRecTimerRef.current = setInterval(() => {
        setVideoRecSeconds((prev) => {
          if (prev + 1 >= MAX_VIDEO_DURATION) {
            stopVideoRecording();
            return MAX_VIDEO_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const stopVideoRecording = () => {
    if (videoRecTimerRef.current) {
      clearInterval(videoRecTimerRef.current);
      videoRecTimerRef.current = null;
    }
    if (videoMediaRecorderRef.current && videoMediaRecorderRef.current.state !== "inactive") {
      videoMediaRecorderRef.current.stop();
    }
  };

  const cancelVideoRecording = () => {
    if (videoRecTimerRef.current) {
      clearInterval(videoRecTimerRef.current);
      videoRecTimerRef.current = null;
    }
    if (videoMediaRecorderRef.current && videoMediaRecorderRef.current.state !== "inactive") {
      videoMediaRecorderRef.current.onstop = null;
      videoMediaRecorderRef.current.stop();
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
    videoMediaRecorderRef.current = null;
    videoChunksRef.current = [];
    setIsRecordingVideo(false);
    setVideoRecSeconds(0);
  };

  const memberCount = members.length || room.memberCount || room.member_count || 0;

  const groupedMessages = messages.map((msg, idx) => {
    const prev = idx > 0 ? messages[idx - 1] : null;
    const isGrouped = prev && prev.sender_id === msg.sender_id;
    return { ...msg, isGrouped };
  });

  // Sort: online primeiro → hierarchy creator > moderator > member → nome
  const memberSearchQ = memberSearch.trim().toLowerCase();
  const sortedMembers = [...members]
    .filter((m: any) => {
      if (!memberSearchQ) return true;
      const p = m.profile;
      const name = (p?.display_name || "").toLowerCase();
      const un = (p?.username || "").toLowerCase();
      return name.includes(memberSearchQ) || un.includes(memberSearchQ);
    })
    .sort((a: any, b: any) => {
      const aOnline = onlineUserIds.has(a.user_id) ? 0 : 1;
      const bOnline = onlineUserIds.has(b.user_id) ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      const roleOrder: Record<string, number> = { creator: 0, moderator: 1, member: 2 };
      const roleDiff = (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
      if (roleDiff !== 0) return roleDiff;
      const an = (a.profile?.display_name || "").toLowerCase();
      const bn = (b.profile?.display_name || "").toLowerCase();
      return an.localeCompare(bn, "pt-BR");
    });

  const onlineCount = members.filter((m: any) => onlineUserIds.has(m.user_id)).length;

  const existingMemberIds = members.map((m: any) => m.user_id);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden bg-background">
      {/* Header — fixo no topo do chat */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 border-b border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 bg-card/95 backdrop-blur-md z-10 safe-area-pt min-w-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 rounded-full hover:bg-accent shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl shrink-0 ${room.type === "official" ? "bg-primary/10 ring-1 ring-primary/15" : "bg-secondary"}`}>
          <span>{room.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm sm:text-base font-bold truncate">{room.name}</h3>
            {room.type === "official" && <Crown className="h-3.5 w-3.5 text-primary shrink-0" />}
            {room.has_password && <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            {room.is_open === false && <DoorClosed className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
            {memberCount} membro{memberCount !== 1 ? "s" : ""}
            {isMember && onlineCount > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {" "}
                · {onlineCount} online
              </span>
            ) : null}
            {room.description ? ` · ${room.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMembers(!showMembers)}
            className="gap-1.5 text-xs rounded-full px-3"
          >
            <Users className="h-4 w-4" />
            <span className="font-medium">{memberCount}</span>
            {isMember && onlineCount > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
          </Button>
          {isMember && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setShowAdminPanel(true)} className="gap-2">
                    <Settings className="h-4 w-4" /> Administração
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowInvite(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" /> Convidar pessoa
                </DropdownMenuItem>
                {isCreator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowDeleteRoom(true)} className="text-destructive focus:text-destructive gap-2">
                      <Trash2 className="h-4 w-4" /> Excluir sala
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLeave} className="text-destructive focus:text-destructive gap-2">
                  <LogOut className="h-4 w-4" /> Sair da sala
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ═══════ Membros: bottom sheet (mobile-first) ═══════ */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label="Fechar membros"
            onClick={() => {
              setShowMembers(false);
              setMembersTab("active");
              setMemberSearch("");
            }}
          />
          <div className="relative z-10 mx-auto w-full max-w-lg overflow-x-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl max-h-[85dvh] flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden shrink-0" />
            <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              {membersTab === "active"
                ? `Membros · ${members.length}${onlineCount > 0 ? ` · ${onlineCount} online` : ""}`
                : `Banidos · ${bannedMembers.length}`}
            </h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => {
                setShowMembers(false);
                setMembersTab("active");
                setMemberSearch("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-4 pb-3 overflow-y-auto flex-1 min-h-0 custom-scrollbar">

          {/* Abas — Banidos só para mod/creator */}
          {isAdmin && (
            <div className="flex rounded-lg bg-muted p-0.5 mb-2.5">
              <button
                type="button"
                onClick={() => setMembersTab("active")}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors ${
                  membersTab === "active" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                Membros
              </button>
              <button
                type="button"
                onClick={() => setMembersTab("banned")}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                  membersTab === "banned" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Ban className="h-3 w-3" /> Banidos
              </button>
            </div>
          )}

          {/* Busca de membros */}
          {membersTab === "active" && members.length > 3 && (
            <div className="relative mb-2.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar membro..."
                className="h-8 pl-8 pr-8 text-xs rounded-full bg-muted/50 border-0"
              />
              {memberSearch && (
                <button
                  type="button"
                  onClick={() => setMemberSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {membersTab === "active" && (
            <>
              {membersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum membro ainda</p>
              ) : sortedMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Nenhum membro encontrado para “{memberSearch}”
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sortedMembers.map((m: any) => {
                    const mp = m.profile;
                    const isOnline = onlineUserIds.has(m.user_id);
                    if (!mp) {
                      return (
                        <div
                          key={m.id || m.user_id}
                          className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/50 transition-colors"
                        >
                          <div className="relative shrink-0">
                            <UserAvatar
                              user={{ id: m.user_id || "unknown", display_name: "?" }}
                              className="h-8 w-8"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                                isOnline ? "bg-emerald-500" : "bg-muted-foreground/35"
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-muted-foreground truncate">
                              Usuário
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <MemberActionMenu
                        key={m.id || m.user_id}
                        member={m}
                        currentMember={currentMember}
                        roomId={room.id}
                        onRefresh={fetchMembers}
                        openUserProfile={openUserProfile}
                        onInviteOpen={() => setShowInvite(true)}
                        isOnline={isOnline}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {membersTab === "banned" && isAdmin && (
            <>
              {bannedLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : bannedMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Nenhum membro banido
                </p>
              ) : (
                <div className="space-y-1">
                  {bannedMembers.map((b: any) => {
                    const prof = b.profile;
                    const until = b.banned_until
                      ? new Date(b.banned_until).toLocaleDateString("pt-BR")
                      : null;
                    return (
                      <div
                        key={b.id || b.user_id}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 bg-muted/30"
                      >
                        <UserAvatar
                          user={{
                            id: prof?.id || b.user_id,
                            display_name: prof?.display_name || "?",
                            avatar_url: prof?.avatar_url,
                          }}
                          className="h-8 w-8"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {prof?.display_name || "Usuário"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {until ? `Até ${until}` : "Banimento permanente"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={unbanningId === b.user_id}
                          onClick={() => handleUnbanMember(b.user_id)}
                          className="text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 h-7 px-2 rounded-lg"
                        >
                          {unbanningId === b.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Desbanir"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          </div>
          </div>
        </div>
      )}

      {/* ═══════ Verificando participação ═══════ */}
      {!isMember && membershipLoading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Verificando participação...</span>
          </div>
        </div>
      )}
      {/* ═══════ Join prompt (não-membro verificado) ═══════ */}
      {!isMember && !membershipLoading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${room.type === "official" ? "bg-primary/10" : "bg-secondary"}`}>
              <span className="text-2xl">{room.icon}</span>
            </div>
            <h3 className="text-base font-bold mb-1">{room.name}</h3>
            {room.description && <p className="text-sm text-muted-foreground mb-1">{room.description}</p>}
            <p className="text-xs text-muted-foreground/60 mb-5">{memberCount} membro{memberCount !== 1 ? "s" : ""} nesta sala</p>
            {isBanned ? (
              <div className="rounded-xl bg-red-500/10 p-4 text-center">
                <Ban className="h-6 w-6 text-red-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-red-600">Você está banido desta sala</p>
              </div>
            ) : (
              <Button onClick={handleJoin} className="gap-2 rounded-full px-6 shadow-sm">
                <UserPlus className="h-4 w-4" /> Entrar na sala
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Messages ═══════ */}
      {isMember && (
        <div className="relative flex-1 min-h-0 flex flex-col min-w-0 overflow-x-hidden">
        <div
          ref={scrollRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 py-3 space-y-1 bg-muted/20"
        >
          {/* Loader no topo: histórico antigo */}
          {loadingOlder && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="ml-2 text-[11px] text-muted-foreground">Carregando histórico...</span>
            </div>
          )}
          {!loadingOlder && !hasMoreOlder && messages.length > 0 && (
            <p className="text-center text-[10px] text-muted-foreground/60 py-2">
              Início da conversa
            </p>
          )}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs text-muted-foreground">Carregando mensagens...</span>
              </div>
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-3">
                <Hash className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
              <p className="text-xs text-muted-foreground mt-0.5">Seja o primeiro a dizer algo!</p>
            </div>
          )}
          {groupedMessages.map((msg, idx) => {
            const isMine = msg.sender_id === profile?.id;
            const sender = msg.sender || {};
            const showAvatar = !isMine && !msg.isGrouped;
            const showName = !isMine && !msg.isGrouped;
            const hasImage = !!msg.media_url && msg.media_type === "image";
            const hasVideo = !!msg.media_url && msg.media_type === "video";
            const hasAudio = !!msg.media_url && msg.media_type === "audio";
            const hasMedia = !!msg.media_url;

            // Find member role for this message's sender
            const senderMember = members.find((m: any) => m.user_id === msg.sender_id);
            const senderRole = senderMember?.role;

            return (
              <div
                key={msg.id}
                className={`flex w-full min-w-0 gap-2 ${msg.isGrouped ? (isMine ? "" : "pl-9") : ""} ${isMine ? "justify-end" : "justify-start"}`}
              >
                {!isMine && showAvatar && (
                  <button onClick={() => openUserProfile?.(sender.id || msg.sender_id)} className="shrink-0">
                    <UserAvatar
                      user={{ id: sender.id || msg.sender_id, display_name: sender.display_name || "Usuário", avatar_url: sender.avatar_url }}
                      className="h-7 w-7 mt-0.5 hover:opacity-80 transition-opacity"
                    />
                  </button>
                )}

                <div className={`min-w-0 max-w-[min(85%,calc(100%-2.75rem))] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  {showName && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <button
                        onClick={() => openUserProfile?.(sender.id || msg.sender_id)}
                        className="text-[11px] font-semibold text-muted-foreground hover:underline underline-offset-2 transition-all"
                      >
                        {sender.display_name || "Usuário"}
                      </button>
                      {senderRole === "creator" && (
                        <Crown className="h-3 w-3 text-amber-500" />
                      )}
                      {senderRole === "moderator" && (
                        <Shield className="h-3 w-3 text-blue-500" />
                      )}
                    </div>
                  )}

                  <div className="flex items-end gap-1.5">
                    {isMine && (
                      <span className="text-[9px] text-muted-foreground/50 mb-1 shrink-0">{timeAgo(msg.created_at)}</span>
                    )}
                    <div
                      role="button"
                      tabIndex={0}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openMessageActions(msg);
                      }}
                      onTouchStart={() => {
                        clearLongPress();
                        longPressTimerRef.current = setTimeout(() => {
                          openMessageActions(msg);
                        }, 480);
                      }}
                      onTouchEnd={clearLongPress}
                      onTouchMove={clearLongPress}
                      onTouchCancel={clearLongPress}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMessageActions(msg);
                        }
                      }}
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed inline-block max-w-full break-words [overflow-wrap:anywhere] select-none touch-manipulation ${
                        hasMedia && !msg.content?.trim() && !msg.reply_to
                          ? "bg-transparent p-0"
                          : isMine
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                      }`}
                    >
                      {/* Quote da mensagem respondida */}
                      {msg.reply_to && (
                        <div
                          className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] leading-snug ${
                            isMine
                              ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/85"
                              : "border-primary/50 bg-background/60 text-muted-foreground"
                          }`}
                        >
                          <p className="font-semibold truncate">
                            {msg.reply_to.is_deleted
                              ? "Mensagem apagada"
                              : msg.reply_to.sender?.display_name || "Usuário"}
                          </p>
                          <p className="truncate opacity-90">
                            {msg.reply_to.is_deleted
                              ? "—"
                              : msg.reply_to.media_type === "image"
                                ? "📷 Foto"
                                : msg.reply_to.media_type === "video"
                                  ? "🎬 Vídeo"
                                  : msg.reply_to.media_type === "audio"
                                    ? "🎤 Áudio"
                                    : (msg.reply_to.content || "").slice(0, 80) || "—"}
                          </p>
                        </div>
                      )}
                      {hasImage && (
                        <div className="mb-1">
                          <img
                            src={msg.media_url}
                            alt="Foto"
                            className="max-w-full max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            loading="lazy"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(msg.media_url, "_blank");
                            }}
                          />
                        </div>
                      )}
                      {hasVideo && (
                        <div className="mb-1" onClick={(e) => e.stopPropagation()}>
                          <video
                            src={msg.media_url}
                            className="max-w-full max-h-64 rounded-xl object-cover"
                            controls
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      )}
                      {hasAudio && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <ChatAudioPlayer src={msg.media_url} isMine={isMine} />
                        </div>
                      )}
                      {msg.content?.trim() && msg.content !== "📷" && <span>{parseInlineFormatting(msg.content, openUserProfile, { isMine })}</span>}
                    </div>
                    {!isMine && (
                      <span className="text-[9px] text-muted-foreground/50 mb-1 shrink-0">{timeAgo(msg.created_at)}</span>
                    )}
                    {/* Desktop: ações rápidas com área de toque maior */}
                    <div className="hidden sm:flex mb-1 shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setReactionSheetMsgId(msg.id)}
                        title="Reagir"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/50 hover:text-primary hover:bg-accent transition-colors"
                      >
                        <SmilePlus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startReply(msg)}
                        title="Responder"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/50 hover:text-primary hover:bg-accent transition-colors"
                      >
                        <Reply className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Mobile: botão único “mais” (além do long-press) */}
                    <button
                      type="button"
                      onClick={() => openMessageActions(msg)}
                      title="Ações"
                      className="sm:hidden mb-1 shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/40 hover:bg-accent"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Chips de reações */}
                  {Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
                    <div
                      className={`mt-1 flex flex-wrap gap-1 ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.reactions.map((r: { emoji: string; count: number; me: boolean }) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => toggleReaction(msg.id, r.emoji)}
                          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
                            r.me
                              ? "border-primary/40 bg-primary/15 text-foreground"
                              : "border-border/60 bg-muted/80 text-muted-foreground hover:bg-accent"
                          }`}
                          title={r.me ? "Remover reação" : "Reagir"}
                        >
                          <span>{r.emoji}</span>
                          {r.count > 1 && (
                            <span className="tabular-nums font-medium">{r.count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

          {/* Botão flutuante: ir para o final */}
          {showJumpToBottom && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-lg text-foreground hover:bg-accent active:scale-95 transition-all"
              title="Ir para o final"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* ═══════ Barra de input do chat ═══════ */}
      <div className="shrink-0 border-t border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 bg-card/95 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {isMember ? (
          <>
            {/* Preview de mídia antes de enviar */}
            {mediaPreview && !sendingMedia && (
              <div className="mb-2 max-w-3xl mx-auto w-full rounded-2xl border border-border bg-muted/40 overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                  <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                    {mediaPreview.type === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaPreview.objectUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    {mediaPreview.type === "video" && (
                      <video
                        src={mediaPreview.objectUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        controls
                      />
                    )}
                    {mediaPreview.type === "audio" && (
                      <div className="flex flex-col items-center gap-1 p-2 w-full">
                        <Mic className="h-6 w-6 text-primary" />
                        <audio src={mediaPreview.objectUrl} controls className="w-full max-w-[88px] h-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground truncate">
                        {mediaPreview.type === "image"
                          ? "📷 Foto"
                          : mediaPreview.type === "video"
                            ? "🎬 Vídeo"
                            : "🎤 Áudio"}
                        {" · "}
                        {(mediaPreview.file.size / 1024).toFixed(0)} KB
                      </p>
                      <button
                        type="button"
                        onClick={cancelMediaPreview}
                        className="text-muted-foreground hover:text-foreground rounded-full p-1"
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Escreva uma legenda abaixo (opcional) e toque em enviar.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelMediaPreview}
                        className="rounded-full h-8 text-xs"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={confirmMediaPreview}
                        className="rounded-full h-8 text-xs gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" /> Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Progresso de upload */}
            {sendingMedia && (
              <div className="mb-2 max-w-3xl mx-auto w-full space-y-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>
                      {uploadProgress === null || uploadProgress < 100
                        ? "Enviando mídia..."
                        : "Publicando..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-primary">
                      {uploadProgress != null ? `${uploadProgress}%` : "…"}
                    </span>
                    <button
                      type="button"
                      onClick={cancelMediaPreview}
                      className="text-xs text-muted-foreground hover:text-red-500 underline-offset-2 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
                    style={{
                      width: `${uploadProgress != null ? Math.max(uploadProgress, 2) : 5}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {!sendingMedia && (
              <div className="flex items-end gap-1.5 sm:gap-2 max-w-3xl mx-auto w-full min-w-0">
                {/* Anexar — abre action sheet */}
                <div className="relative self-end" ref={attachMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAttachMenuOpen(true)}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${attachMenuOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-primary"}`}
                    title="Anexar mídia"
                  >
                    <Plus className="h-5 w-5" />
                  </button>

                  {/* Hidden inputs */}
                  <input ref={cameraPhotoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={handleCameraPhotoCapture} className="hidden" />
                  <input ref={galleryPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleGalleryPhotoSelect} className="hidden" />
                  <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" onChange={handleCameraVideoCapture} className="hidden" />
                  <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoFileSelect} className="hidden" />
                  <input ref={audioFileRef} type="file" accept="audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,audio/x-m4a" onChange={handleAudioFileSelect} className="hidden" />
                </div>

                {/* Coluna input: reply bar + menções + campo */}
                <div className="flex-1 relative min-w-0">
                  {/* Barra de resposta (quote) */}
                  {replyTo && (
                    <div className="mb-1.5 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5">
                      <Reply className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-primary truncate">
                          Respondendo a {replyTo.sender?.display_name || "mensagem"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {replyTo.media_type === "image"
                            ? "📷 Foto"
                            : replyTo.media_type === "video"
                              ? "🎬 Vídeo"
                              : replyTo.media_type === "audio"
                                ? "🎤 Áudio"
                                : (replyTo.content || "").slice(0, 80) || "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={cancelReply}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Cancelar resposta"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Autocomplete @menção (membros da sala) */}
                  {mentionQuery !== null && mentionCandidates.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
                      {mentionCandidates.map((p: any, idx: number) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(p.username || "");
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                            idx === mentionIndex ? "bg-accent" : "hover:bg-accent/60"
                          }`}
                        >
                          <UserAvatar
                            user={{
                              id: p.id,
                              display_name: p.display_name || "?",
                              avatar_url: p.avatar_url,
                            }}
                            className="h-7 w-7"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{p.display_name}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              @{p.username}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <Textarea
                    ref={inputRef}
                    rows={1}
                    placeholder={replyTo ? "Escreva sua resposta..." : "Mensagem… use @ para mencionar"}
                    value={input}
                    onChange={(e) => {
                      const v = e.target.value.slice(0, 2000);
                      setInput(v);
                      detectMention(v, e.target.selectionStart ?? v.length);
                      // auto-grow até ~4 linhas
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (mentionQuery !== null && mentionCandidates.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMentionIndex((i) => (i + 1) % mentionCandidates.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const pick = mentionCandidates[mentionIndex];
                          if (pick?.username) insertMention(pick.username);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setMentionQuery(null);
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (mediaPreview) confirmMediaPreview();
                        else sendMessage();
                      }
                    }}
                    className="min-h-[44px] max-h-[120px] resize-none rounded-2xl py-2.5 pl-4 pr-4 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 text-[15px] leading-snug shadow-none"
                  />
                </div>

                {/* Botão enviar 💬 */}
                <button
                  onClick={() => {
                    if (mediaPreview) {
                      confirmMediaPreview();
                    } else {
                      sendMessage();
                    }
                  }}
                  disabled={mediaPreview ? false : !input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-md hover:bg-[#25b0a3] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 self-end"
                  title={mediaPreview ? "Enviar mídia" : "Enviar"}
                >
                  <span className="text-lg leading-none">💬</span>
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* ═══════ Action sheet: anexos ═══════ */}
      {attachMenuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => setAttachMenuOpen(false)} />
          <div className="relative z-10 mx-auto w-full max-w-lg rounded-t-3xl border border-border bg-card shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <p className="px-4 pt-3 pb-2 text-sm font-semibold">Anexar</p>
            <div className="grid grid-cols-3 gap-2 px-4 pb-2">
              {[
                { label: "Câmera", icon: Camera, action: () => cameraPhotoRef.current?.click() },
                { label: "Galeria", icon: ImagePlus, action: () => galleryPhotoRef.current?.click() },
                { label: "Filmar", icon: Video, action: () => cameraVideoRef.current?.click() },
                { label: "Vídeo", icon: Video, action: () => videoFileRef.current?.click() },
                { label: "Áudio", icon: Mic, action: () => { if (!isRecordingAudio) startAudioRecording(); } },
                { label: "Arquivo áudio", icon: Music, action: () => audioFileRef.current?.click() },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    item.action();
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-muted/50 py-4 px-2 active:scale-95 transition-transform hover:bg-accent"
                >
                  <item.icon className="h-6 w-6 text-primary" />
                  <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="px-4 pb-2">
              <button
                type="button"
                onClick={() => setAttachMenuOpen(false)}
                className="w-full h-12 rounded-2xl bg-muted text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Action sheet: ações da mensagem (long-press) ═══════ */}
      {messageActionMsg && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => setMessageActionMsg(null)} />
          <div className="relative z-10 mx-auto w-full max-w-lg rounded-t-3xl border border-border bg-card shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <p className="px-4 pt-3 pb-1 text-sm font-semibold truncate">
              {messageActionMsg.sender?.display_name || "Mensagem"}
            </p>
            <p className="px-4 pb-3 text-xs text-muted-foreground truncate">
              {messageActionMsg.media_type === "image"
                ? "📷 Foto"
                : messageActionMsg.media_type === "video"
                  ? "🎬 Vídeo"
                  : messageActionMsg.media_type === "audio"
                    ? "🎤 Áudio"
                    : (messageActionMsg.content || "").slice(0, 80)}
            </p>
            <div className="flex flex-col px-2 pb-2">
              <button
                type="button"
                className="flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium hover:bg-accent active:bg-accent"
                onClick={() => {
                  const id = messageActionMsg.id;
                  setMessageActionMsg(null);
                  setReactionSheetMsgId(id);
                }}
              >
                <SmilePlus className="h-5 w-5 text-primary" /> Reagir
              </button>
              <button
                type="button"
                className="flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium hover:bg-accent"
                onClick={() => {
                  startReply(messageActionMsg);
                  setMessageActionMsg(null);
                }}
              >
                <Reply className="h-5 w-5 text-primary" /> Responder
              </button>
              {!!messageActionMsg.content?.trim() && (
                <button
                  type="button"
                  className="flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium hover:bg-accent"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(messageActionMsg.content);
                      toast.success("Copiado");
                    } catch {
                      toast.error("Não foi possível copiar");
                    }
                    setMessageActionMsg(null);
                  }}
                >
                  <Hash className="h-5 w-5 text-muted-foreground" /> Copiar texto
                </button>
              )}
              {messageActionMsg.sender_id !== profile?.id && (
                <button
                  type="button"
                  className="flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium text-red-600 hover:bg-red-500/10"
                  onClick={() => {
                    useStore.getState().openReportDialog({
                      targetType: "room_message",
                      targetId: messageActionMsg.id,
                    });
                    setMessageActionMsg(null);
                  }}
                >
                  <Flag className="h-5 w-5" /> Denunciar
                </button>
              )}
              {(messageActionMsg.sender_id === profile?.id || isAdmin) && (
                <button
                  type="button"
                  className="flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium text-red-600 hover:bg-red-500/10"
                  onClick={() => {
                    const id = messageActionMsg.id;
                    setMessageActionMsg(null);
                    handleDeleteMessage(id);
                  }}
                >
                  <Trash2 className="h-5 w-5" /> Apagar
                </button>
              )}
            </div>
            <div className="px-4 pb-2">
              <button
                type="button"
                onClick={() => setMessageActionMsg(null)}
                className="w-full h-12 rounded-2xl bg-muted text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Sheet de reações ═══════ */}
      {reactionSheetMsgId && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={() => setReactionSheetMsgId(null)} />
          <div className="relative z-10 mx-auto w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-border bg-card p-4 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in zoom-in-95 duration-150">
            <p className="mb-3 text-center text-sm font-semibold">Reagir</p>
            <div className="flex justify-center gap-1.5 flex-wrap">
              {ROOM_REACTION_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => toggleReaction(reactionSheetMsgId, em)}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl hover:bg-accent active:scale-110 transition-transform"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Overlay de gravação de áudio ═══════ */}
      {isRecordingAudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 p-8">
            <div className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] shadow-2xl ${isPausedRecording ? "" : "animate-pulse"}`}>
              <Mic className="h-12 w-12" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#f7f9fa] tabular-nums">{formatDuration(recordingSeconds)}</p>
              <p className="text-xs text-[#f7f9fa]/50 mt-1">{isPausedRecording ? "Pausado" : "Gravando áudio..."}</p>
            </div>
            <div className="w-48 h-2 bg-[#f7f9fa]/20 rounded-full overflow-hidden">
              <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: `${(recordingSeconds / MAX_AUDIO_DURATION) * 100}%` }} />
            </div>
            <div className="flex items-center gap-4">
              <button onClick={togglePauseRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f9fa]/20 transition-colors" title={isPausedRecording ? "Continuar" : "Pausar"}>
                {isPausedRecording ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
              <button onClick={stopAudioRecording} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-lg hover:bg-[#25b0a3] transition-colors" title="Enviar">
                <Send className="h-6 w-6" />
              </button>
              <button onClick={cancelAudioRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-red-500/80 transition-colors" title="Cancelar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Overlay de gravação de vídeo ═══════ */}
      {isRecordingVideo && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#000305]/90 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4">
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              playsInline
              className="w-full rounded-2xl max-h-[60vh] object-cover"
            />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[#f7f9fa] font-bold tabular-nums">{formatDuration(videoRecSeconds)}</span>
              <span className="text-[#f7f9fa]/50 text-xs">/ {MAX_VIDEO_DURATION}s</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="w-full h-1.5 bg-[#f7f9fa]/20 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: `${(videoRecSeconds / MAX_VIDEO_DURATION) * 100}%` }} />
              </div>
              <div className="flex items-center justify-center gap-4">
                <button onClick={cancelVideoRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-red-500/80 transition-colors" title="Cancelar">
                  <X className="h-5 w-5" />
                </button>
                <button onClick={stopVideoRecording} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-lg hover:bg-[#25b0a3] transition-colors" title="Enviar vídeo">
                  <Send className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Admin Panel Dialog ═══════ */}
      <AdminPanel
        open={showAdminPanel}
        onOpenChange={setShowAdminPanel}
        room={room}
        members={members}
        onRefresh={fetchMembers}
        currentProfile={profile}
        onDeleteRoom={() => setShowDeleteRoom(true)}
      />

      {/* ═══════ Invite Dialog ═══════ */}
      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        roomId={room.id}
        existingMemberIds={existingMemberIds}
        maxMembers={room.max_members}
        currentMemberCount={memberCount}
        onInvited={fetchMembers}
      />

      {/* ═══════ Delete Room Dialog ═══════ */}
      <DeleteRoomDialog
        open={showDeleteRoom}
        onOpenChange={setShowDeleteRoom}
        room={room}
        onDeleted={() => {
          setSelectedRoom(null);
          onRefreshRooms();
        }}
      />
    </div>
  );
}
