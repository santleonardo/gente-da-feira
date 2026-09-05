"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import dynamic from "next/dynamic";
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
  Underline,
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
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
  Link2,
  Minus,
  Highlighter,
} from "lucide-react";
import { getInitials, getAvatarColor, timeAgo, BAIRROS } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
// Code-split: só carrega quando a aba correspondente é aberta
const SettingsView = dynamic(
  () => import("./SettingsView").then((m) => ({ default: m.SettingsView })),
  { ssr: false, loading: () => <div className="h-24 rounded-xl bg-black/[0.04] animate-pulse" /> }
);
const AlbumView = dynamic(
  () => import("./AlbumView").then((m) => ({ default: m.AlbumView })),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-black/[0.04] animate-pulse" /> }
);
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
import {
  useMentionAutocomplete,
  MentionSuggestions,
  type MentionUser,
} from "@/lib/mention-autocomplete";

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
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-110">
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
    <div className="mt-2.5 rounded-2xl bg-primary/[0.06] p-3 shadow-sm border border-primary/10">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:scale-105">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-foreground/70 tabular-nums">{formatDuration(currentTime)}</span>
            <span className="text-[9px] text-primary/30">/</span>
            <span className="text-[10px] text-primary/40 tabular-nums">{formatDuration(duration)}</span>
          </div>
          <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration) audioRef.current.currentTime = pct * duration;
          }}>
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
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

// --- LOGIC CONTINUES BELOW ---
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
  const [activeTab, setActiveTab] = useState<"posts" | "postar" | "config" | "album" | "sobre">("posts");

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
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [textContent, setTextContent] = useState("");

  // Modo tela cheia do editor: trava o scroll do body e permite fechar com Esc
  useEffect(() => {
    if (!editorExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditorExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editorExpanded]);

  // Autocomplete de @menção dentro do editor rico (contentEditable)
  const {
    mentionQuery,
    mentionIndex,
    suggestions: mentionSuggestions,
    loading: mentionLoading,
    setMentionIndex,
    onChangeWithMention,
    onKeyDownMention,
    closeMentions,
  } = useMentionAutocomplete();

  // Lê o texto e a posição do cursor dentro do nó de texto atual do editor
  // (aproximação suficiente para o caso comum: digitando sem cruzar nós/tags)
  const checkMentionAtCaret = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) {
      closeMentions();
      return;
    }
    const anchorNode = sel.anchorNode;
    if (!anchorNode || !editorRef.current.contains(anchorNode)) {
      closeMentions();
      return;
    }
    const value = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.textContent || "" : "";
    const cursorPos = anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorOffset : 0;
    onChangeWithMention(value, cursorPos);
  }, [onChangeWithMention, closeMentions]);

  // Substitui o "@query" sob o cursor por "@username " diretamente no DOM do editor
  const insertMentionInEditor = useCallback((user: MentionUser) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editorRef.current.contains(node)) {
      closeMentions();
      return;
    }
    const text = node.textContent || "";
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const match = before.match(/@([a-zA-Z0-9_]*)$/);
    if (!match) {
      closeMentions();
      return;
    }
    const start = before.length - match[0].length;
    const inserted = `@${user.username} `;
    node.textContent = text.slice(0, start) + inserted + text.slice(offset);

    const newRange = document.createRange();
    const newCaretPos = start + inserted.length;
    newRange.setStart(node, Math.min(newCaretPos, node.textContent?.length ?? 0));
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    editorRef.current.focus();
    setTextContent(editorRef.current.innerText);
    closeMentions();
  }, [closeMentions]);

  // Converte "https://exemplo.com" em link clicável assim que o usuário
  // termina de digitar a URL (espaço) ou dá Enter logo depois dela.
  // Manipula o DOM diretamente (sem execCommand, que é deprecated e
  // inconsistente entre navegadores/mobile) para ser mais confiável.
  const linkifyUrlBeforeCaret = useCallback((requireTrailingSpace: boolean) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editorRef.current.contains(node)) return;
    if (!node.parentNode) return;

    const text = node.textContent || "";
    const caret = range.startOffset;
    let searchText = text.slice(0, caret);

    if (requireTrailingSpace) {
      if (searchText.slice(-1) !== " ") return;
      searchText = searchText.slice(0, -1);
    }

    const match = searchText.match(/https?:\/\/[^\s<>"')\]]+$/);
    if (!match) return;

    // Já está dentro de um link? Não faz nada.
    if ((node.parentElement)?.closest("a")) return;

    const url = match[0];
    const urlStart = searchText.length - url.length;
    const urlEnd = searchText.length;

    // Divide o nó de texto em 3 pedaços: antes | url | depois
    // (splitText muda o próprio "node" para conter só o trecho restante)
    const restNode = (node as Text).splitText(urlEnd);
    const urlTextNode = (node as Text).splitText(urlStart);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.className = "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors";
    anchor.textContent = url;

    urlTextNode.parentNode?.replaceChild(anchor, urlTextNode);

    // Reposiciona o cursor logo depois do link (e do espaço, se houver)
    const newRange = document.createRange();
    const skip = requireTrailingSpace ? 1 : 0;
    if (restNode.textContent && restNode.textContent.length >= skip) {
      newRange.setStart(restNode, skip);
    } else {
      newRange.setStartAfter(anchor);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    if (editorRef.current) setTextContent(editorRef.current.innerText);
  }, []);
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
      if (styleMenuOpen && styleMenuRef.current && !styleMenuRef.current.contains(e.target as Node)) {
        setStyleMenuOpen(false);
      }
      if (mediaMenuOpen && mediaMenuRef.current && !mediaMenuRef.current.contains(e.target as Node)) {
        setMediaMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fontMenuOpen, styleMenuOpen, mediaMenuOpen]);

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

      // Prefer HTML do editor (formatação editorial); fallback para texto/mídia
      const htmlFromEditor = (editorRef.current?.innerHTML || "").trim();
      const plainFromEditor = (editorRef.current?.innerText || textContent || "").trim();
      const looksRich = /<(h[1-6]|b|strong|i|em|u|ul|ol|li|blockquote|p|div|br|a|hr)\b/i.test(htmlFromEditor);
      let postContent = "";
      if (plainFromEditor) {
        postContent = looksRich ? htmlFromEditor : plainFromEditor;
      } else {
        postContent =
          selectedFiles.length > 0 ? "📷" :
          selectedVideo ? "🎥" :
          selectedAudio ? "🎙️" : "";
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: postContent,
          neighborhood: profile.neighborhood,
          imageUrls,
          videoUrl,
          audioUrl,
          visibility,
          postStyle: null,
          postType: "simple",
        }),
      });
      const data = await res.json();
      if (data.post) {
        if (editorRef.current) editorRef.current.innerHTML = "";
        setTextContent("");
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

  if (loading) return <div className="space-y-4">{[1,2].map(i=><div key={i} className="h-24 rounded-xl bg-black/[0.04] animate-pulse"/>)}</div>;

  const isPrivate = profile?.is_private || false;
  const selectedColor = POST_IT_COLORS[postStyle.postItColor ?? 0];


  // ═══════════════════════════════════════════════════════════
  // HELPERS DE CONTEÚDO PARA ESTILO BLOG
  // ═══════════════════════════════════════════════════════════
  const getPostTitle = (post: any): string => {
    if (!post.content) return "Sem título";
    // Remove HTML tags roughly
    const text = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const firstLine = text.split("\n")[0] || text;
    return firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine || "Entrada";
  };

  const getPostExcerpt = (post: any): string => {
    if (!post.content) return "";
    const text = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 180 ? text.slice(0, 180) + "…" : text;
  };

  return (
    <div className="profile-blog w-full max-w-full min-w-0 overflow-x-hidden space-y-0 bg-[#F9F8F6]">
      {/* Global styles for rendered post content + editor + blog typography */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&display=swap');
        
        .profile-blog {
          --paper: #F9F8F6;
          --ink: #1A1A1A;
          --ink-light: #4A4A4A;
          --accent: #D96C4A;
          font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
        }
        .profile-blog .font-serif {
          font-family: "Playfair Display", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
        }
        
        .editor-content h1, .post-content h1 {
          font-family: "Playfair Display", ui-serif, Georgia, serif;
          font-size: 1.65rem; font-weight: 500; line-height: 1.25; margin: 0.5em 0 0.25em; letter-spacing: -0.02em;
        }
        .editor-content h2, .post-content h2 {
          font-family: "Playfair Display", ui-serif, Georgia, serif;
          font-size: 1.3rem; font-weight: 500; line-height: 1.3; margin: 0.4em 0 0.2em;
        }
        .editor-content h3, .post-content h3 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; margin: 0.3em 0 0.15em; }
        .editor-content h4, .post-content h4 { font-size: 0.95rem; font-weight: 600; line-height: 1.3; }
        .editor-content b, .editor-content strong, .post-content b, .post-content strong { font-weight: 700; }
        .editor-content i, .editor-content em, .post-content i, .post-content em { font-style: italic; }
        .editor-content u, .post-content u { text-decoration: underline; text-underline-offset: 2px; }
        .editor-content s, .editor-content strike, .post-content s, .post-content strike { text-decoration: line-through; }
        .editor-content a, .post-content a { color: #0A4D5C; text-decoration: underline; text-underline-offset: 2px; }
        .editor-content a:hover, .post-content a:hover { color: #D96C4A; }
        .editor-content ul, .post-content ul { list-style: disc; padding-left: 1.5em; margin: 0.4em 0; }
        .editor-content ol, .post-content ol { list-style: decimal; padding-left: 1.5em; margin: 0.4em 0; }
        .editor-content li, .post-content li { margin: 0.15em 0; }
        .editor-content blockquote, .post-content blockquote {
          border-left: 3px solid #D96C4A; padding-left: 0.9em; margin: 0.6em 0;
          color: #4A4A4A; font-style: italic; font-family: "Playfair Display", ui-serif, Georgia, serif;
        }
        .editor-content pre, .post-content pre { background: #f3f4f6; border-radius: 8px; padding: 0.5em 0.75em; margin: 0.3em 0; overflow-x: auto; font-size: 0.85em; }
        .editor-content code, .post-content code { background: #f3f4f6; border-radius: 4px; padding: 0.1em 0.3em; font-size: 0.9em; }
        .editor-content hr, .post-content hr { border: none; border-top: 1px solid rgba(26,26,26,0.12); margin: 0.85em 0; }
        .editor-content div, .post-content div { margin: 0; }
        .editor-content p, .post-content p { margin: 0.35em 0; }
        .profile-blog img, .profile-blog video { max-width: 100%; }
        .profile-blog pre, .profile-blog code { max-width: 100%; overflow-x: auto; }
      `}</style>

      {/* ═══════ HERO DO PERFIL ═══════ */}
      <section className="relative overflow-hidden rounded-none sm:rounded-2xl bg-[#F9F8F6] border-b border-black/[0.06] sm:border sm:border-black/[0.06]">
        <div className="px-3 sm:px-6 md:px-8 pt-5 sm:pt-6 pb-6 sm:pb-8 relative min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <div className="relative shrink-0">
              <UserAvatar
                user={{ id: profile?.id || "", display_name: profile?.display_name || "?", avatar_url: profile?.avatar_url }}
                className="h-24 w-24 sm:h-28 sm:w-28 ring-[5px] ring-[#F9F8F6] shadow-md"
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A] text-white shadow-sm transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-xl sm:text-2xl md:text-2xl font-medium tracking-tight text-[#1A1A1A] leading-tight break-words min-w-0">
                  {profile?.display_name}
                </h1>
                {isPrivate && <Lock className="h-4 w-4 text-[#4A4A4A]/60" />}
              </div>
              <p className="text-sm text-[#4A4A4A] mt-1.5">
                @{profile?.username}
                {profile?.neighborhood && (
                  <span className="inline-flex items-center gap-1 ml-2.5">
                    <MapPin className="h-3 w-3" />
                    {profile.neighborhood}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Bio – serif clássica neutra */}
          <div className="mt-5 sm:mt-6 max-w-2xl min-w-0 break-words">
            {profile?.bio ? (
              <p
                className="text-base sm:text-[17px] leading-relaxed text-[#4A4A4A]"
                style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
              >
                {parseInlineContent(profile.bio, openUserProfileById)}
              </p>
            ) : (
              <p
                className="text-base sm:text-[17px] text-[#4A4A4A]/50"
                style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
              >
                Sem bio ainda. Conte um pouco sobre você…
              </p>
            )}
          </div>

          {/* Contadores discretos */}
          <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="font-semibold text-[#1A1A1A]">{postCount}</span>
              <span className="text-[#4A4A4A] ml-1.5">entradas</span>
            </div>
            <button
              onClick={() => openFollowDialog("following")}
              className="hover:text-[#D96C4A] transition-colors"
            >
              <span className="font-semibold text-[#1A1A1A]">{followingCount}</span>
              <span className="text-[#4A4A4A] ml-1.5">seguindo</span>
            </button>
            <button
              onClick={() => openFollowDialog("followers")}
              className="hover:text-[#D96C4A] transition-colors"
            >
              <span className="font-semibold text-[#1A1A1A]">{followersCount}</span>
              <span className="text-[#4A4A4A] ml-1.5">seguidores</span>
            </button>
          </div>

          {/* Ações rápidas */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("config")}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-black/[0.04] transition-colors"
            >
              Configurações
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da conta
            </button>
          </div>

        </div>
      </section>

      {/* ═══════ NAVEGAÇÃO EDITORIAL ═══════ */}
      <nav className="sticky top-0 z-20 bg-[#F9F8F6]/95 backdrop-blur-md border-b border-black/[0.06] w-full max-w-full overflow-x-hidden">
        <div className="flex gap-0 overflow-x-auto overscroll-x-contain custom-scrollbar -mx-0 px-1 sm:px-0 scrollbar-none" style={{WebkitOverflowScrolling: "touch"}}>
          {[
            { id: "posts" as const, label: "Entradas" },
            { id: "album" as const, label: "Fotografia" },
            { id: "sobre" as const, label: "Sobre" },
            { id: "postar" as const, label: "Escrever" },
            { id: "config" as const, label: "Config" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 px-3.5 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-colors
                ${activeTab === tab.id
                  ? "text-[#1A1A1A]"
                  : "text-[#4A4A4A]/70 hover:text-[#1A1A1A]"}`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#D96C4A] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══════ CONTEÚDO DAS ABAS ═══════ */}
      <div className="w-full max-w-full min-w-0 px-1 sm:px-2 py-6 sm:py-8 mx-auto">

        {/* ─── ABA: ENTRADAS (posts estilo artigo) ─── */}
        <div style={{ display: activeTab === "posts" ? "block" : "none" }}>
          {myPosts.length > 0 ? (
            <div className="space-y-12">
              {myPosts.map((post: any, idx: number) => {
                const hasPhotos = post.image_urls && post.image_urls.length > 0;
                const hasVideo = !!post.video_url;
                const hasAudio = !!post.audio_url;
                const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;
                const postStyleData: PostStyle | null = post.post_style;

                return (
                  <article
                    key={post.id}
                    className="group cursor-pointer"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("audio") || target.closest("video")) return;
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
                  >
                    {/* Featured image */}
                    {hasPhotos && (
                      <div className="aspect-[16/10] overflow-hidden rounded-sm bg-black/5 mb-5">
                        <img
                          src={post.image_urls[0]}
                          alt=""
                          className="w-full h-full max-w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-[#4A4A4A]/80 mb-2">
                      <time>{timeAgo(post.created_at)}</time>
                      {post.expires_at && (
                        <span className="inline-flex items-center gap-1 text-[#D96C4A]/80">
                          <Clock className="h-3 w-3" />
                          {getExpirationLabel(post.expires_at)}
                        </span>
                      )}
                      {post.visibility === "followers" && (
                        <span className="inline-flex items-center gap-1">
                          <UsersIcon className="h-3 w-3" /> Só seguidores
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h2 className="font-serif text-lg sm:text-xl md:text-xl font-medium tracking-tight text-[#1A1A1A] group-hover:text-[#D96C4A] transition-colors leading-snug break-words">
                      {getPostTitle(post)}
                    </h2>

                    {/* Excerpt / content preview */}
                    {!isTextOnly && (
                      <p className="mt-3 text-[#4A4A4A] leading-relaxed line-clamp-3">
                        {getPostExcerpt(post)}
                      </p>
                    )}

                    {isTextOnly && (
                      <div className="mt-4 prose prose-stone max-w-none">
                        <FormattedText
                          className="text-[#4A4A4A] leading-relaxed text-[15px]"
                          content={post.content}
                          style={{
                            fontFamily: postStyleData?.font ? `'${postStyleData.font}', sans-serif` : undefined,
                            fontWeight: postStyleData?.bold ? 700 : undefined,
                            fontStyle: postStyleData?.italic ? "italic" : undefined,
                            textAlign: postStyleData?.alignment || undefined,
                            color: postStyleData?.fontColor || undefined,
                          }}
                        />
                      </div>
                    )}

                    {/* Media extras */}
                    {hasVideo && (
                      <div className="mt-4 rounded-sm overflow-hidden bg-black/5" onClick={(e) => e.stopPropagation()}>
                        <VideoPlayer src={post.video_url} />
                      </div>
                    )}
                    {hasAudio && (
                      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                        <audio controls src={post.audio_url} className="w-full h-10" />
                      </div>
                    )}

                    {/* Shared post */}
                    {post.shared_post && !Array.isArray(post.shared_post) && (
                      <div className="mt-5 rounded-lg border border-black/10 bg-white/60 p-4">
                        <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-wider text-[#4A4A4A]/70">
                          <Repeat2 className="h-3 w-3" />
                          Compartilhado de {post.shared_post.author?.display_name}
                        </div>
                        <FormattedText className="text-sm text-[#4A4A4A] line-clamp-3" content={post.shared_post.content} />
                      </div>
                    )}

                    {/* Divider */}
                    {idx < myPosts.length - 1 && (
                      <div className="mt-12 border-t border-black/[0.06]" />
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <PenSquare className="h-10 w-10 text-[#4A4A4A]/20 mx-auto mb-4" />
              <p className="font-serif text-xl text-[#4A4A4A]/60">Nenhuma entrada ainda</p>
              <p className="text-sm text-[#4A4A4A]/50 mt-2">Comece a escrever sua primeira reflexão</p>
              <button
                onClick={() => setActiveTab("postar")}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] text-white px-5 py-2.5 text-sm font-medium hover:bg-[#1A1A1A]/90 transition-colors"
              >
                <PenSquare className="h-4 w-4" />
                Escrever
              </button>
            </div>
          )}
        </div>

        {/* ─── ABA: FOTOGRAFIA ─── */}
        <div style={{ display: activeTab === "album" ? "block" : "none" }}>
          <AlbumView />
        </div>

                {/* ─── ABA: ESCREVER (composer) ─── */}
        <div style={{ display: activeTab === "postar" ? "block" : "none" }}>
          <div
            className={
              editorExpanded
                ? "fixed inset-0 z-[70] flex flex-col bg-white p-3.5 sm:p-6 w-full h-[100dvh] overflow-y-auto overscroll-contain"
                : "rounded-2xl border border-black/[0.08] bg-white p-3.5 sm:p-6 shadow-sm w-full max-w-full min-w-0 overflow-hidden"
            }
          >
            <div className={`flex items-start justify-between gap-3 mb-5 shrink-0 ${editorExpanded ? "sticky top-0 bg-white pb-2 -mt-3.5 sm:-mt-6 -mx-3.5 sm:-mx-6 px-3.5 sm:px-6 pt-3.5 sm:pt-6 border-b border-black/[0.06] z-10" : ""}`}>
              <div>
                <h3 className="font-serif text-2xl font-medium text-[#1A1A1A]">Nova entrada</h3>
                <p className="text-sm text-[#4A4A4A]/70 mt-0.5">Escreva com formatação editorial</p>
              </div>
              <button
                type="button"
                onClick={() => setEditorExpanded((e) => !e)}
                className="p-2 rounded-lg text-[#4A4A4A] hover:bg-black/5 transition-colors shrink-0"
                title={editorExpanded ? "Reduzir" : "Expandir"}
              >
                {editorExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>

            {/* Toolbar editorial — mobile-friendly */}
            <div className="mb-3 space-y-2 w-full min-w-0 shrink-0">
              {/* Linha 1: estilo de bloco (sempre visível com rótulos) */}
              <div className="relative" ref={styleMenuRef}>
                <button
                  type="button"
                  onClick={() => setStyleMenuOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-[#F9F8F6] px-3.5 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#F9F8F6]/80 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Type className="h-4 w-4 shrink-0 text-[#D96C4A]" />
                    <span className="font-medium truncate">Estilo do texto</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#4A4A4A]/60 transition-transform ${styleMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {styleMenuOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-xl border border-black/10 bg-white py-1.5 shadow-lg max-h-[50vh] overflow-y-auto">
                    <p className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4A4A4A]/50">
                      Título e blocos
                    </p>
                    {[
                      { label: "Título grande", hint: "H1", cmd: () => { document.execCommand("formatBlock", false, "h1"); } },
                      { label: "Subtítulo", hint: "H2", cmd: () => { document.execCommand("formatBlock", false, "h2"); } },
                      { label: "Parágrafo normal", hint: "P", cmd: () => { document.execCommand("formatBlock", false, "p"); } },
                      { label: "Citação", hint: "“ ”", cmd: () => { document.execCommand("formatBlock", false, "blockquote"); } },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          editorRef.current?.focus();
                          item.cmd();
                          setStyleMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-3 text-left text-sm hover:bg-black/[0.04] active:bg-black/[0.06] transition-colors"
                      >
                        <span className="font-medium text-[#1A1A1A]">{item.label}</span>
                        <span className="text-[11px] text-[#4A4A4A]/50 tabular-nums">{item.hint}</span>
                      </button>
                    ))}

                    <div className="my-1 border-t border-black/[0.06]" />
                    <p className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4A4A4A]/50">
                      Listas e extras
                    </p>
                    {[
                      { label: "Lista com marcadores", cmd: () => document.execCommand("insertUnorderedList") },
                      { label: "Lista numerada", cmd: () => document.execCommand("insertOrderedList") },
                      { label: "Linha divisória", cmd: () => document.execCommand("insertHorizontalRule") },
                      {
                        label: "Inserir link",
                        cmd: () => {
                          const url = window.prompt("URL do link:", "https://");
                          if (url) document.execCommand("createLink", false, url);
                        },
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          editorRef.current?.focus();
                          item.cmd();
                          setStyleMenuOpen(false);
                        }}
                        className="w-full flex items-center px-3.5 py-3 text-left text-sm font-medium text-[#1A1A1A] hover:bg-black/[0.04] active:bg-black/[0.06] transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}

                    <div className="my-1 border-t border-black/[0.06]" />
                    <p className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#4A4A4A]/50">
                      Alinhamento
                    </p>
                    <div className="flex gap-1 px-3 pb-2">
                      {[
                        { icon: AlignLeft, align: "left" as const, title: "Esquerda" },
                        { icon: AlignCenter, align: "center" as const, title: "Centro" },
                        { icon: AlignRight, align: "right" as const, title: "Direita" },
                      ].map((a) => (
                        <button
                          key={a.align}
                          type="button"
                          title={a.title}
                          onClick={() => {
                            editorRef.current?.focus();
                            document.execCommand(
                              a.align === "left" ? "justifyLeft" : a.align === "center" ? "justifyCenter" : "justifyRight"
                            );
                            setPostStyle((s) => ({ ...s, alignment: a.align }));
                            setStyleMenuOpen(false);
                          }}
                          className={`flex-1 flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                            postStyle.alignment === a.align
                              ? "bg-[#1A1A1A] text-white"
                              : "bg-[#F9F8F6] text-[#4A4A4A] hover:bg-black/5"
                          }`}
                        >
                          <a.icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Linha 2: formatação inline — grade visível, sem scroll escondido */}
              <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1 rounded-xl border border-black/10 bg-[#F9F8F6] p-1.5">
                <button
                  type="button"
                  title="Negrito"
                  onClick={() => {
                    editorRef.current?.focus();
                    document.execCommand("bold");
                    setActiveFormats((f) => ({ ...f, bold: !f.bold }));
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] sm:min-h-0 sm:px-3 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors ${
                    activeFormats.bold ? "bg-[#1A1A1A] text-white" : "text-[#1A1A1A] hover:bg-black/5"
                  }`}
                >
                  <Bold className="h-4 w-4" />
                  <span>Negrito</span>
                </button>
                <button
                  type="button"
                  title="Itálico"
                  onClick={() => {
                    editorRef.current?.focus();
                    document.execCommand("italic");
                    setActiveFormats((f) => ({ ...f, italic: !f.italic }));
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] sm:min-h-0 sm:px-3 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors ${
                    activeFormats.italic ? "bg-[#1A1A1A] text-white" : "text-[#1A1A1A] hover:bg-black/5"
                  }`}
                >
                  <Italic className="h-4 w-4" />
                  <span>Itálico</span>
                </button>
                <button
                  type="button"
                  title="Sublinhado"
                  onClick={() => {
                    editorRef.current?.focus();
                    document.execCommand("underline");
                  }}
                  className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] sm:min-h-0 sm:px-3 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium text-[#1A1A1A] hover:bg-black/5 transition-colors"
                >
                  <Underline className="h-4 w-4" />
                  <span>Sublinhar</span>
                </button>
                <button
                  type="button"
                  title="Destaque"
                  onClick={() => {
                    editorRef.current?.focus();
                    document.execCommand("hiliteColor", false, "#fef3c7");
                  }}
                  className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] sm:min-h-0 sm:px-3 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium text-[#1A1A1A] hover:bg-black/5 transition-colors"
                >
                  <Highlighter className="h-4 w-4" />
                  <span>Destaque</span>
                </button>

                {/* Fonte — desktop e mobile via menu */}
                <div className="relative col-span-4 sm:col-span-1 sm:ml-auto" ref={fontMenuRef}>
                  <button
                    type="button"
                    onClick={() => setFontMenuOpen((o) => !o)}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0 px-3 py-2 rounded-lg text-xs font-medium text-[#4A4A4A] hover:bg-black/5 transition-colors"
                  >
                    <Type className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[100px]">{postStyle.font || "Fonte"}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                  {fontMenuOpen && (
                    <div className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1 z-40 w-full sm:w-44 rounded-xl border border-black/10 bg-white py-1 shadow-lg max-h-56 overflow-y-auto">
                      {FONTS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => {
                            setPostStyle((s) => ({ ...s, font: f.value }));
                            editorRef.current?.focus();
                            document.execCommand("fontName", false, f.value);
                            setFontMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-black/5 transition-colors"
                          style={{ fontFamily: `'${f.value}', sans-serif` }}
                        >
                          {f.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setPostStyle((s) => ({ ...s, font: null }));
                          setFontMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-[#4A4A4A]/70 hover:bg-black/5 border-t border-black/5 mt-1"
                      >
                        Padrão
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className={editorExpanded ? "relative flex-1 min-h-0 flex flex-col" : "relative"}>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className={`editor-content overflow-y-auto overflow-x-hidden break-words rounded-xl border border-black/10 bg-[#F9F8F6] px-3 sm:px-4 py-3 text-[15px] leading-relaxed text-[#1A1A1A] outline-none focus:border-[#D96C4A]/40 focus:ring-2 focus:ring-[#D96C4A]/10 transition-all empty:before:content-[attr(data-placeholder)] empty:before:text-[#4A4A4A]/40 empty:before:pointer-events-none ${editorExpanded ? "flex-1 min-h-0" : "min-h-[140px] sm:min-h-[160px] max-h-[360px] sm:max-h-[480px]"}`}
                style={{
                  fontFamily: postStyle.font ? `'${postStyle.font}', sans-serif` : undefined,
                  textAlign: postStyle.alignment || "left",
                }}
                onInput={() => {
                  if (editorRef.current) setTextContent(editorRef.current.innerText);
                  checkMentionAtCaret();
                }}
                onKeyDown={(e) => {
                  const handled = onKeyDownMention(e, insertMentionInEditor);
                  if (!handled && e.key === "Enter") {
                    linkifyUrlBeforeCaret(false);
                  }
                }}
                onKeyUp={(e) => {
                  setActiveFormats({
                    bold: document.queryCommandState("bold"),
                    italic: document.queryCommandState("italic"),
                  });
                  if (e.key === " ") {
                    linkifyUrlBeforeCaret(true);
                  }
                  if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
                    checkMentionAtCaret();
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData?.getData("text/plain")?.trim() || "";
                  if (!/^https?:\/\/\S+$/.test(text)) return;
                  e.preventDefault();

                  const sel = window.getSelection();
                  if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
                  const range = sel.getRangeAt(0);
                  if (!editorRef.current.contains(range.startContainer)) return;

                  range.deleteContents();
                  const anchor = document.createElement("a");
                  anchor.href = text;
                  anchor.target = "_blank";
                  anchor.rel = "noopener noreferrer";
                  anchor.className = "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors";
                  anchor.textContent = text;
                  range.insertNode(anchor);

                  const space = document.createTextNode("\u00A0");
                  anchor.after(space);

                  const newRange = document.createRange();
                  newRange.setStartAfter(space);
                  newRange.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(newRange);

                  if (editorRef.current) setTextContent(editorRef.current.innerText);
                }}
                onMouseUp={() => {
                  setActiveFormats({
                    bold: document.queryCommandState("bold"),
                    italic: document.queryCommandState("italic"),
                  });
                  closeMentions();
                }}
                onBlur={() => {
                  // Pequeno atraso para permitir o onMouseDown do dropdown (que previne o blur) completar a seleção
                  setTimeout(() => closeMentions(), 120);
                }}
                data-placeholder="Comece a escrever sua entrada…"
              />
              <MentionSuggestions
                open={mentionQuery !== null}
                suggestions={mentionSuggestions}
                activeIndex={mentionIndex}
                loading={mentionLoading}
                onSelect={insertMentionInEditor}
                onHover={setMentionIndex}
              />
            </div>

            {/* Char count */}
            <div className="mt-1.5 flex justify-end shrink-0">
              <span className={`text-[11px] tabular-nums ${textContent.length > 900 ? "text-[#D96C4A]" : "text-[#4A4A4A]/45"}`}>
                {textContent.length}/1000
              </span>
            </div>

            {/* Media + visibility row */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 shrink-0">
              <label className="p-2 rounded-lg text-[#4A4A4A] hover:bg-black/5 cursor-pointer transition-colors" title="Fotos">
                <ImagePlus className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS_PER_POST);
                    if (files.length) {
                      setSelectedFiles(files);
                      setPreviewUrls(files.map((f) => createPreviewUrl(f)));
                      setSelectedVideo(null);
                      if (videoPreview) URL.revokeObjectURL(videoPreview);
                      setVideoPreview(null);
                    }
                  }}
                />
              </label>
              <label className="p-2 rounded-lg text-[#4A4A4A] hover:bg-black/5 cursor-pointer transition-colors" title="Vídeo">
                <Video className="h-4 w-4" />
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = URL.createObjectURL(file);
                    const video = document.createElement("video");
                    video.preload = "metadata";
                    video.onloadedmetadata = () => {
                      if (video.duration > MAX_VIDEO_DURATION) {
                        toast.error(`Vídeo muito longo (máx ${MAX_VIDEO_DURATION}s)`);
                        URL.revokeObjectURL(url);
                        return;
                      }
                      setSelectedVideo(file);
                      setVideoPreview(url);
                      setVideoDuration(video.duration);
                      setSelectedFiles([]);
                      previewUrls.forEach(revokePreviewUrl);
                      setPreviewUrls([]);
                    };
                    video.src = url;
                  }}
                />
              </label>

              <div className="flex-1" />

              <button
                type="button"
                onClick={() => setVisibility((v) => (v === "public" ? "followers" : "public"))}
                className="flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs text-[#4A4A4A] hover:bg-black/5 transition-colors"
              >
                {visibility === "public" ? <Globe className="h-3.5 w-3.5" /> : <UsersIcon className="h-3.5 w-3.5" />}
                {visibility === "public" ? "Público" : "Seguidores"}
              </button>
            </div>

            {/* Previews */}
            {previewUrls.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-x-auto shrink-0">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-black/10" />
                    <button
                      type="button"
                      onClick={() => {
                        const newFiles = selectedFiles.filter((_, idx) => idx !== i);
                        const newUrls = previewUrls.filter((_, idx) => idx !== i);
                        revokePreviewUrl(url);
                        setSelectedFiles(newFiles);
                        setPreviewUrls(newUrls);
                      }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {videoPreview && (
              <div className="mt-4 relative shrink-0">
                <video src={videoPreview} className="w-full max-h-48 rounded-lg object-cover" controls />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(videoPreview);
                    setVideoPreview(null);
                    setSelectedVideo(null);
                    setVideoDuration(0);
                  }}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Publish */}
            <div className="mt-6 flex justify-end shrink-0">
              <button
                type="button"
                disabled={publishing || (!textContent.trim() && selectedFiles.length === 0 && !selectedVideo && !selectedAudio)}
                onClick={handlePublish}
                className="inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] text-white px-6 py-2.5 text-sm font-medium hover:bg-[#1A1A1A]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publicando…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Publicar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

{/* ─── ABA: SOBRE ─── */}
        <div style={{ display: activeTab === "sobre" ? "block" : "none" }}>
          <article className="w-full max-w-full min-w-0">
            <div className="flex flex-col md:flex-row gap-6 sm:gap-10 md:gap-14 items-start min-w-0">
              {/* Foto grande */}
              <div className="w-full md:w-[42%] shrink-0">
                <div className="aspect-[4/5] overflow-hidden rounded-sm bg-black/5 sticky top-24">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || "Foto de perfil"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0A4D5C]/10 to-[#D96C4A]/10">
                      <UserAvatar
                        user={{ id: profile?.id || "", display_name: profile?.display_name || "?", avatar_url: profile?.avatar_url }}
                        className="h-28 w-28"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-full border border-black/10 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-black/5 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  Alterar foto
                </button>
              </div>

              {/* Texto longo */}
              <div className="w-full md:w-[58%] flex flex-col pt-2 md:pt-0">
                <h2 className="font-serif text-2xl sm:text-2xl md:text-3xl font-medium tracking-tight text-[#1A1A1A] mb-2 break-words">
                  Sobre {profile?.display_name?.split(" ")[0] || "mim"}
                </h2>
                {profile?.neighborhood && (
                  <p className="flex items-center gap-1.5 text-sm text-[#4A4A4A]/70 mb-6">
                    <MapPin className="h-3.5 w-3.5" />
                    {profile.neighborhood}
                  </p>
                )}

                {/* Bio em destaque */}
                {profile?.bio ? (
                  <div className="space-y-5">
                    <p
                      className="text-lg sm:text-xl text-[#1A1A1A] leading-relaxed"
                      style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                    >
                      {parseInlineContent(profile.bio, openUserProfileById)}
                    </p>
                    <div className="prose prose-stone max-w-none">
                      <p className="text-[#4A4A4A] leading-relaxed text-[15px]">
                        Este é o espaço pessoal de {profile.display_name} no Gente da Feira —
                        um canto para compartilhar reflexões, fotos e momentos do dia a dia
                        {profile.neighborhood ? ` em ${profile.neighborhood}` : ""}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p
                      className="text-lg sm:text-xl text-[#4A4A4A]/50 leading-relaxed"
                      style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                    >
                      Ainda não há uma apresentação escrita.
                    </p>
                    <p className="text-[#4A4A4A] leading-relaxed text-[15px]">
                      Use a bio do perfil para contar um pouco sobre você — o que te move,
                      o que você observa na cidade, ou simplesmente uma nota sobre o seu dia.
                    </p>
                  </div>
                )}

                {/* Editor de bio inline */}
                <div className="mt-8 pt-6 border-t border-black/[0.06]">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A4A4A]/70 mb-2">
                    Editar apresentação
                  </label>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 300))}
                    placeholder="Escreva uma apresentação pessoal…"
                    rows={4}
                    className="rounded-xl border-black/10 bg-white/70 text-[15px] leading-relaxed resize-none focus-visible:ring-[#D96C4A]/30"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[#4A4A4A]/50">{bio.length}/300</span>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] text-white px-4 py-1.5 text-xs font-medium hover:bg-[#1A1A1A]/90 transition-colors"
                    >
                      Salvar
                    </button>
                  </div>
                </div>

                {/* Meta */}
                <p className="mt-10 text-[11px] text-[#4A4A4A]/40">
                  @{profile?.username}
                  {profile?.created_at && (
                    <> · No Gente da Feira desde {new Date(profile.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</>
                  )}
                </p>
              </div>
            </div>
          </article>
        </div>

        {/* ─── ABA: CONFIG ─── */}
        <div style={{ display: activeTab === "config" ? "block" : "none" }}>
          <SettingsView />
        </div>
      </div>

      {/* ═══════ DIALOG: SEGUINDO ═══════ */}
      <Dialog open={showFollowingDialog} onOpenChange={setShowFollowingDialog}>
        <DialogContent className="max-w-md rounded-2xl bg-white border border-black/10 p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-black/5">
            <DialogTitle className="flex items-center gap-2 font-serif text-xl">
              <UsersIcon className="h-4 w-4 text-[#D96C4A]" /> Seguindo ({followingCount})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto custom-scrollbar px-2 py-2">
            {followListLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-black/5" />
                    <div className="flex-1">
                      <div className="h-3 w-24 rounded bg-black/5" />
                      <div className="h-2 w-16 rounded bg-black/5 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : followList.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="h-8 w-8 text-black/10 mx-auto mb-2" />
                <p className="text-xs text-[#4A4A4A]/60">Não está seguindo ninguém ainda</p>
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
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 w-full text-left hover:bg-black/[0.03] transition-colors"
                  >
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-9 w-9" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[#1A1A1A]">{u.display_name}</div>
                      <div className="text-[11px] text-[#4A4A4A]/60 truncate">@{u.username}</div>
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
        <DialogContent className="max-w-md rounded-2xl bg-white border border-black/10 p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-black/5">
            <DialogTitle className="flex items-center gap-2 font-serif text-xl">
              <UsersIcon className="h-4 w-4 text-[#D96C4A]" /> Seguidores ({followersCount})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto custom-scrollbar px-2 py-2">
            {followListLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-black/5" />
                    <div className="flex-1">
                      <div className="h-3 w-24 rounded bg-black/5" />
                      <div className="h-2 w-16 rounded bg-black/5 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : followList.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="h-8 w-8 text-black/10 mx-auto mb-2" />
                <p className="text-xs text-[#4A4A4A]/60">Nenhum seguidor ainda</p>
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
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 w-full text-left hover:bg-black/[0.03] transition-colors"
                  >
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-9 w-9" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[#1A1A1A]">{u.display_name}</div>
                      <div className="text-[11px] text-[#4A4A4A]/60 truncate">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
