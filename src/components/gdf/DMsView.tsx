"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, UserPlus, Search, MessageSquare,
  Camera, Mic, X, ImagePlus, Video, Music,
  Play, Pause, Send, ChevronUp, Loader2,
  Trash2, Flag,
} from "lucide-react";
import { timeAgo } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
import { LazyImage } from "./LazyImage";
import { useRealtimeMessages } from "@/hooks/use-realtime";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { parseInlineFormatting } from "@/lib/link-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { compressImage, validateImageFile, getExtensionForBlob } from "@/lib/image-compression";

const MAX_AUDIO_DURATION = 60;
const MAX_VIDEO_DURATION = 60;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
// ChatAudioPlayer — Player de áudio nítido com duração real
// ═══════════════════════════════════════════════════════════
function ChatAudioPlayer({ src, isMine }: { src: string; isMine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Função robusta para extrair duração do áudio
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
      // Ao começar a tocar, tenta pegar a duração novamente
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

  // Seek por toque no mobile
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
        {/* Botão play/pause */}
        <button
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all shadow-md active:scale-95 bg-[#D96C4A] text-white hover:bg-[#c15a3a]"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Linha superior: label + equalizer + duração total */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-[#1A1A1A] dark:text-white/90">Áudio</span>
              {playing && (
                <div className="flex items-end gap-[2px] h-3.5">
                  <span className="inline-block w-[3px] rounded-full bg-[#D96C4A]" style={{ height: "5px", animation: "eqBar 0.35s ease-in-out infinite alternate" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#D96C4A]" style={{ height: "12px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.12s" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#D96C4A]" style={{ height: "7px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.24s" }} />
                  <span className="inline-block w-[3px] rounded-full bg-[#D96C4A]" style={{ height: "9px", animation: "eqBar 0.35s ease-in-out infinite alternate 0.36s" }} />
                </div>
              )}
            </div>
            <span className="text-xs tabular-nums font-semibold text-[#1A1A1A]/80 dark:text-white/70">
              {formatDuration(safeDuration)}
            </span>
          </div>

          {/* Barra de progresso — mais escura para contrastar com fundo branco */}
          <div
            className="relative h-4 rounded-full cursor-pointer bg-[#8fb5ae] dark:bg-white/25"
            onClick={seek}
            onTouchMove={seekTouch}
          >
            {/* Trilha preenchida */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 bg-[#D96C4A]"
              style={{ width: `${progress}%` }}
            />
            {/* Thumb — sempre visível */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md border-2 border-white transition-[left] duration-100 bg-[#D96C4A]"
              style={{ left: `calc(${Math.max(progress, 1)}% - 8px)` }}
            />
          </div>

          {/* Linha inferior: tempo atual */}
          <div className="flex justify-between items-center">
            <span className="text-[11px] tabular-nums font-medium text-[#1A1A1A]/60 dark:text-white/60">
              {formatDuration(safeCurrentTime)}
            </span>
            {playing && (
              <span className="text-[10px] tabular-nums text-[#1A1A1A]/40 dark:text-white/40">
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
          // Tenta pegar duração a cada timeUpdate se ainda não temos
          if (!safeDuration) trySetDuration();
        }}
        onLoadedMetadata={() => trySetDuration()}
        onDurationChange={() => trySetDuration()}
        onCanPlay={() => trySetDuration()}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      {/* CSS para animação do equalizer */}
      <style jsx>{`
        @keyframes eqBar {
          0% { height: 3px; }
          100% { height: 13px; }
        }
      `}</style>
    </div>
  );
}

export function DMsView({ openUserProfile }: { openUserProfile?: (userId: string) => void }) {
  const { profile, selectedDM, setSelectedDM } = useStore();
  const navigateToProfile = (uid: string) => {
    if (openUserProfile) {
      openUserProfile(uid);
    } else {
      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: uid } }));
    }
  };
  const [conversations, setConversations] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [searchUsers, setSearchUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDMs = useCallback(async () => {
    try {
      const res = await fetch("/api/dm");
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setConversations(data.conversations || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDMs(); }, [fetchDMs]);

  const handleSearch = async (q: string) => {
    if (q.length < 2) { setSearchUsers([]); return; }
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchUsers(data.users || []);
    } catch { /* silent */ }
  };

  const startConversation = async (otherUser: any) => {
    if (!profile) return;
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: otherUser.id }),
      });
      const data = await res.json();
      // SEC-004: handle blocked user error
      if (res.status === 403 || data.error) {
        toast.error(data.error || "Não é possível iniciar conversa com este usuário");
        return;
      }
      if (data.conversation) {
        setSelectedDM(data.conversation);
        setShowNew(false);
        fetchDMs();
      }
    } catch { toast.error("Erro ao criar conversa"); }
  };

  if (selectedDM) return <DMChat conversation={selectedDM} onBack={() => { setSelectedDM(null); fetchDMs(); }} openUserProfile={navigateToProfile} />;

  return (
    <div className="space-y-5 w-full min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-[#1A1A1A]">Mensagens</h2>
          <p className="text-xs text-[#4A4A4A]/80 mt-0.5">{conversations.length} conversa{conversations.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5 rounded-full px-4 shadow-sm bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/90">
          <UserPlus className="h-4 w-4" /> Nova
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-[#EFEDE8]/50 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && conversations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFEDE8] mb-3">
            <MessageSquare className="h-6 w-6 text-[#4A4A4A]/70" />
          </div>
          <p className="font-serif text-lg text-[#1A1A1A]/50">Nenhuma conversa ainda</p>
          <p className="text-xs text-[#4A4A4A]/70 mt-1">Comece uma conversa em &quot;Nova&quot;</p>
        </div>
      )}

      <div className="space-y-1">
        {conversations.map((conv) => {
          const other = conv.initiator_id === profile?.id ? conv.receiver : conv.initiator;
          return (
            <button
              key={conv.id}
              onClick={() => setSelectedDM(conv)}
              className="group flex w-full items-center gap-3.5 rounded-2xl bg-white px-4 py-3.5 text-left transition-all duration-200 hover:bg-[#1A1A1A]/[0.05] hover:shadow-sm active:scale-[0.98] border border-transparent hover:border-black/[0.08]"
            >
              <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); navigateToProfile(other.id); }}>
                <UserAvatar user={{ id: other.id, display_name: other.display_name, avatar_url: other.avatar_url }} className="h-12 w-12 hover:opacity-80 transition-opacity" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{other.display_name}</span>
                  <span className="text-[10px] text-[#4A4A4A]/60 shrink-0">{timeAgo(conv.updated_at)}</span>
                </div>
                <p className="text-xs text-[#4A4A4A] truncate mt-0.5">@{other.username}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Nova conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A4A4A]" />
              <Input
                placeholder="Buscar por nome ou @usuario..."
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
                className="pl-9 h-11 rounded-xl"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5 custom-scrollbar">
              {searchUsers.length === 0 && (
                <p className="text-xs text-[#4A4A4A] text-center py-6">Digite para buscar pessoas</p>
              )}
              {searchUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversation(u)}
                  className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-150 hover:bg-[#1A1A1A]/[0.05] active:scale-[0.98]"
                >
                  <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-10 w-10" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.display_name}</div>
                    <div className="text-xs text-[#4A4A4A]">@{u.username}</div>
                  </div>
                  <MessageSquare className="h-4 w-4 text-[#4A4A4A]" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DMChat — Redesenhado com overlay de gravação + 💬 + menu para cima + mídia real
// ═══════════════════════════════════════════════════════════
function DMChat({ conversation, onBack, openUserProfile }: { conversation: any; onBack: () => void; openUserProfile?: (userId: string) => void }) {
  const { profile } = useStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Mídia ──
  const [sendingMedia, setSendingMedia] = useState(false);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  // ── Confirmação de envio de mídia ──
  const [pendingMedia, setPendingMedia] = useState<{ file: File; type: "image" | "video" | "audio"; previewUrl?: string } | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

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

  const other = conversation.initiator_id === profile?.id ? conversation.receiver : conversation.initiator;

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

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/dm/${conversation.id}/messages`);
      // SEC-004: handle 403 (blocked conversation) — go back and refresh list
      if (res.status === 403) {
        toast.error("Esta conversa não está mais disponível");
        onBack();
        return;
      }
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setMessages(data.messages || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [conversation.id, onBack]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

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
    filter: `dm_id=eq.${conversation.id}`,
    onInsert: handleNewMessage,
    enabled: !!profile,
  });

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 100);
  }, [messages, loading]);

  // ═══════ Upload de mídia ═══════
  const uploadChatMedia = async (file: File, type: "image" | "video" | "audio"): Promise<string | null> => {
    try {
      let fileToUpload = file;
      
      // Compressão automática de TODAS as imagens (servidor aceita máx 1MB)
      // Para imagens acima de 5MB, mostra toast de compressão
      if (type === "image") {
        if (file.size > 5 * 1024 * 1024) {
          toast.info("Comprimindo imagem...");
        }
        try {
          const compressed = await compressImage(file, { maxSizeKB: 900 });
          fileToUpload = new File([compressed], file.name.replace(/\.\w+$/, `.${getExtensionForBlob(compressed)}`), { type: compressed.type });
        } catch {
          toast.error("Erro ao comprimir imagem");
          return null;
        }
      }
      
      const formData = new FormData();
      formData.append("file", fileToUpload);
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

  // ═══════ Enviar mensagem (texto ou com mídia) ═══════
  const sendMessage = async (mediaData?: { media_url?: string; media_type?: string }) => {
    if ((!input.trim() && !mediaData) || !profile) return;
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
      const res = await fetch(`/api/dm/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // SEC-004: handle 403 (blocked conversation) — go back and refresh list
      if (res.status === 403) {
        toast.error("Você não pode enviar mensagens para este usuário");
        onBack();
        return;
      }
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    } catch { toast.error("Erro ao enviar"); }
  };

  // ═══════ Confirmação de envio de mídia ═══════
  const handleMediaSelected = (file: File, type: "image" | "video" | "audio") => {
    setAttachMenuOpen(false);
    
    // Validate video duration
    if (type === "video") {
      if (file.size > 50 * 1024 * 1024) {
        toast.error("Vídeo muito grande (máx 50MB)");
        return;
      }
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.onloadedmetadata = () => {
        if (videoEl.duration > MAX_VIDEO_DURATION) {
          toast.error(`Vídeo muito longo (máx ${MAX_VIDEO_DURATION}s)`);
          URL.revokeObjectURL(videoEl.src);
          return;
        }
        URL.revokeObjectURL(videoEl.src);
        const previewUrl = URL.createObjectURL(file);
        setPendingMedia({ file, type, previewUrl });
        setConfirmSendOpen(true);
      };
      videoEl.src = URL.createObjectURL(file);
      return;
    }
    
    const previewUrl = type === "image" ? URL.createObjectURL(file) : undefined;
    setPendingMedia({ file, type, previewUrl });
    setConfirmSendOpen(true);
  };

  const confirmSendMedia = async () => {
    if (!pendingMedia) return;
    setConfirmSendOpen(false);
    setSendingMedia(true);
    const url = await uploadChatMedia(pendingMedia.file, pendingMedia.type);
    if (pendingMedia.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    if (url) {
      await sendMessage({ media_url: url, media_type: pendingMedia.type });
    }
    setSendingMedia(false);
    setPendingMedia(null);
  };

  const cancelSendMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setConfirmSendOpen(false);
    setPendingMedia(null);
  };

  // ═══════ Captura de foto da câmera ═══════
  const handleCameraPhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMediaSelected(file, "image");
    if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
  };

  // ═══════ Foto da galeria ═══════
  const handleGalleryPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMediaSelected(file, "image");
    if (galleryPhotoRef.current) galleryPhotoRef.current.value = "";
  };

  // ═══════ Captura de vídeo da câmera ═══════
  const handleCameraVideoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMediaSelected(file, "video");
    if (cameraVideoRef.current) cameraVideoRef.current.value = "";
  };

  // ═══════ Vídeo de arquivo ═══════
  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMediaSelected(file, "video");
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  // ═══════ Áudio de arquivo ═══════
  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMediaSelected(file, "audio");
    if (audioFileRef.current) audioFileRef.current.value = "";
  };

  // ═══════ Gravação de áudio com overlay (igual ao feed) ═══════
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

      // Conecta o stream ao preview de vídeo para a pessoa se ver
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

  const groupedMessages = messages.map((msg: any, idx: number) => {
    const prev = idx > 0 ? messages[idx - 1] : null;
    const isGrouped = prev && prev.sender_id === msg.sender_id;
    return { ...msg, isGrouped };
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F9F8F6]">
      <div className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-3 sm:px-4 py-2.5 sm:py-3 bg-[#F9F8F6]/95 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 rounded-full hover:bg-[#1A1A1A]/[0.05] shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative" onClick={() => openUserProfile?.(other.id)} style={{ cursor: "pointer" }}>
          <UserAvatar user={{ id: other.id, display_name: other.display_name, avatar_url: other.avatar_url }} className="h-10 w-10 hover:opacity-80 transition-opacity ring-2 ring-white/80" />
        </div>
        <div className="flex-1 min-w-0" onClick={() => openUserProfile?.(other.id)} style={{ cursor: "pointer" }}>
          <h3 className="font-serif text-sm sm:text-base font-medium tracking-tight text-[#1A1A1A] truncate">{other.display_name}</h3>
          <p className="text-[11px] sm:text-xs text-[#4A4A4A]/75">@{other.username}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-4 py-3 space-y-0.5 bg-[#F9F8F6]">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
              <span className="text-xs text-[#4A4A4A]">Carregando...</span>
            </div>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFEDE8] mb-3">
              <MessageSquare className="h-6 w-6 text-[#4A4A4A]" />
            </div>
            <p className="font-serif text-lg text-[#1A1A1A]/50">Inicie a conversa</p>
            <p className="text-xs text-[#4A4A4A]/70 mt-1">Diga olá para {other.display_name}</p>
          </div>
        )}
        {groupedMessages.map((msg: any, idx: number) => {
          const isMine = msg.sender_id === profile?.id;
          const hasImage = !!msg.media_url && msg.media_type === "image";
          const hasVideo = !!msg.media_url && msg.media_type === "video";
          const hasAudio = !!msg.media_url && msg.media_type === "audio";
          const hasMedia = hasImage || hasVideo || hasAudio;
          const mediaOnly = hasMedia && !msg.content?.trim();
          const prevMsg = idx > 0 ? groupedMessages[idx - 1] : null;
          const nextMsg = idx < groupedMessages.length - 1 ? groupedMessages[idx + 1] : null;
          const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;
          const showDaySep = (() => {
            if (!prevMsg) return true;
            const a = new Date(prevMsg.created_at);
            const b = new Date(msg.created_at);
            return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
          })();
          const dayLabel = (() => {
            const d = new Date(msg.created_at);
            const now = new Date();
            const st = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const sm = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const diff = Math.round((st - sm) / 86400000);
            if (diff === 0) return "Hoje";
            if (diff === 1) return "Ontem";
            return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
          })();

          return (
            <div key={msg.id} className="w-full" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 48px" }}>
              {showDaySep && (
                <div className="flex justify-center py-3">
                  <span className="rounded-full bg-white/90 border border-black/[0.08] px-3 py-0.5 text-[10px] font-semibold text-[#4A4A4A] shadow-sm">
                    {dayLabel}
                  </span>
                </div>
              )}
              <div className={`flex ${msg.isGrouped ? "mt-0.5" : "mt-2.5"} ${isMine ? "justify-end" : "justify-start"}`}>
                <div className="group/msg flex items-end gap-1 max-w-[min(88%,20rem)] sm:max-w-[80%]">
                  <div
                    className={`relative inline-block max-w-full break-words [overflow-wrap:anywhere] shadow-sm ${
                      mediaOnly
                        ? "bg-transparent p-0 shadow-none rounded-2xl overflow-hidden"
                        : isMine
                          ? "bg-[#1A1A1A] text-[#F9F8F6] rounded-2xl rounded-br-md px-3 py-1.5 text-[15px] leading-snug"
                          : "bg-white text-[#1A1A1A] border border-black/[0.08] rounded-2xl rounded-bl-md px-3 py-1.5 text-[15px] leading-snug"
                    }`}
                  >
                    {hasImage && (
                      <div className={`${msg.content?.trim() ? "mb-1.5" : ""} relative group`}>
                        <LazyImage
                          src={msg.media_url}
                          alt="Foto"
                          className="max-w-full max-h-72 w-full rounded-xl object-cover cursor-pointer hover:opacity-95"
                          wrapperClassName="max-w-full block"
                          onClick={() => window.open(msg.media_url, "_blank")}
                        />
                        {isMine && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/messages/${msg.id}`, { method: "DELETE" });
                                const data = await res.json();
                                if (data.success) {
                                  setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, media_url: null, media_type: null } : m));
                                  toast.success("Foto apagada");
                                } else {
                                  toast.error(data.error || "Erro ao apagar");
                                }
                              } catch { toast.error("Erro ao apagar"); }
                            }}
                            className="absolute top-1 right-1 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Apagar mídia"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {hasVideo && (
                      <div className={`${msg.content?.trim() ? "mb-1.5" : ""} relative group`}>
                        <video
                          src={msg.media_url}
                          className="max-w-full max-h-72 rounded-xl object-cover bg-black/5"
                          controls
                          playsInline
                          preload="metadata"
                        />
                        {isMine && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/messages/${msg.id}`, { method: "DELETE" });
                                const data = await res.json();
                                if (data.success) {
                                  setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, media_url: null, media_type: null } : m));
                                  toast.success("Vídeo apagado");
                                } else {
                                  toast.error(data.error || "Erro ao apagar");
                                }
                              } catch { toast.error("Erro ao apagar"); }
                            }}
                            className="absolute top-1 right-1 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Apagar mídia"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {hasAudio && (
                      <div className="relative group">
                        <ChatAudioPlayer src={msg.media_url} isMine={isMine} />
                        {isMine && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/messages/${msg.id}`, { method: "DELETE" });
                                const data = await res.json();
                                if (data.success) {
                                  setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, media_url: null, media_type: null } : m));
                                  toast.success("Áudio apagado");
                                } else {
                                  toast.error(data.error || "Erro ao apagar");
                                }
                              } catch { toast.error("Erro ao apagar"); }
                            }}
                            className="absolute top-1 right-1 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Apagar mídia"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {msg.content?.trim() && (
                      <span className="whitespace-pre-wrap">
                        {parseInlineFormatting(msg.content, openUserProfile, { isMine })}
                      </span>
                    )}
                    {isLastInGroup && !mediaOnly && (
                      <span
                        className={`ml-2 float-right mt-1 text-[10px] tabular-nums leading-none ${
                          isMine ? "text-white/55" : "text-[#4A4A4A]/60"
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {!isMine && (
                    <button
                      onClick={() => useStore.getState().openReportDialog({ targetType: "dm_message", targetId: msg.id })}
                      title="Denunciar mensagem"
                      className="mb-1 shrink-0 text-[#4A4A4A]/30 hover:text-red-500 transition-colors opacity-0 group-hover/msg:opacity-100"
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

      {/* ═══════ Barra de input do chat ═══════ */}
      <div className="shrink-0 border-t border-black/[0.06] px-3 sm:px-4 py-2.5 sm:py-3 bg-[#F9F8F6]/95 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {sendingMedia ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#1A1A1A]" />
            <span className="text-sm text-[#4A4A4A]">Enviando mídia...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* Botão + para abrir menu de anexos (para cima) */}
            <div className="relative" ref={attachMenuRef}>
              <button
                onClick={() => setAttachMenuOpen(!attachMenuOpen)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${attachMenuOpen ? "bg-[#1A1A1A] text-[#F9F8F6]" : "text-[#4A4A4A] hover:bg-[#1A1A1A]/[0.05] hover:text-[#1A1A1A]"}`}
                title="Anexar mídia"
              >
                <ChevronUp className={`h-5 w-5 transition-transform ${attachMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {/* ═══════ Menu de anexos — somente ícones ═══════ */}
              {attachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-full bg-popover p-1.5 shadow-lg border border-black/[0.08] z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
                  <button
                    onClick={() => cameraPhotoRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-popover-[#1A1A1A] transition-colors hover:bg-[#1A1A1A]/[0.05]"
                    title="Tirar foto"
                  >
                    <Camera className="h-5 w-5 text-[#1A1A1A]" />
                  </button>

                  <button
                    onClick={() => galleryPhotoRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-popover-[#1A1A1A] transition-colors hover:bg-[#1A1A1A]/[0.05]"
                    title="Foto da galeria"
                  >
                    <ImagePlus className="h-5 w-5 text-[#1A1A1A]" />
                  </button>

                  <button
                    onClick={() => cameraVideoRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-popover-[#1A1A1A] transition-colors hover:bg-[#1A1A1A]/[0.05]"
                    title="Filmar com câmera"
                  >
                    <Video className="h-5 w-5 text-[#1A1A1A]" />
                  </button>

                  <button
                    onClick={() => videoFileRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-popover-[#1A1A1A] transition-colors hover:bg-[#1A1A1A]/[0.05]"
                    title="Escolher vídeo"
                  >
                    <Video className="h-5 w-5 text-[#1A1A1A]/40" />
                  </button>

                  <button
                    onClick={() => { if (!isRecordingAudio) startAudioRecording(); }}
                    disabled={isRecordingAudio}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#1A1A1A]/[0.05] ${isRecordingAudio ? "text-[#4A4A4A] cursor-not-allowed" : "text-popover-[#1A1A1A]"}`}
                    title="Gravar áudio"
                  >
                    <Mic className={`h-5 w-5 ${isRecordingAudio ? "" : "text-[#1A1A1A]"}`} />
                  </button>

                  <button
                    onClick={() => audioFileRef.current?.click()}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-popover-[#1A1A1A] transition-colors hover:bg-[#1A1A1A]/[0.05]"
                    title="Escolher áudio"
                  >
                    <Music className="h-5 w-5 text-[#1A1A1A]/40" />
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
                className="h-11 rounded-full pl-4 pr-4 bg-[#EFEDE8]/50 border-0 focus-visible:ring-1 focus-visible:ring-[#1A1A1A]/30"
              />
            </div>

            {/* Botão enviar 💬 */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D96C4A] text-[#F9F8F6] shadow-md hover:bg-[#c15a3a] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
              title="Enviar"
            >
              <span className="text-lg leading-none">💬</span>
            </button>
          </div>
        )}
      </div>

      {/* ═══════ Overlay de gravação de áudio (igual ao feed) ═══════ */}
      {isRecordingAudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 p-8">
            <div className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#1A1A1A] text-[#F9F8F6] shadow-2xl ${isPausedRecording ? "" : "animate-pulse"}`}>
              <Mic className="h-12 w-12" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#F9F8F6] tabular-nums">{formatDuration(recordingSeconds)}</p>
              <p className="text-xs text-[#F9F8F6]/50 mt-1">{isPausedRecording ? "Pausado" : "Gravando áudio..."}</p>
            </div>
            <div className="w-48 h-2 bg-[#F9F8F6]/20 rounded-full overflow-hidden">
              <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: `${(recordingSeconds / MAX_AUDIO_DURATION) * 100}%` }} />
            </div>
            <div className="flex items-center gap-4">
              <button onClick={togglePauseRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F9F8F6]/10 text-[#F9F8F6] hover:bg-[#F9F8F6]/20 transition-colors" title={isPausedRecording ? "Continuar" : "Pausar"}>
                {isPausedRecording ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
              <button onClick={stopAudioRecording} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D96C4A] text-[#F9F8F6] shadow-lg hover:bg-[#c15a3a] transition-colors" title="Enviar">
                <Send className="h-6 w-6" />
              </button>
              <button onClick={cancelAudioRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F9F8F6]/10 text-[#F9F8F6] hover:bg-red-500/80 transition-colors" title="Cancelar">
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
              <span className="text-[#F9F8F6] font-bold tabular-nums">{formatDuration(videoRecSeconds)}</span>
              <span className="text-[#F9F8F6]/50 text-xs">/ {MAX_VIDEO_DURATION}s</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="w-full h-1.5 bg-[#F9F8F6]/20 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: `${(videoRecSeconds / MAX_VIDEO_DURATION) * 100}%` }} />
              </div>
              <div className="flex items-center justify-center gap-4">
                <button onClick={cancelVideoRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F9F8F6]/10 text-[#F9F8F6] hover:bg-red-500/80 transition-colors" title="Cancelar">
                  <X className="h-5 w-5" />
                </button>
                <button onClick={stopVideoRecording} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D96C4A] text-[#F9F8F6] shadow-lg hover:bg-[#c15a3a] transition-colors" title="Enviar vídeo">
                  <Send className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Dialog de confirmação de envio de mídia ═══════ */}
      <Dialog open={confirmSendOpen} onOpenChange={(open) => { if (!open) cancelSendMedia(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Enviar mídia</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-3">
            {pendingMedia?.type === "image" && pendingMedia.previewUrl && (
              <img src={pendingMedia.previewUrl} alt="Preview" className="max-w-full max-h-64 rounded-xl object-cover" />
            )}
            {pendingMedia?.type === "video" && pendingMedia.previewUrl && (
              <video src={pendingMedia.previewUrl} className="max-w-full max-h-64 rounded-xl object-cover" controls playsInline preload="metadata" />
            )}
            {pendingMedia?.type === "audio" && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EFEDE8]">
                <Music className="h-8 w-8 text-[#4A4A4A]" />
              </div>
            )}
            <p className="text-sm text-[#4A4A4A]">
              {pendingMedia?.type === "image" ? "Enviar esta foto?" : pendingMedia?.type === "video" ? "Enviar este vídeo?" : "Enviar este áudio?"}
            </p>
            <p className="text-xs text-[#4A4A4A]/70">
              {pendingMedia?.type === "image"
                ? "A foto expirará em 1h"
                : pendingMedia?.type === "video"
                  ? "O vídeo expirará em 1h"
                  : "Áudio não expira"}
            </p>
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-center">
            <Button variant="outline" onClick={cancelSendMedia} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmSendMedia} className="flex-1 bg-[#D96C4A] hover:bg-[#c15a3a] text-white">
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
