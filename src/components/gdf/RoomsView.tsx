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
  ChevronUp, X, MoreVertical, Hash, Crown, Shield,
  Camera, Video, Mic, StopCircle, ImagePlus, Music,
  Play, Pause, Volume2, Loader2, Send, Lock, Ban,
  Eye, EyeOff, ShieldAlert, Settings, Search, UserX,
  DoorOpen, DoorClosed, KeyRound, Trash2, AlertTriangle, Flag,
} from "lucide-react";
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

  const myRooms = rooms.filter((r) => r.isMember === true);
  const official = rooms.filter((r) => r.type === "official" && !r.isMember && !r.isBanned);
  const community = rooms.filter((r) => r.type === "community" && !r.isMember && !r.isBanned);

  const handleRoomClick = (room: any) => {
    if (room.isMember) {
      setSelectedRoom(room);
    } else if (room.isBanned) {
      // Usuário banido — mostrar PreEntryScreen com indicador de banimento
      setPreEntryRoom(room);
    } else {
      setPreEntryRoom(room);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Salas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{rooms.length} salas ativas</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 rounded-full px-4 shadow-sm">
          <Plus className="h-4 w-4" /> Nova sala
        </Button>
      </div>

      {myRooms.length > 0 && (
        <div className="rounded-2xl border bg-primary/5 p-3">
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Minhas Salas
          </h3>
          <div className="space-y-1">
            {myRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onClick={() => setSelectedRoom(room)}
              />
            ))}
          </div>
        </div>
      )}
      {official.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Oficiais</h3>
          <div className="space-y-1.5">
            {official.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
            ))}
          </div>
        </div>
      )}
      {community.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Comunidades</h3>
          <div className="space-y-1.5">
            {community.map((room) => (
              <RoomCard key={room.id} room={room} onClick={() => handleRoomClick(room)} />
            ))}
          </div>
        </div>
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
// RoomCard — Card de sala com indicadores visuais
// Regras de renderização:
//   isMember=true  → NUNCA mostra "Entrar", mostra "Abrir Sala"
//   isBanned=true  → Indicador de banimento, sem botão de entrada
//   isClosed=true  → "Sala Fechada"
//   isFull=true    → "Sala Lotada"
//   canJoin=true   → "Entrar"
// ═══════════════════════════════════════════════════════════
function RoomCard({ room, onClick }: { room: any; onClick: () => void }) {
  const memberCount = room.memberCount || room.member_count || room._count?.members || 0;
  const isOfficial = room.type === "official";
  const isClosed = room.is_open === false || room.isOpen === false;
  const isPrivate = room.has_password;
  const isFull = room.max_members && memberCount >= room.max_members;
  const isMember = room.isMember === true;
  const isBanned = room.isBanned === true;

  // Determinar o badge de ação do lado direito
  const renderActionBadge = () => {
    if (isBanned) {
      return <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400">🚫 Banido</Badge>;
    }
    if (isMember) {
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
      className="group flex w-full items-center gap-3.5 rounded-2xl bg-card px-4 py-3.5 text-left transition-all duration-200 hover:bg-accent hover:shadow-sm active:scale-[0.98] border border-transparent hover:border-border/50"
    >
      {/* Icon */}
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl shrink-0 transition-transform group-hover:scale-105 ${
        isOfficial ? "bg-primary/10 text-primary" : "bg-secondary"
      }`}>
        {room.icon}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{room.name}</span>
          {isOfficial && <Crown className="h-3 w-3 text-primary shrink-0" />}
          {/* Membership role indicators */}
          {isMember && room.myRole === "creator" && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
          {isMember && room.myRole === "moderator" && <Shield className="h-3 w-3 text-primary shrink-0" />}
        </div>
        {room.description ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{room.description}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-0.5">{memberCount} membro{memberCount !== 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Member count + action badge */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/80">
            <Users className="h-3 w-3" />
          </div>
          <span className="font-medium tabular-nums">{memberCount}{room.max_members ? `/${room.max_members}` : ""}</span>
        </div>
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
  const [duration, setDuration] = useState<number | null>(7);
  const [loading, setLoading] = useState(false);

  const presets = [
    { label: "1 dia", value: 1 },
    { label: "3 dias", value: 3 },
    { label: "7 dias", value: 7 },
    { label: "15 dias", value: 15 },
    { label: "30 dias", value: 30 },
    { label: "Permanente", value: null },
  ];

  const handleBan = async () => {
    if (!targetUser) return;
    setLoading(true);
    try {
      const body: any = { user_id: targetUser.id };
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
      toast.success(`${targetUser.display_name} foi banido${duration ? ` por ${duration} dia${duration > 1 ? "s" : ""}` : " permanentemente"}`);
      onBanned();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao banir membro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" /> Banir membro
          </DialogTitle>
          <DialogDescription>
            Banir <strong>{targetUser?.display_name}</strong> da sala
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Duração do ban</Label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setDuration(p.value)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    duration === p.value
                      ? "bg-destructive text-destructive-foreground shadow-sm"
                      : "bg-muted hover:bg-accent text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl h-10">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={loading} className="flex-1 rounded-xl h-10">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Banir"}
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

  const fetchBanned = useCallback(async () => {
    setLoadingBanned(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("room_bans")
        .select("id, user_id, banned_until, created_at, profiles:user_id(id, display_name, username, avatar_url)")
        .eq("room_id", room.id);
      setBannedMembers(data || []);
    } catch { /* silent */ }
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

                {/* Info da sala */}
                <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{room.icon || "💬"}</span>
                    <span className="text-sm font-semibold">{room.name}</span>
                  </div>
                  {room.description && (
                    <p className="text-xs text-muted-foreground">{room.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{room.member_count || room.memberCount || 0} membros</span>
                    {room.has_password && <span className="flex items-center gap-0.5"><Lock className="h-3 w-3" />Protegida</span>}
                    <span>{room.is_open ? "Aberta" : "Fechada"}</span>
                  </div>
                </div>

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
}: {
  member: any;
  currentMember: any;
  roomId: string;
  onRefresh: () => void;
  openUserProfile?: (userId: string) => void;
  onInviteOpen: () => void;
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
            <UserAvatar user={{ id: mp?.id || member.user_id, display_name: mp?.display_name || "?", avatar_url: mp?.avatar_url }} className="h-8 w-8" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{mp?.display_name || "Usuário"}</span>
                {isSelf && (
                  <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 shrink-0">Você</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
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
  const [loading, setLoading] = useState(true);
  // isMember e isBanned são derivados exclusivamente do objeto room (vindo da API / Zustand)
  // Nunca usar estado local para participação — a API é a única fonte de verdade
  const isMember = room.isMember === true;
  const isBanned = room.isBanned === true;
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteRoom, setShowDeleteRoom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Mídia no chat ──
  const [sendingMedia, setSendingMedia] = useState(false);
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

  // Cleanup gravação ao desmontar
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (videoRecTimerRef.current) clearInterval(videoRecTimerRef.current);
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${room.id}/messages?limit=50`);
      const data = await res.json();
      if (res.status === 404 || data.error === "Sala não encontrada") {
        // Sala foi excluída — redirecionar
        setRoomDeletedDetected(true);
        toast.error("Esta sala foi excluída", { duration: 5000 });
        setSelectedRoom(null);
        onRefreshRooms();
        return;
      }
      if (data.error) return;
      setMessages(data.messages || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [room.id, setSelectedRoom, onRefreshRooms]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

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
    };
    fetchSender();
  }, []);

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

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 100);
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

  // ═══════ Upload de mídia ═══════
  const uploadChatMedia = async (file: File, type: "image" | "video" | "audio"): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "chat");
      const endpoint = type === "image" ? "/api/upload" : type === "video" ? "/api/upload/video" : "/api/upload/audio";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) return data.url;
      toast.error(data.error || "Erro ao enviar mídia");
      return null;
    } catch {
      toast.error("Erro ao enviar mídia");
      return null;
    }
  };

  // ═══════ Enviar mensagem ═══════
  const sendMessage = async (mediaData?: { media_url?: string; media_type?: string }) => {
    if ((!input.trim() && !mediaData) || !profile || !isMember) return;
    const text = input.trim();
    setInput("");
    setSendingMedia(false);
    try {
      const body: any = { content: text || undefined };
      if (mediaData) {
        if (mediaData.media_url) {
          body.media_url = mediaData.media_url;
          body.media_type = mediaData.media_type;
        }
      }
      if (!body.content && !mediaData) return;
      const res = await fetch(`/api/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    } catch { toast.error("Erro ao enviar mensagem"); }
  };

  // ═══════ Captura de foto da câmera ═══════
  const handleCameraPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    setSendingMedia(true);
    const url = await uploadChatMedia(file, "image");
    if (url) {
      await sendMessage({ media_url: url, media_type: "image" });
    }
    setSendingMedia(false);
    if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
  };

  // ═══════ Foto da galeria ═══════
  const handleGalleryPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    setSendingMedia(true);
    const url = await uploadChatMedia(file, "image");
    if (url) {
      await sendMessage({ media_url: url, media_type: "image" });
    }
    setSendingMedia(false);
    if (galleryPhotoRef.current) galleryPhotoRef.current.value = "";
  };

  // ═══════ Captura de vídeo da câmera ═══════
  const handleCameraVideoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx 50MB)");
      return;
    }
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.onloadedmetadata = async () => {
      if (videoEl.duration > MAX_VIDEO_DURATION) {
        toast.error(`Vídeo muito longo (máx ${MAX_VIDEO_DURATION}s)`);
        URL.revokeObjectURL(videoEl.src);
        return;
      }
      URL.revokeObjectURL(videoEl.src);
      setSendingMedia(true);
      const url = await uploadChatMedia(file, "video");
      if (url) {
        await sendMessage({ media_url: url, media_type: "video" });
      }
      setSendingMedia(false);
    };
    videoEl.src = URL.createObjectURL(file);
    if (cameraVideoRef.current) cameraVideoRef.current.value = "";
  };

  // ═══════ Vídeo de arquivo ═══════
  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx 50MB)");
      return;
    }
    setSendingMedia(true);
    const url = await uploadChatMedia(file, "video");
    if (url) {
      await sendMessage({ media_url: url, media_type: "video" });
    }
    setSendingMedia(false);
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  // ═══════ Áudio de arquivo ═══════
  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachMenuOpen(false);
    setSendingMedia(true);
    const url = await uploadChatMedia(file, "audio");
    if (url) {
      await sendMessage({ media_url: url, media_type: "audio" });
    }
    setSendingMedia(false);
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

        setSendingMedia(true);
        const url = await uploadChatMedia(file, "audio");
        if (url) {
          await sendMessage({ media_url: url, media_type: "audio" });
        }
        setSendingMedia(false);
        setIsRecordingAudio(false);
        setIsPausedRecording(false);
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

        setSendingMedia(true);
        const url = await uploadChatMedia(file, "video");
        if (url) {
          await sendMessage({ media_url: url, media_type: "video" });
        }
        setSendingMedia(false);
        setIsRecordingVideo(false);
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

  // Sort members by hierarchy: creator > moderator > member
  const sortedMembers = [...members].sort((a: any, b: any) => {
    const roleOrder: Record<string, number> = { creator: 0, moderator: 1, member: 2 };
    return (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
  });

  const existingMemberIds = members.map((m: any) => m.user_id);

  return (
    <div className="flex h-full flex-col -mx-4 -mt-4 md:-mx-0 md:-mt-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 rounded-full hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${room.type === "official" ? "bg-primary/10" : "bg-secondary"}`}>
          <span className="text-lg">{room.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold truncate">{room.name}</h3>
            {room.type === "official" && <Crown className="h-3 w-3 text-primary shrink-0" />}
            {room.has_password && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}
            {room.is_open === false && <DoorClosed className="h-3 w-3 text-red-500 shrink-0" />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {memberCount} membro{memberCount !== 1 ? "s" : ""}
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

      {/* ═══════ Member Sidebar ═══════ */}
      {showMembers && (
        <div className="border-b bg-card/50 backdrop-blur-md px-4 py-3 max-h-72 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Membros · {members.length}
            </h4>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setShowMembers(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {membersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" />)}
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum membro ainda</p>
          ) : (
            <div className="space-y-0.5">
              {sortedMembers.map((m: any) => {
                const mp = m.profile;
                if (!mp) {
                  return (
                    <div key={m.id || m.user_id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/50 transition-colors">
                      <UserAvatar user={{ id: m.user_id || "unknown", display_name: "?" }} className="h-8 w-8" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-muted-foreground truncate">Usuário</span>
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
                  />
                );
              })}
            </div>
          )}
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ maxHeight: "calc(100vh - 320px)" }}>
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
              <div key={msg.id} className={`flex gap-2.5 ${msg.isGrouped ? (isMine ? "pl-0 pr-0" : "pl-[38px]") : ""} ${isMine ? "justify-end" : ""}`}>
                {!isMine && showAvatar && (
                  <button onClick={() => openUserProfile?.(sender.id || msg.sender_id)} className="shrink-0">
                    <UserAvatar
                      user={{ id: sender.id || msg.sender_id, display_name: sender.display_name || "Usuário", avatar_url: sender.avatar_url }}
                      className="h-7 w-7 mt-0.5 hover:opacity-80 transition-opacity"
                    />
                  </button>
                )}

                <div className={`max-w-[80%] ${isMine ? "items-end" : "items-start"}`}>
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
                    <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed inline-block break-words ${
                      hasMedia && !msg.content?.trim()
                        ? "bg-transparent p-0"
                        : isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                    }`}>
                      {hasImage && (
                        <div className="mb-1">
                          <img
                            src={msg.media_url}
                            alt="Foto"
                            className="max-w-full max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(msg.media_url, "_blank")}
                          />
                        </div>
                      )}
                      {hasVideo && (
                        <div className="mb-1">
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
                        <ChatAudioPlayer src={msg.media_url} isMine={isMine} />
                      )}
                      {msg.content?.trim() && msg.content !== "📷" && <span>{parseInlineFormatting(msg.content, openUserProfile, { isMine })}</span>}
                    </div>
                    {!isMine && (
                      <span className="text-[9px] text-muted-foreground/50 mb-1 shrink-0">{timeAgo(msg.created_at)}</span>
                    )}
                    {!isMine && (
                      <button
                        onClick={() => useStore.getState().openReportDialog({ targetType: "room_message", targetId: msg.id })}
                        title="Denunciar mensagem"
                        className="mb-1 shrink-0 text-muted-foreground/30 hover:text-red-500 transition-colors"
                      >
                        <Flag className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ Barra de input do chat ═══════ */}
      <div className="border-t px-4 py-3 bg-card/80 backdrop-blur-md">
        {isMember ? (
          <>
            {sendingMedia ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Enviando mídia...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Botão + para abrir menu de anexos (para cima) */}
                <div className="relative" ref={attachMenuRef}>
                  <button
                    onClick={() => setAttachMenuOpen(!attachMenuOpen)}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${attachMenuOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-primary"}`}
                    title="Anexar mídia"
                  >
                    <ChevronUp className={`h-5 w-5 transition-transform ${attachMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* ═══════ Menu de anexos — somente ícones ═══════ */}
                  {attachMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-full bg-popover p-1.5 shadow-lg border border-border z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
                      <button
                        onClick={() => cameraPhotoRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-popover-foreground transition-colors hover:bg-accent"
                        title="Tirar foto"
                      >
                        <Camera className="h-5 w-5 text-primary" />
                      </button>

                      <button
                        onClick={() => galleryPhotoRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-popover-foreground transition-colors hover:bg-accent"
                        title="Foto da galeria"
                      >
                        <ImagePlus className="h-5 w-5 text-primary" />
                      </button>

                      <button
                        onClick={() => cameraVideoRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-popover-foreground transition-colors hover:bg-accent"
                        title="Filmar com câmera"
                      >
                        <Video className="h-5 w-5 text-primary" />
                      </button>

                      <button
                        onClick={() => videoFileRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-popover-foreground transition-colors hover:bg-accent"
                        title="Escolher vídeo"
                      >
                        <Video className="h-5 w-5 text-primary/40" />
                      </button>

                      <button
                        onClick={() => { if (!isRecordingAudio) startAudioRecording(); }}
                        disabled={isRecordingAudio}
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent ${isRecordingAudio ? "text-muted-foreground cursor-not-allowed" : "text-popover-foreground"}`}
                        title="Gravar áudio"
                      >
                        <Mic className={`h-5 w-5 ${isRecordingAudio ? "" : "text-primary"}`} />
                      </button>

                      <button
                        onClick={() => audioFileRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-popover-foreground transition-colors hover:bg-accent"
                        title="Escolher áudio"
                      >
                        <Music className="h-5 w-5 text-primary/40" />
                      </button>
                    </div>
                  )}

                  {/* Hidden inputs */}
                  <input ref={cameraPhotoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={handleCameraPhotoCapture} className="hidden" />
                  <input ref={galleryPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleGalleryPhotoSelect} className="hidden" />
                  <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" onChange={handleCameraVideoCapture} className="hidden" />
                  <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoFileSelect} className="hidden" />
                  <input ref={audioFileRef} type="file" accept="audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,audio/x-m4a" onChange={handleAudioFileSelect} className="hidden" />
                </div>

                {/* Input de texto */}
                <div className="flex-1 relative">
                  <Input
                    placeholder="Escreva uma mensagem..."
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, 2000))}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    className="h-11 rounded-full pl-4 pr-4 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
                  />
                </div>

                {/* Botão enviar 💬 */}
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-md hover:bg-[#25b0a3] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                  title="Enviar"
                >
                  <span className="text-lg leading-none">💬</span>
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>

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
