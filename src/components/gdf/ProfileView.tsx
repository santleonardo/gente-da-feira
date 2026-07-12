"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  LogOut,
  Edit3,
  Camera,
  Lock,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
  Type,
  Plus,
  ImagePlus,
  Video,
  Mic,
  Music,
  X,
  Globe,
  Users as UsersIcon,
  Play,
  Pause,
  FileText,
  Send,
  PenSquare,
  MessageCircle,
  Maximize2,
  Minimize2,
  Loader2,
  Clock,
  Repeat2,
} from "lucide-react";
import { getInitials, getAvatarColor, timeAgo, BAIRROS } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
import { SettingsView } from "./SettingsView";
import { AlbumView } from "./AlbumView";
import { createClient } from "@/lib/supabase/client";
import { parseInlineFormatting as parseInlineContent } from "@/lib/link-utils";
import { toast } from "sonner";
import {
  compressImage,
  validateImageFile,
  createPreviewUrl,
  revokePreviewUrl,
} from "@/lib/image-compression";
import { sanitizeHTMLSync, sanitizeHTMLAsync } from "@/lib/sanitize";

// Abre o perfil de um usuário (ex: ao clicar numa @menção) via evento global,
// mesmo padrão usado em outras telas (FeedView, DMsView, RoomsView).
function openUserProfileById(userId: string) {
  window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId } }));
}

// ═══════════════════════════════════════════════════════════
// Post-it colors — TONS MÉDIOS (nem forte nem fraco)
// ═══════════════════════════════════════════════════════════
const POST_IT_COLORS = [
  { bg: "#fef9c3", text: "#854d0e", border: "#fde68a", label: "Amarelo" },
  { bg: "#fce7f3", text: "#9d174d", border: "#fbcfe8", label: "Rosa" },
  { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe", label: "Azul" },
  { bg: "#dcfce7", text: "#166534", border: "#bbf7d0", label: "Verde" },
  { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa", label: "Laranja" },
  { bg: "#ede9fe", text: "#5b21b6", border: "#ddd6fe", label: "Roxo" },
  { bg: "#fee2e2", text: "#991b1b", border: "#fecaca", label: "Coral" },
  { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0", label: "Menta" },
  { bg: "#e0e7ff", text: "#3730a3", border: "#c7d2fe", label: "Lavanda" },
  { bg: "#fef3c7", text: "#92400e", border: "#fde68a", label: "Pêssego" },
  { bg: "#ffffff", text: "#374151", border: "#d1d5db", label: "Branco" },
  { bg: "#f3f4f6", text: "#4b5563", border: "#d1d5db", label: "Cinza" },
] as const;

// Cores disponíveis para a fonte (independente do post-it)
const FONT_COLORS = [
  { color: "#000305", label: "Preto" },
  { color: "#374151", label: "Cinza escuro" },
  { color: "#854d0e", label: "Marrom" },
  { color: "#991b1b", label: "Vermelho escuro" },
  { color: "#9d174d", label: "Rosa escuro" },
  { color: "#5b21b6", label: "Roxo escuro" },
  { color: "#1e40af", label: "Azul escuro" },
  { color: "#166534", label: "Verde escuro" },
  { color: "#9a3412", label: "Laranja escuro" },
  { color: "#065f46", label: "Menta escuro" },
  { color: "#3730a3", label: "Indigo" },
  { color: "#ffffff", label: "Branco" },
] as const;

// ═══════════════════════════════════════════════════════════
// Fontes disponíveis
// ═══════════════════════════════════════════════════════════
const FONTS = [
  { name: "Nunito", value: "Nunito" },
  { name: "Quicksand", value: "Quicksand" },
  { name: "Poppins", value: "Poppins" },
  { name: "Inter", value: "Inter" },
  { name: "Comfortaa", value: "Comfortaa" },
  { name: "Montserrat", value: "Montserrat" },
  { name: "Lato", value: "Lato" },
  { name: "Raleway", value: "Raleway" },
  { name: "DM Sans", value: "DM Sans" },
  { name: "Work Sans", value: "Work Sans" },
] as const;

const MAX_PHOTOS_PER_POST = 5;
const MAX_VIDEO_DURATION = 30;
const MAX_AUDIO_DURATION = 60;

// ═══════════════════════════════════════════════════════════
// Interface do estilo do post
// ═══════════════════════════════════════════════════════════
interface PostStyle {
  font?: string | null;
  bold?: boolean;
  italic?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
  postItColor?: number | null;
  fontColor?: string | null;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getExpirationLabel(expiresAt: string): string {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const diff = expires - now;
  if (diff <= 0) return "Expirado";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `Expira em ${hours}h${mins > 0 ? ` ${mins}min` : ""}`;
  return `Expira em ${mins}min`;
}

// ═══════════════════════════════════════════════════════════
// VideoPlayer (para Meus Posts)
// ═══════════════════════════════════════════════════════════
function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  };

  return (
    <div className="mt-2.5 relative rounded-2xl overflow-hidden bg-[#000305] shadow-lg group">
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-72 object-contain"
        playsInline
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
        onClick={toggle}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/30 cursor-pointer" onClick={toggle}>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0A4D5C] shadow-lg transition-transform hover:scale-110">
            <Play className="h-7 w-7 text-[#f7f9fa] fill-[#f7f9fa] ml-1" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#000305]/70 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="text-[#f7f9fa]">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="flex-1 h-1 bg-[#f7f9fa]/30 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (videoRef.current && duration) videoRef.current.currentTime = pct * duration;
          }}>
            <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
          </div>
          <span className="text-[10px] text-[#f7f9fa]/80 tabular-nums">{formatDuration(currentTime)}/{formatDuration(duration)}</span>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-[#f7f75e] px-2 py-0.5 text-[9px] font-semibold text-[#000305]">
        <Video className="h-2.5 w-2.5" /> Vídeo
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AudioPlayer (para Meus Posts)
// ═══════════════════════════════════════════════════════════
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <div className="mt-2.5 rounded-2xl bg-[#0A4D5C]/[0.06] p-3 shadow-sm border border-[#0A4D5C]/10">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] shadow-md hover:bg-[#0A4D5C]/90 transition-all hover:scale-105">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-[#000305]/70 tabular-nums">{formatDuration(currentTime)}</span>
            <span className="text-[9px] text-[#0A4D5C]/30">/</span>
            <span className="text-[10px] text-[#0A4D5C]/40 tabular-nums">{formatDuration(duration)}</span>
          </div>
          <div className="h-1.5 bg-[#0A4D5C]/20 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration) audioRef.current.currentTime = pct * duration;
          }}>
            <div className="h-full bg-[#0A4D5C] rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => { const d = audioRef.current?.duration; setDuration(d && isFinite(d) ? d : 0); }} onEnded={() => setPlaying(false)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PhotoGrid (para Meus Posts)
// ═══════════════════════════════════════════════════════════
function PhotoGrid({ photos, onPhotoClick }: { photos: string[]; onPhotoClick?: (index: number) => void }) {
  const count = photos.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <button onClick={() => onPhotoClick?.(0)} className="mt-2.5 w-full overflow-hidden rounded-2xl shadow-lg">
        <img src={photos[0]} alt="Foto do post" className="w-full max-h-72 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
      </button>
    );
  }
  if (count === 2) {
    return (
      <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-2xl shadow-lg">
        {photos.map((url, i) => (
          <button key={i} onClick={() => onPhotoClick?.(i)} className="overflow-hidden">
            <img src={url} alt={`Foto ${i + 1}`} className="w-full h-36 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
          </button>
        ))}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-2xl shadow-lg">
        <button onClick={() => onPhotoClick?.(0)} className="row-span-2 overflow-hidden">
          <img src={photos[0]} alt="Foto 1" className="w-full h-full object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
        <button onClick={() => onPhotoClick?.(1)} className="overflow-hidden">
          <img src={photos[1]} alt="Foto 2" className="w-full h-36 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
        <button onClick={() => onPhotoClick?.(2)} className="overflow-hidden">
          <img src={photos[2]} alt="Foto 3" className="w-full h-36 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-2xl shadow-lg">
      {photos.slice(0, 4).map((url, i) => (
        <button key={i} onClick={() => onPhotoClick?.(i)} className="relative overflow-hidden">
          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-36 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
          {i === 3 && count > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/50 text-[#f7f9fa] font-bold text-lg">+{count - 4}</div>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PhotoViewer — fullscreen overlay
// ═══════════════════════════════════════════════════════════
function PhotoViewer({ photos, initialIndex, onClose }: { photos: string[]; initialIndex: number; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f75e] hover:text-[#000305] transition-colors"><X className="h-5 w-5" /></button>
      {photos.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => (i > 0 ? i - 1 : photos.length - 1)); }} className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f75e] hover:text-[#000305] transition-colors">&#8249;</button>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => (i < photos.length - 1 ? i + 1 : 0)); }} className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f75e] hover:text-[#000305] transition-colors">&#8250;</button>
        </>
      )}
      <img src={photos[currentIndex]} alt={`Foto ${currentIndex + 1}`} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
      {photos.length > 1 && <div className="absolute bottom-4 text-[#f7f9fa]/70 text-sm">{currentIndex + 1} / {photos.length}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ExpirationCounter (para Meus Posts)
// ═══════════════════════════════════════════════════════════
function ExpirationCounter({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => setLabel(getExpirationLabel(expiresAt));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!label) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#000305] bg-[#f7f75e] rounded-full px-2.5 py-1 w-fit">
      <Clock className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Helpers para detectar e sanitizar HTML
// ═══════════════════════════════════════════════════════════
function isHTMLContent(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function sanitizeHTML(html: string): string {
  return sanitizeHTMLSync(html);
}

// parseInlineFormatting agora vem de @/lib/link-utils (importado como
// parseInlineContent) — fonte única, com suporte a URL + @menção + markdown.

function useDOMPurify() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sanitizeHTMLAsync("").then(() => setReady(true));
  }, []);
  return ready;
}

function FormattedText({
  content,
  className,
  style,
}: {
  content: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const domPurifyReady = useDOMPurify();
  const [safeHTML, setSafeHTML] = useState<string | null>(null);

  useEffect(() => {
    if (!content || !isHTMLContent(content)) return;
    sanitizeHTMLAsync(content).then(setSafeHTML);
  }, [content, domPurifyReady]);

  if (!content) return null;
  // Se o conteúdo é HTML (posts criados com o editor WYSIWYG), renderizar como HTML
  if (isHTMLContent(content)) {
    const html = safeHTML ?? sanitizeHTML(content);
    return (
      <div
        className={`post-content ${className || ""}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Posts antigos com markdown — parsear **bold**, _italic_, # H1, ## H2
  const lines = content.split("\n");

  return (
    <div className={className} style={style}>
      {lines.map((line, i) => {
        // Detectar heading
        let headingLevel = 0;
        let text = line;
        if (text.startsWith("### ")) {
          headingLevel = 3;
          text = text.slice(4);
        } else if (text.startsWith("## ")) {
          headingLevel = 2;
          text = text.slice(3);
        } else if (text.startsWith("# ")) {
          headingLevel = 1;
          text = text.slice(2);
        }

        // Tamanhos adaptados ao celular (não tão grandes)
        const headingStyle: React.CSSProperties =
          headingLevel > 0
            ? {
                fontSize: headingLevel === 1 ? "1.25rem" : headingLevel === 2 ? "1.1rem" : "1rem",
                fontWeight: 700,
                lineHeight: 1.3,
                display: "block",
                marginTop: i > 0 ? "0.35em" : undefined,
              }
            : {};

        return (
          <Fragment key={i}>
            {i > 0 && <br />}
            <span style={headingStyle}>{parseInlineContent(text, openUserProfileById)}</span>
          </Fragment>
        );
      })}
    </div>
  );
}

export function ProfileView() {
  const { profile, logout, updateProfile, setProfileSubView, unreadNotifications } = useStore();
  const [name, setName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [neighborhood, setNeighborhood] = useState(profile?.neighborhood || "");
  const [postCount, setPostCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ═══════ Follow list dialog state ═══════
  const [showFollowingDialog, setShowFollowingDialog] = useState(false);
  const [showFollowersDialog, setShowFollowersDialog] = useState(false);
  const [followList, setFollowList] = useState<any[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);

  // ═══════ Tab state ═══════
  const [activeTab, setActiveTab] = useState<"posts" | "postar" | "config" | "album">("posts");

  // ═══════ Composer state ═══════
  const [postStyle, setPostStyle] = useState<PostStyle>({
    font: null,
    bold: false,
    italic: false,
    alignment: "left",
    postItColor: 0,
    fontColor: null,
  });
  const [publishing, setPublishing] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false });

  // Media state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [visibility, setVisibility] = useState<"public" | "followers">("public");
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const mediaMenuRef = useRef<HTMLDivElement>(null);

  // Audio recording
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPausedRecording, setIsPausedRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Photo viewer state (Meus Posts)
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Input refs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const hasPhotosInComposer = selectedFiles.length > 0;
  const hasVideoInComposer = !!selectedVideo;
  const hasAudioInComposer = !!selectedAudio;
  const hasMediaInComposer = hasPhotosInComposer || hasVideoInComposer || hasAudioInComposer;
  const canPost = !!profile && (textContent.trim().length > 0 || hasMediaInComposer);
  const canAddPhotos = !hasVideoInComposer && !hasAudioInComposer && selectedFiles.length < MAX_PHOTOS_PER_POST;
  const canAddVideo = !hasPhotosInComposer && !hasAudioInComposer && !hasVideoInComposer;
  const canAddAudio = !hasPhotosInComposer && !hasVideoInComposer && !hasAudioInComposer;

  // ═══════ Rich text formatting helpers (WYSIWYG) ═══════
  const handleBold = () => {
    document.execCommand('bold');
    editorRef.current?.focus();
  };

  const handleItalic = () => {
    document.execCommand('italic');
    editorRef.current?.focus();
  };

  const handleH1 = () => {
    const current = document.queryCommandValue('formatBlock');
    document.execCommand('formatBlock', false, current.toLowerCase() === 'h1' ? 'p' : 'h1');
    editorRef.current?.focus();
  };

  const handleH2 = () => {
    const current = document.queryCommandValue('formatBlock');
    document.execCommand('formatBlock', false, current.toLowerCase() === 'h2' ? 'p' : 'h2');
    editorRef.current?.focus();
  };

  const handleEditorInput = () => {
    const el = editorRef.current;
    if (el) {
      setTextContent(el.textContent || "");
    }
  };

  // Carregar Google Fonts
  useEffect(() => {
    const fontsParam = FONTS.map(
      (f) => `family=${f.value.replace(/ /g, "+")}:wght@400;700`
    ).join("&");
    const href = `https://fonts.googleapis.com/css2?${fontsParam}&display=swap`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fontMenuOpen && fontMenuRef.current && !fontMenuRef.current.contains(e.target as Node)) {
        setFontMenuOpen(false);
      }
      if (mediaMenuOpen && mediaMenuRef.current && !mediaMenuRef.current.contains(e.target as Node)) {
        setMediaMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fontMenuOpen, mediaMenuOpen]);

  // Track active formatting states
  useEffect(() => {
    const updateFormats = () => {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
      });
    };
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, []);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      // Revoke any pending object URLs to prevent memory leaks
      previewUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetch(`/api/users/${profile.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setPostCount(data.user._count?.posts || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/follows?userId=${profile.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setFollowingCount(data.followingCount || 0);
          setFollowersCount(data.followersCount || 0);
        }
      })
      .catch(() => {});

    fetchMyPosts();
  }, [profile]);

  const fetchMyPosts = () => {
    if (!profile) return;
    fetch(`/api/users/${profile.id}/posts`)
      .then((r) => r.json())
      .then((data) => {
        if (data.posts) setMyPosts(data.posts);
      })
      .catch(() => {});
  };

  // ═══════ Follow list dialog ═══════
  const openFollowDialog = async (type: "following" | "followers") => {
    if (!profile) return;
    setFollowList([]);
    setFollowListLoading(true);
    if (type === "following") setShowFollowingDialog(true);
    else setShowFollowersDialog(true);
    try {
      const res = await fetch(`/api/follows?userId=${profile.id}`);
      const data = await res.json();
      if (type === "following" && data.following) {
        setFollowList(data.following.map((f: any) => f.following).filter(Boolean));
      } else if (type === "followers" && data.followers) {
        setFollowList(data.followers.map((f: any) => f.follower).filter(Boolean));
      }
    } catch {
      setFollowList([]);
    }
    setFollowListLoading(false);
  };

  // ═══════ Media handlers ═══════
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS_PER_POST - selectedFiles.length;
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      const error = validateImageFile(file);
      if (error) { toast.error(error); continue; }
      setSelectedFiles((prev) => [...prev, file]);
      setPreviewUrls((prev) => [...prev, createPreviewUrl(file)]);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
    setMediaMenuOpen(false);
  };

  const handleCameraPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateImageFile(file);
    if (error) { toast.error(error); return; }
    setSelectedFiles((prev) => [...prev, file]);
    setPreviewUrls((prev) => [...prev, createPreviewUrl(file)]);
    if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
    setMediaMenuOpen(false);
  };

  const removePhoto = (index: number) => {
    revokePreviewUrl(previewUrls[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("Vídeo muito grande (máx 50MB)"); return; }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.duration > MAX_VIDEO_DURATION) { toast.error(`Vídeo muito longo (máx ${MAX_VIDEO_DURATION}s)`); URL.revokeObjectURL(video.src); return; }
      setVideoDuration(video.duration);
      setSelectedVideo(file);
      setVideoPreview(URL.createObjectURL(file));
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
    setMediaMenuOpen(false);
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Áudio muito grande (máx 10MB)"); return; }
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (audio.duration > MAX_AUDIO_DURATION) { toast.error(`Áudio muito longo (máx ${MAX_AUDIO_DURATION}s)`); URL.revokeObjectURL(audio.src); return; }
      setAudioDuration(audio.duration);
      setSelectedAudio(file);
      setAudioPreview(URL.createObjectURL(file));
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(file);
    setMediaMenuOpen(false);
  };

  // ═══════ Audio recording ═══════
  const startAudioRecording = async () => {
    setMediaMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/mp4";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `gravação.${ext}`, { type: mimeType });
        const url = URL.createObjectURL(file);
        const tempAudio = document.createElement("audio");
        tempAudio.preload = "metadata";
        tempAudio.onloadedmetadata = () => {
          setAudioDuration(tempAudio.duration);
          setSelectedAudio(file);
          setAudioPreview(url);
          URL.revokeObjectURL(tempAudio.src);
        };
        tempAudio.src = url;
        if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
        mediaRecorderRef.current = null;
        setIsRecordingAudio(false);
        setIsPausedRecording(false);
      };
      mediaRecorder.start(1000);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => { if (prev + 1 >= MAX_AUDIO_DURATION) { return MAX_AUDIO_DURATION; } return prev + 1; });
      }, 1000);
    } catch { toast.error("Não foi possível acessar o microfone."); }
  };

  const stopAudioRecording = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
  };

  // Auto-stop recording when max duration is reached
  useEffect(() => {
    if (isRecordingAudio && recordingSeconds >= MAX_AUDIO_DURATION) {
      stopAudioRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingSeconds, isRecordingAudio]);

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setIsPausedRecording(false);
    setRecordingSeconds(0);
  };

  const clearMedia = () => {
    setSelectedFiles([]);
    previewUrls.forEach(revokePreviewUrl);
    setPreviewUrls([]);
    setSelectedVideo(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoDuration(0);
    setSelectedAudio(null);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    setAudioPreview(null);
    setAudioDuration(0);
    cancelAudioRecording();
  };

  // ═══════ Upload helpers ═══════
  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of selectedFiles) {
      try {
        const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.55, maxSizeKB: 150 });
        const formData = new FormData();
        formData.append("file", compressed, "photo.webp");
        formData.append("folder", "posts");
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) urls.push(data.url);
        else toast.error(data.error || "Erro ao enviar foto");
      } catch { toast.error("Erro ao processar foto"); }
    }
    return urls;
  };

  const uploadVideo = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "posts");
      const res = await fetch("/api/upload/video", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) return data.url;
      toast.error(data.error || "Erro ao enviar vídeo");
      return null;
    } catch { toast.error("Erro ao enviar vídeo"); return null; }
  };

  const uploadAudio = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "posts");
      const res = await fetch("/api/upload/audio", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) return data.url;
      toast.error(data.error || "Erro ao enviar áudio");
      return null;
    } catch { toast.error("Erro ao enviar áudio"); return null; }
  };

  // ═══════ Profile handlers ═══════
  const handleSave = async () => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim().slice(0, 50), bio: bio.trim().slice(0, 300), neighborhood }),
      });
      const data = await res.json();
      if (data.user) { updateProfile(data.user); toast.success("Perfil atualizado!"); }
    } catch { toast.error("Erro ao salvar"); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx 2MB)"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", profile.id);
      const res = await fetch("/api/users/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (data.avatar_url) { updateProfile({ avatar_url: data.avatar_url }); toast.success("Avatar atualizado!"); }
      else toast.error(data.error || "Erro ao enviar avatar");
    } catch { toast.error("Erro ao enviar avatar"); }
    setUploading(false);
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.removeAllChannels();
      await supabase.auth.signOut();
      logout();
    } catch { toast.error("Erro ao sair"); }
  };

  // ═══════ Publicar post com estilo e mídia ═══════
  const handlePublish = async () => {
    if (!profile) return;
    if (!textContent.trim() && !hasMediaInComposer) return;
    setPublishing(true);
    try {
      let imageUrls: string[] = [];
      let videoUrl: string | null = null;
      let audioUrl: string | null = null;

      if (selectedFiles.length > 0) {
        imageUrls = await uploadPhotos();
        if (imageUrls.length === 0 && selectedFiles.length > 0) { toast.error("Falha ao enviar fotos."); setPublishing(false); return; }
      }
      if (selectedVideo) {
        videoUrl = await uploadVideo(selectedVideo);
        if (!videoUrl) { setPublishing(false); return; }
      }
      if (selectedAudio) {
        audioUrl = await uploadAudio(selectedAudio);
        if (!audioUrl) { setPublishing(false); return; }
      }

      const postContent = textContent.trim() ? editorRef.current!.innerHTML : (
        selectedFiles.length > 0 ? "📷" :
        selectedVideo ? "🎥" :
        selectedAudio ? "🎙️" : ""
      );

      const styleToSend: PostStyle = { ...postStyle };
      if (!styleToSend.font) delete styleToSend.font;
      if (!styleToSend.bold) delete styleToSend.bold;
      if (!styleToSend.italic) delete styleToSend.italic;
      if (styleToSend.alignment === "left") delete styleToSend.alignment;
      if (styleToSend.postItColor === null || styleToSend.postItColor === undefined) delete styleToSend.postItColor;
      if (!styleToSend.fontColor) delete styleToSend.fontColor;

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: postContent,
          neighborhood: profile.neighborhood,
          imageUrls,
          videoUrl,
          audioUrl,
          audioDuration,
          videoDuration,
          visibility,
          postStyle: styleToSend,
          postType: "rich",
        }),
      });
      const data = await res.json();
      if (data.post) {
        if (editorRef.current) editorRef.current.innerHTML = "";
        setTextContent("");
        setPostStyle({ font: null, bold: false, italic: false, alignment: "left", postItColor: 0, fontColor: null });
        clearMedia();
        toast.success("Post publicado!");
        fetchMyPosts();
        setActiveTab("posts");
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch { toast.error("Erro ao publicar"); }
    setPublishing(false);
  };

  if (loading) return <div className="space-y-4">{[1,2].map(i=><div key={i} className="h-24 rounded-xl bg-[#01386A]/[0.04] animate-pulse"/>)}</div>;

  const isPrivate = profile?.is_private || false;
  const selectedColor = POST_IT_COLORS[postStyle.postItColor ?? 0];

  return (
    <div className="space-y-4">
      {/* Global styles for rendered post content + editor */}
      <style>{`
        .editor-content h1, .post-content h1 { font-size: 1.25rem; font-weight: 700; line-height: 1.3; margin: 0.35em 0 0.1em; }
        .editor-content h2, .post-content h2 { font-size: 1.1rem; font-weight: 700; line-height: 1.3; margin: 0.25em 0 0.1em; }
        .editor-content h3, .post-content h3 { font-size: 1rem; font-weight: 700; line-height: 1.3; margin: 0.2em 0 0.1em; }
        .editor-content h4, .post-content h4 { font-size: 0.95rem; font-weight: 600; line-height: 1.3; }
        .post-content b, .post-content strong { font-weight: 700; }
        .post-content i, .post-content em { font-style: italic; }
        .post-content u { text-decoration: underline; }
        .post-content s, .post-content strike { text-decoration: line-through; }
        .post-content a { color: #0A4D5C; text-decoration: underline; text-underline-offset: 2px; }
        .post-content a:hover { color: #2EC4B6; }
        .post-content ul { list-style: disc; padding-left: 1.5em; margin: 0.3em 0; }
        .post-content ol { list-style: decimal; padding-left: 1.5em; margin: 0.3em 0; }
        .post-content li { margin: 0.1em 0; }
        .post-content blockquote { border-left: 3px solid #0A4D5C; padding-left: 0.75em; margin: 0.3em 0; color: #000305/70; font-style: italic; }
        .post-content pre { background: #f3f4f6; border-radius: 8px; padding: 0.5em 0.75em; margin: 0.3em 0; overflow-x: auto; font-size: 0.85em; }
        .post-content code { background: #f3f4f6; border-radius: 4px; padding: 0.1em 0.3em; font-size: 0.9em; }
        .post-content font { /* preserve font face/color/size from WYSIWYG */ }
        .post-content div { margin: 0; }
        .post-content hr { border: none; border-top: 1px solid #0A4D5C/15; margin: 0.5em 0; }
      `}</style>
      {/* ═══════ CARD DO PERFIL ═══════ */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <UserAvatar
                  user={{ id: profile?.id || "", display_name: profile?.display_name || "?", avatar_url: profile?.avatar_url }}
                  className="h-16 w-16"
                />
                <button onClick={() => avatarInputRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#f7f9fa] bg-[#01386A] text-[#f7f9fa] shadow-sm transition-colors hover:bg-[#01386A]/90">
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-bold text-[#000305]">{profile?.display_name}</h2>
                  {isPrivate && <Lock className="h-4 w-4 text-[#01386A]/40" />}
                </div>
                <p className="text-sm text-[#01386A]/40">@{profile?.username}</p>
                {profile?.neighborhood && (
                  <Badge variant="secondary" className="mt-1.5 gap-1 bg-[#01386A]/10 text-[#01386A] border-0">
                    <MapPin className="h-3 w-3" /> {profile.neighborhood}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            {profile?.bio ? <p className="text-sm text-[#000305] whitespace-pre-wrap">{parseInlineContent(profile.bio, openUserProfileById)}</p> : <p className="text-sm text-[#01386A]/40 italic">Sem bio ainda</p>}
          </div>

          <div className="mt-6 flex gap-6">
            <div className="text-center"><p className="text-lg font-bold text-[#000305]">{postCount}</p><p className="text-xs text-[#01386A]/40">Posts</p></div>
            <button onClick={() => openFollowDialog("following")} className="text-center hover:opacity-70 transition-opacity">
              <p className="text-lg font-bold text-[#000305]">{followingCount}</p><p className="text-xs text-[#01386A]/40">Seguindo</p>
            </button>
            <button onClick={() => openFollowDialog("followers")} className="text-center hover:opacity-70 transition-opacity">
              <p className="text-lg font-bold text-[#000305]">{followersCount}</p><p className="text-xs text-[#01386A]/40">Seguidores</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ ABAS: Meus Posts / Postar / ⚙️ ═══════ */}
      <div className="flex rounded-xl bg-[#0A4D5C]/[0.06] p-1">
        <button
          onClick={() => setActiveTab("posts")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${activeTab === "posts" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          <FileText className="h-3.5 w-3.5" />
          Meus Posts
        </button>
        <button
          onClick={() => setActiveTab("postar")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${activeTab === "postar" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          <PenSquare className="h-3.5 w-3.5" />
          Postar
        </button>
        <button
          onClick={() => setActiveTab("album")}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${activeTab === "album" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          📷
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${activeTab === "config" ? "bg-[#f7f9fa] text-[#0A4D5C] shadow-sm" : "text-[#0A4D5C]/50 hover:text-[#0A4D5C]/70"}`}
        >
          ⚙️
        </button>
      </div>

      {/* ═══════ CONTEÚDO DAS ABAS ═══════ */}
      <div style={{ display: activeTab === "posts" ? "block" : "none" }}>
          {/* Meus Posts — renderização completa */}
          {myPosts.length > 0 ? (
            <div className="space-y-2">
              {myPosts.map((post: any) => {
                const postStyleData: PostStyle | null = post.post_style;
                const hasPhotos = post.image_urls && post.image_urls.length > 0;
                const hasVideo = !!post.video_url;
                const hasAudio = !!post.audio_url;
                const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;
                const colorIdx = postStyleData?.postItColor ?? 0;
                const postItColor = isTextOnly ? POST_IT_COLORS[colorIdx >= 0 && colorIdx < POST_IT_COLORS.length ? colorIdx : 0] : POST_IT_COLORS[0];
                const useInlineStyle = isTextOnly && colorIdx >= 0;

                return (
                  <div
                    key={post.id}
                    className="rounded-xl p-3 transition-shadow hover:shadow-sm cursor-pointer"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('audio') || target.closest('video')) return;
                      // Ensure post has author data for PostDetailDialog
                      const postWithAuthor = {
                        ...post,
                        author: post.author || {
                          id: profile?.id,
                          display_name: profile?.display_name || "",
                          username: profile?.username || "",
                          avatar_url: profile?.avatar_url || null,
                        },
                      };
                      window.dispatchEvent(new CustomEvent("openPostDetail", { detail: { post: postWithAuthor } }));
                    }}
                    style={{
                      backgroundColor: isTextOnly ? postItColor.bg : "#f7f9fa",
                      border: isTextOnly ? `1px solid ${postItColor.border}` : "1px solid rgba(10,77,92,0.08)",
                      color: isTextOnly ? (postStyleData?.fontColor || postItColor.text) : "#000305",
                    }}
                  >
                    {/* Conteúdo textual */}
                    <FormattedText
                      className={`whitespace-pre-wrap ${isTextOnly ? "text-sm sm:text-base leading-snug" : "text-[13px] sm:text-sm leading-relaxed text-[#000305]"}`}
                      content={post.content}
                      style={{
                        fontFamily: postStyleData?.font ? `'${postStyleData.font}', sans-serif` : isTextOnly ? "serif" : undefined,
                        fontWeight: postStyleData?.bold ? 700 : undefined,
                        fontStyle: postStyleData?.italic ? "italic" : undefined,
                        textAlign: postStyleData?.alignment || undefined,
                        color: postStyleData?.fontColor || undefined,
                      }}
                    />

                    {/* Shared/reposted post */}
                    {post.shared_post && !Array.isArray(post.shared_post) && (
                      <div className="mt-2.5 rounded-xl bg-[#0A4D5C]/[0.04] p-2.5 border border-[#0A4D5C]/8">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Repeat2 className="h-3 w-3 text-[#0A4D5C]/40" />
                          <span className="text-[10px] text-[#0A4D5C]/40">Compartilhado de</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          {post.shared_post.author?.avatar_url && (
                            <img src={post.shared_post.author.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                          )}
                          <span className="text-xs font-semibold text-[#000305]">{post.shared_post.author?.display_name}</span>
                        </div>
                        <FormattedText className="text-xs text-[#0A4D5C]/60 leading-relaxed line-clamp-3" content={post.shared_post.content} />
                        {post.shared_post.image_urls && post.shared_post.image_urls.length > 0 && (
                          <div className="mt-1.5 flex gap-1 overflow-x-auto">
                            {post.shared_post.image_urls.slice(0, 2).map((url: string, i: number) => (
                              <img key={i} src={url} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" />
                            ))}
                            {post.shared_post.image_urls.length > 2 && (
                              <div className="h-14 w-14 rounded-lg bg-[#0A4D5C]/[0.04] flex items-center justify-center text-xs text-[#0A4D5C]/40 shrink-0">
                                +{post.shared_post.image_urls.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fotos */}
                    {hasPhotos && (
                      <PhotoGrid
                        photos={post.image_urls}
                        onPhotoClick={(index) => {
                          setViewerPhotos(post.image_urls);
                          setViewerIndex(index);
                          setViewerOpen(true);
                        }}
                      />
                    )}

                    {/* Vídeo */}
                    {hasVideo && <VideoPlayer src={post.video_url} />}

                    {/* Áudio */}
                    {hasAudio && <AudioPlayer src={post.audio_url} />}

                    {/* Expiration counter */}
                    {post.expires_at && (
                      <ExpirationCounter expiresAt={post.expires_at} />
                    )}

                    <div className="mt-1 flex items-center gap-2" style={{ color: isTextOnly ? `${postItColor.text}80` : "rgba(1,56,106,0.4)" }}>
                      <span className="text-[10px]">{timeAgo(post.created_at)}</span>
                      {post.neighborhood && <span className="text-[10px]">· {post.neighborhood}</span>}
                      {post.visibility === "followers" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f7f75e] px-1.5 py-0.5 text-[9px] font-semibold text-[#000305]">
                          <UsersIcon className="h-2.5 w-2.5" />Seguidores
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-10 w-10 text-[#0A4D5C]/15 mb-2" />
              <p className="text-sm text-[#0A4D5C]/40">Nenhum post ainda</p>
              <button onClick={() => setActiveTab("postar")} className="mt-2 text-xs font-semibold text-[#0A4D5C] hover:underline">
                Criar primeiro post
              </button>
            </div>
          )}

      </div>

      <div style={{ display: activeTab === "postar" ? "block" : "none" }}>
          {/* ═══════ ABA POSTAR — MINI EDITOR COMPLETO ═══════ */}
          <div className="rounded-2xl bg-[#eef1f3] p-3 shadow-lg border border-[#0A4D5C]/8">
            {/* ═══════ EDITOR WYSIWYG ═══════ */}
            <div
              className="rounded-xl border border-[#0A4D5C]/8 overflow-hidden transition-all"
              style={{ backgroundColor: selectedColor.bg }}
            >
              <div className="relative">
                {!textContent.trim() && (
                  <div className="absolute top-0 left-0 right-0 px-3 py-2.5 text-sm pointer-events-none select-none" style={{ color: postStyle.fontColor || selectedColor.text, opacity: 0.4 }}>
                    Escreva algo bonito... Selecione texto e use B/I para formatar
                  </div>
                )}
                <div
                  ref={editorRef}
                  contentEditable
                  role="textbox"
                  aria-multiline="true"
                  onInput={handleEditorInput}
                  className={`editor-content w-full border-0 bg-transparent px-3 py-2.5 text-sm focus:outline-none transition-all overflow-y-auto ${editorExpanded ? "min-h-[220px] max-h-[60vh]" : "min-h-[100px]"}`}
                  style={{
                    color: postStyle.fontColor || selectedColor.text,
                    fontFamily: postStyle.font ? `'${postStyle.font}', sans-serif` : undefined,
                    textAlign: postStyle.alignment || "left",
                  }}
                  suppressContentEditableWarning
                />
                <button
                  onClick={() => setEditorExpanded(!editorExpanded)}
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[#0A4D5C]/[0.08] text-[#0A4D5C]/50 hover:bg-[#0A4D5C]/15 hover:text-[#0A4D5C] transition-colors"
                  title={editorExpanded ? "Reduzir" : "Expandir"}
                >
                  {editorExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </button>
              </div>
            </div>

            {/* Media previews */}
            {hasPhotosInComposer && previewUrls.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`Preview ${i + 1}`} className="h-12 w-12 rounded-lg object-cover shadow-sm border border-[#f7f9fa]" />
                    <button onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {hasVideoInComposer && videoPreview && (
              <div className="relative rounded-lg overflow-hidden mt-2">
                <video src={videoPreview} className="w-full max-h-24 object-cover" playsInline muted />
                <div className="absolute top-1 left-1 flex items-center gap-1 rounded-full bg-[#f7f75e] px-1.5 py-0.5 text-[9px] font-semibold text-[#000305]">
                  <Video className="h-2.5 w-2.5" /> {formatDuration(videoDuration)}
                </div>
                <button onClick={() => { setSelectedVideo(null); if (videoPreview) URL.revokeObjectURL(videoPreview); setVideoPreview(null); setVideoDuration(0); }} className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            {hasAudioInComposer && audioPreview && (
              <div className="relative rounded-lg bg-[#0A4D5C]/[0.06] p-1.5 border border-[#0A4D5C]/10 mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                    <Music className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-medium text-[#000305]">Áudio</span>
                    <span className="text-[9px] text-[#0A4D5C]/40 ml-1">{formatDuration(audioDuration)}</span>
                  </div>
                  <button onClick={() => { setSelectedAudio(null); if (audioPreview) URL.revokeObjectURL(audioPreview); setAudioPreview(null); setAudioDuration(0); }} className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                    <X className="h-2 w-2" />
                  </button>
                </div>
                <audio src={audioPreview} controls className="mt-1 w-full h-6" />
              </div>
            )}

            {/* ═══════ TOOLBAR — LINHA 1: FORMATAÇÃO ═══════ */}
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {/* Negrito */}
              <button
                onClick={handleBold}
                className={`flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-colors ${activeFormats.bold ? "bg-[#0A4D5C] text-[#f7f9fa]" : "bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                title="Negrito"
              >
                <Bold className="h-3.5 w-3.5" />
              </button>
              {/* Itálico */}
              <button
                onClick={handleItalic}
                className={`flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-colors ${activeFormats.italic ? "bg-[#0A4D5C] text-[#f7f9fa]" : "bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                title="Itálico"
              >
                <Italic className="h-3.5 w-3.5" />
              </button>

              <div className="w-px h-4 bg-[#0A4D5C]/10 shrink-0" />

              {/* H1 */}
              <button
                onClick={handleH1}
                className="flex items-center justify-center rounded-md h-7 px-1.5 shrink-0 text-[10px] font-bold transition-colors bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"
                title="Título H1"
              >
                H1
              </button>
              {/* H2 */}
              <button
                onClick={handleH2}
                className="flex items-center justify-center rounded-md h-7 px-1.5 shrink-0 text-[10px] font-bold transition-colors bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"
                title="Título H2"
              >
                H2
              </button>

              <div className="w-px h-4 bg-[#0A4D5C]/10 shrink-0" />

              {/* Alinhamento */}
              {([
                { align: "left" as const, Icon: AlignLeft },
                { align: "center" as const, Icon: AlignCenter },
                { align: "right" as const, Icon: AlignRight },
                { align: "justify" as const, Icon: AlignJustify },
              ]).map(({ align, Icon }) => (
                <button
                  key={align}
                  onClick={() => setPostStyle((s) => ({ ...s, alignment: align }))}
                  className={`flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-colors ${postStyle.alignment === align ? "bg-[#0A4D5C] text-[#f7f9fa]" : "bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                  title={align}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}

              <div className="w-px h-4 bg-[#0A4D5C]/10 shrink-0" />

              {/* Fonte dropdown */}
              <div className="relative shrink-0" ref={fontMenuRef}>
                <button
                  onClick={() => setFontMenuOpen(!fontMenuOpen)}
                  className={`flex items-center gap-0.5 rounded-md h-7 px-1.5 text-[9px] font-medium transition-colors ${fontMenuOpen ? "bg-[#0A4D5C] text-[#f7f9fa]" : "bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                >
                  <Type className="h-3 w-3" />
                  <span className="max-w-[36px] truncate">{postStyle.font || "Fonte"}</span>
                  <ChevronDown className={`h-2.5 w-2.5 transition-transform ${fontMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {fontMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-36 rounded-xl bg-[#f7f9fa] p-1 shadow-lg border border-[#0A4D5C]/10 animate-in fade-in-0 zoom-in-95 max-h-[180px] overflow-y-auto">
                    <button
                      onClick={() => { setPostStyle((s) => ({ ...s, font: null })); setFontMenuOpen(false); }}
                      className={`w-full text-left rounded-lg px-2 py-1 text-[10px] transition-colors ${!postStyle.font ? "bg-[#0A4D5C] text-[#f7f9fa]" : "text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                    >
                      Padrão
                    </button>
                    {FONTS.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => { setPostStyle((s) => ({ ...s, font: f.value })); setFontMenuOpen(false); }}
                        className={`w-full text-left rounded-lg px-2 py-1 text-[10px] transition-colors ${postStyle.font === f.value ? "bg-[#0A4D5C] text-[#f7f9fa]" : "text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                        style={{ fontFamily: `'${f.value}', sans-serif` }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Espaçador */}
              <div className="flex-1" />

              {/* Menu de mídias */}
              <div className="relative" ref={mediaMenuRef}>
                <button
                  onClick={() => setMediaMenuOpen(!mediaMenuOpen)}
                  className={`flex items-center justify-center rounded-md h-7 w-7 transition-colors ${mediaMenuOpen ? "bg-[#f7f75e] text-[#0A4D5C]" : "bg-[#f7f75e]/60 text-[#0A4D5C] hover:bg-[#f7f75e]"}`}
                  title="Mídia"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>

                {mediaMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 flex flex-col items-center gap-px rounded-2xl bg-[#f7f9fa] p-1 shadow-lg border border-[#0A4D5C]/10 animate-in fade-in-0 zoom-in-95">
                    <button onClick={() => { if (canAddPhotos) cameraPhotoRef.current?.click(); }} disabled={!canAddPhotos} title="Tirar foto" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddPhotos ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { if (canAddPhotos) photoInputRef.current?.click(); }} disabled={!canAddPhotos} title="Galeria" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddPhotos ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <ImagePlus className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-6 h-px bg-[#0A4D5C]/10" />
                    <button onClick={() => { if (canAddVideo) cameraVideoRef.current?.click(); }} disabled={!canAddVideo} title="Gravar vídeo" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddVideo ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Video className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { if (canAddVideo) videoInputRef.current?.click(); }} disabled={!canAddVideo} title="Escolher vídeo" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddVideo ? "text-[#0A4D5C]/70 hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Video className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-6 h-px bg-[#0A4D5C]/10" />
                    <button onClick={() => { if (canAddAudio && !isRecordingAudio) startAudioRecording(); }} disabled={!canAddAudio || isRecordingAudio} title="Gravar áudio" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddAudio && !isRecordingAudio ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Mic className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { if (canAddAudio) audioInputRef.current?.click(); }} disabled={!canAddAudio} title="Escolher áudio" className={`flex items-center justify-center rounded-full p-1.5 transition-colors ${canAddAudio ? "text-[#0A4D5C]/70 hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Music className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-6 h-px bg-[#0A4D5C]/10" />
                    <button onClick={() => setVisibility((v) => v === "public" ? "followers" : "public")} title={visibility === "public" ? "Público" : "Seguidores"} className="flex items-center justify-center rounded-full p-1.5 text-[#0A4D5C] transition-colors hover:bg-[#f7f75e]/30">
                      {visibility === "public" ? <Globe className="h-3.5 w-3.5" /> : <UsersIcon className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}

                {/* Hidden inputs */}
                <input ref={cameraPhotoRef} type="file" accept="image/*" capture="environment" onChange={handleCameraPhoto} className="hidden" />
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handlePhotoSelect} className="hidden" />
                <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" onChange={handleVideoSelect} className="hidden" />
                <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoSelect} className="hidden" />
                <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,audio/x-m4a" onChange={handleAudioSelect} className="hidden" />
              </div>
            </div>

            {/* ═══════ CORES — GRID 2 LINHAS × 6 ═══════ */}
            <div className="grid grid-cols-6 gap-1 mt-2">
              {POST_IT_COLORS.map((color, i) => (
                <button
                  key={i}
                  onClick={() => setPostStyle((s) => ({ ...s, postItColor: i }))}
                  className={`h-6 rounded-full border-2 transition-all hover:scale-105 ${postStyle.postItColor === i ? "border-[#0A4D5C] scale-105 shadow-sm" : "border-[#0A4D5C]/10"}`}
                  style={{ backgroundColor: color.bg }}
                  title={color.label}
                />
              ))}
            </div>

            {/* ═══════ COR DA FONTE — GRID 2 LINHAS × 6 ═══════ */}
            <div className="mt-1.5">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[9px] font-medium text-[#0A4D5C]/50">Cor da fonte</span>
                {postStyle.fontColor && (
                  <button
                    onClick={() => setPostStyle((s) => ({ ...s, fontColor: null }))}
                    className="text-[8px] text-[#0A4D5C]/40 hover:text-[#0A4D5C] underline"
                  >
                    Auto
                  </button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {FONT_COLORS.map((fc, i) => (
                  <button
                    key={i}
                    onClick={() => setPostStyle((s) => ({ ...s, fontColor: fc.color }))}
                    className={`h-5 rounded-full border-2 transition-all hover:scale-105 ${(postStyle.fontColor || null) === fc.color ? "border-[#0A4D5C] scale-105 shadow-sm" : "border-[#0A4D5C]/10"}`}
                    style={{ backgroundColor: fc.color, boxShadow: fc.color === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined }}
                    title={fc.label}
                  />
                ))}
              </div>
            </div>

            {/* ═══════ AÇÃO: VISIBILIDADE + CONTAGEM + PUBLICAR ═══════ */}
            <div className="flex items-center gap-2 mt-2">
              {/* Visibilidade */}
              <button
                onClick={() => setVisibility((v) => v === "public" ? "followers" : "public")}
                className={`flex items-center gap-1 rounded-md h-7 px-2 text-[9px] font-medium transition-colors ${visibility === "followers" ? "bg-[#0A4D5C] text-[#f7f9fa]" : "bg-[#0A4D5C]/[0.06] text-[#0A4D5C] hover:bg-[#0A4D5C]/10"}`}
                title={visibility === "public" ? "Público" : "Seguidores"}
              >
                {visibility === "public" ? <Globe className="h-3 w-3" /> : <UsersIcon className="h-3 w-3" />}
                {visibility === "public" ? "Público" : "Seguidores"}
              </button>

              <div className="flex-1" />

              {/* Contagem */}
              {textContent.trim().length > 0 && (
                <span className={`text-[9px] shrink-0 ${textContent.length > 900 ? "text-red-500" : "text-[#0A4D5C]/30"}`}>
                  {textContent.length}/1000
                </span>
              )}

              {/* Publicar */}
              <button
                disabled={!canPost || publishing}
                onClick={handlePublish}
                className="flex h-8 items-center gap-1.5 rounded-full bg-[#2EC4B6] text-[#f7f9fa] px-4 shadow-md hover:bg-[#25b0a3] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0 text-xs font-semibold"
                title="Publicar"
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                Publicar
              </button>
            </div>
          </div>
      </div>

      {/* Recording overlay */}
      {isRecordingAudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 p-6">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] shadow-2xl ${isPausedRecording ? "" : "animate-pulse"}`}>
              <Mic className="h-10 w-10" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-[#f7f9fa] tabular-nums">{formatDuration(recordingSeconds)}</p>
              <p className="text-[10px] text-[#f7f9fa]/50 mt-0.5">{isPausedRecording ? "Pausado" : "Gravando..."}</p>
            </div>
            <div className="w-36 h-1.5 bg-[#f7f9fa]/20 rounded-full overflow-hidden">
              <div className="h-full bg-[#f7f75e] rounded-full transition-all" style={{ width: `${(recordingSeconds / MAX_AUDIO_DURATION) * 100}%` }} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { if (!mediaRecorderRef.current) return; if (isPausedRecording) { mediaRecorderRef.current.resume(); setIsPausedRecording(false); recordingTimerRef.current = setInterval(() => { setRecordingSeconds((prev) => { if (prev + 1 >= MAX_AUDIO_DURATION) { stopAudioRecording(); return MAX_AUDIO_DURATION; } return prev + 1; }); }, 1000); } else { mediaRecorderRef.current.pause(); setIsPausedRecording(true); if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; } } }} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f9fa]/20 transition-colors" title={isPausedRecording ? "Continuar" : "Pausar"}>
                {isPausedRecording ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button onClick={stopAudioRecording} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-lg hover:bg-[#25b0a3] transition-colors" title="Enviar">
                <Send className="h-5 w-5" />
              </button>
              <button onClick={cancelAudioRecording} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-red-500/80 transition-colors" title="Cancelar">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ABA ÁLBUM ═══════ */}
      <div style={{ display: activeTab === "album" ? "block" : "none" }}>
          <AlbumView embedded />
      </div>

      {/* ═══════ ABA CONFIG — EDITAR PERFIL E CONFIGURAÇÕES ═══════ */}
      <div style={{ display: activeTab === "config" ? "block" : "none" }}>
          {/* Editar perfil */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Edit3 className="h-4 w-4 text-[#0A4D5C]" />
                <h3 className="text-sm font-semibold text-[#000305]">Editar perfil</h3>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} /></div>
                <div className="space-y-1.5"><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} /><span className="text-xs text-[#01386A]/40">{bio.length}/300</span></div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="flex h-10 w-full rounded-md border border-[#01386A]/10 bg-[#f7f9fa] px-3 py-2 text-sm">
                    <option value="">Nenhum</option>
                    {BAIRROS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} size="sm" className="bg-[#01386A] text-[#f7f9fa] hover:bg-[#01386A]/90 border-0">Salvar</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações */}
          <SettingsView embedded />

          <Button variant="destructive" onClick={handleLogout} className="w-full gap-2">
            <LogOut className="h-4 w-4" /> Sair da conta
          </Button>
      </div>

      {/* ═══════ DIALOG: SEGUINDO ═══════ */}
      <Dialog open={showFollowingDialog} onOpenChange={setShowFollowingDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-[#0A4D5C]" /> Seguindo ({followingCount})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {followListLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-[#0A4D5C]/10" />
                    <div className="flex-1"><div className="h-3 w-24 rounded bg-[#0A4D5C]/10" /><div className="h-2 w-16 rounded bg-[#0A4D5C]/10 mt-1" /></div>
                  </div>
                ))}
              </div>
            ) : followList.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="h-8 w-8 text-[#0A4D5C]/20 mx-auto mb-2" />
                <p className="text-xs text-[#0A4D5C]/40">Não segue ninguém ainda</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {followList.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setShowFollowingDialog(false);
                      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: u.id } }));
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 w-full text-left hover:bg-[#0A4D5C]/[0.04] transition-colors"
                  >
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-9 w-9" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[#000305]">{u.display_name}</div>
                      <div className="text-[11px] text-[#0A4D5C]/40 truncate">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ DIALOG: SEGUIDORES ═══════ */}
      <Dialog open={showFollowersDialog} onOpenChange={setShowFollowersDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-[#0A4D5C]" /> Seguidores ({followersCount})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {followListLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-[#0A4D5C]/10" />
                    <div className="flex-1"><div className="h-3 w-24 rounded bg-[#0A4D5C]/10" /><div className="h-2 w-16 rounded bg-[#0A4D5C]/10 mt-1" /></div>
                  </div>
                ))}
              </div>
            ) : followList.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="h-8 w-8 text-[#0A4D5C]/20 mx-auto mb-2" />
                <p className="text-xs text-[#0A4D5C]/40">Nenhum seguidor ainda</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {followList.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setShowFollowersDialog(false);
                      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: u.id } }));
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 w-full text-left hover:bg-[#0A4D5C]/[0.04] transition-colors"
                  >
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-9 w-9" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[#000305]">{u.display_name}</div>
                      <div className="text-[11px] text-[#0A4D5C]/40 truncate">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo viewer (Meus Posts) */}
      {viewerOpen && <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}
