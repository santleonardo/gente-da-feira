"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Fragment } from "react";
import { useStore, Profile } from "@/lib/store";
import { parseInlineFormatting } from "@/lib/link-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  MapPin,
  MessageCircle,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  Reply,
  ImagePlus,
  Video,
  Mic,
  X,
  Clock,
  Loader2,
  Share2,
  Globe,
  Users as UsersIcon,
  Play,
  Pause,
  Volume2,
  Repeat2,
  Copy,
  ExternalLink,
  Camera,
  Plus,
  Square,
  Music,
  Flag,
  RefreshCw,
} from "lucide-react";
import { getInitials, getAvatarColor, timeAgo } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
import { toast } from "sonner";
import {
  compressImageForFeed,
  validateImageFile,
  createPreviewUrl,
  revokePreviewUrl,
} from "@/lib/image-compression";
import { sanitizeHTMLSync, sanitizeHTMLAsync } from "@/lib/sanitize";

// ═══════════════════════════════════════════════════════════
// Constantes — Light / Supabase Free
// ═══════════════════════════════════════════════════════════
const MAX_PHOTOS_PER_POST = 1;
const MAX_ACTIVE_MEDIA_POSTS = 2;
const MAX_VIDEO_POSTS_PER_12H = 0; // desabilitado
const MAX_VIDEO_DURATION = 0;
const MAX_AUDIO_DURATION = 0;
const VIDEO_AUDIO_ENABLED = false; // flag para esconder UI de vídeo/áudio

const REACTION_EMOJIS = [
  { type: "like",  emoji: "❤️", label: "Curtir"   },
  { type: "laugh", emoji: "😂", label: "Engraçado" },
  { type: "sad",   emoji: "😔", label: "Triste"    },
  { type: "wow",   emoji: "😲", label: "Uau"       },
  { type: "angry", emoji: "😡", label: "Bravo"     },
  { type: "love",  emoji: "😍", label: "Amei"      },
] as const;

// ═══════════════════════════════════════════════════════════
// Post-it colors
// ═══════════════════════════════════════════════════════════
const POST_IT_COLORS = [
  { bg: "bg-[#fef9c3]", text: "text-[#854d0e]", border: "border-[#fde68a]" },
  { bg: "bg-[#fce7f3]", text: "text-[#9d174d]", border: "border-[#fbcfe8]" },
  { bg: "bg-[#dbeafe]", text: "text-[#1e40af]", border: "border-[#bfdbfe]" },
  { bg: "bg-[#dcfce7]", text: "text-[#166534]", border: "border-[#bbf7d0]" },
  { bg: "bg-[#ffedd5]", text: "text-[#9a3412]", border: "border-[#fed7aa]" },
  { bg: "bg-[#ede9fe]", text: "text-[#5b21b6]", border: "border-[#ddd6fe]" },
  { bg: "bg-[#fee2e2]", text: "text-[#991b1b]", border: "border-[#fecaca]" },
  { bg: "bg-[#d1fae5]", text: "text-[#065f46]", border: "border-[#a7f3d0]" },
  { bg: "bg-[#e0e7ff]", text: "text-[#3730a3]", border: "border-[#c7d2fe]" },
  { bg: "bg-[#fef3c7]", text: "text-[#92400e]", border: "border-[#fde68a]" },
  { bg: "bg-white",     text: "text-[#374151]", border: "border-[#d1d5db]" },
  { bg: "bg-[#f3f4f6]", text: "text-[#4b5563]", border: "border-[#d1d5db]" },
] as const;

const POST_IT_COLORS_HEX = [
  { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
  { bg: "#fce7f3", text: "#9d174d", border: "#fbcfe8" },
  { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
  { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa" },
  { bg: "#ede9fe", text: "#5b21b6", border: "#ddd6fe" },
  { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0" },
  { bg: "#e0e7ff", text: "#3730a3", border: "#c7d2fe" },
  { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  { bg: "#ffffff", text: "#374151", border: "#d1d5db" },
  { bg: "#f3f4f6", text: "#4b5563", border: "#d1d5db" },
] as const;

const EDITOR_FONTS = ["Nunito","Quicksand","Poppins","Inter","Comfortaa","Montserrat","Lato","Raleway","DM Sans","Work Sans"] as const;

// ═══════════════════════════════════════════════════════════
// FormattedText helpers
// ═══════════════════════════════════════════════════════════
function isHTMLContent(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function useDOMPurify() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sanitizeHTMLAsync("").then(() => setReady(true));
  }, []);
  return ready;
}

function sanitizeHTML(html: string): string {
  return sanitizeHTMLSync(html);
}

// parseInlineFormatting agora vem de @/lib/link-utils (fonte única,
// evita divergência com PostDetailDialog/DMs/Rooms)

function FormattedText({
  content, className, style, openUserProfile,
}: {
  content: string | null;
  className?: string;
  style?: React.CSSProperties;
  openUserProfile?: (userId: string) => void;
}) {
  const domPurifyReady = useDOMPurify();
  const [safeHTML, setSafeHTML] = useState<string | null>(null);

  useEffect(() => {
    if (!content || !isHTMLContent(content)) return;
    sanitizeHTMLAsync(content).then(setSafeHTML);
  }, [content, domPurifyReady]);

  const isHtml = useMemo(
    () => (content ? isHTMLContent(content) : false),
    [content]
  );

  const plainLines = useMemo(() => {
    if (!content || isHtml) return null;
    return content.split("\n").map((line, i) => {
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
      const headingStyle: React.CSSProperties =
        headingLevel > 0
          ? {
              fontSize:
                headingLevel === 1
                  ? "1.25rem"
                  : headingLevel === 2
                    ? "1.1rem"
                    : "1rem",
              fontWeight: 700,
              lineHeight: 1.3,
              display: "block",
              marginTop: i > 0 ? "0.35em" : undefined,
            }
          : {};
      return { i, text, headingStyle };
    });
  }, [content, isHtml]);

  if (!content) return null;
  if (isHtml) {
    // Enquanto DOMPurify não está pronto, renderiza sem formatação para evitar flash
    const html = safeHTML ?? sanitizeHTML(content);
    return (
      <div className={`post-content ${className || ""}`} style={style}
        dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  return (
    <div className={className} style={style}>
      {(plainLines || []).map(({ i, text, headingStyle }) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <span style={headingStyle}>{parseInlineFormatting(text, openUserProfile)}</span>
        </Fragment>
      ))}
    </div>
  );
}

function getPostItColor(postId: string) {
  let hash = 0;
  for (let i = 0; i < postId.length; i++) hash = postId.charCodeAt(i) + ((hash << 5) - hash);
  return POST_IT_COLORS[Math.abs(hash) % POST_IT_COLORS.length];
}

function buildReactionGroups(reactions: { user_id: string; type: string }[]) {
  const groups: Record<string, { emoji: string; count: number; types: string[] }> = {};
  for (const r of reactions) {
    const match = REACTION_EMOJIS.find((e) => e.type === r.type);
    const emoji = match?.emoji || "❤️";
    if (!groups[r.type]) groups[r.type] = { emoji, count: 0, types: [r.type] };
    groups[r.type].count++;
  }
  return Object.values(groups);
}

/** Árvore de comentários — função pura (fora do componente p/ useMemo estável) */
function buildCommentTree(flatComments: Comment[]) {
  const map = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const c of flatComments) {
    if (c.parent_id) {
      const children = map.get(c.parent_id) || [];
      children.push(c);
      map.set(c.parent_id, children);
    } else {
      roots.push(c);
    }
  }
  return { roots, map };
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

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MEDIA_PLACEHOLDER_EMOJIS = ["\ud83d\udcf7", "\ud83c\udfa5", "\ud83c\udf99\ufe0f"];
function isMediaPlaceholder(content: string | null): boolean {
  if (!content) return true;
  const trimmed = content.trim();
  return MEDIA_PLACEHOLDER_EMOJIS.includes(trimmed) || trimmed === "";
}

// ═══════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════
interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  parent_id?: string | null;
  author: { id: string; display_name: string; username: string; avatar_url?: string | null; neighborhood?: string | null };
  reactions: { user_id: string; type: string }[];
}

interface PostWithAuthor {
  id: string;
  content: string | null;
  neighborhood?: string | null;
  created_at: string;
  author_id: string;
  comment_count?: number;
  image_urls?: string[];
  video_url?: string | null;
  audio_url?: string | null;
  expires_at?: string | null;
  visibility?: "public" | "followers";
  shared_post_id?: string | null;
  shared_post?: PostWithAuthor | null;
  post_style?: {
    font?: string | null;
    bold?: boolean;
    italic?: boolean;
    alignment?: "left" | "center" | "right" | "justify";
    postItColor?: number | null;
    fontColor?: string | null;
  } | null;
  author: { id: string; display_name: string; username: string; avatar_url?: string | null; neighborhood?: string | null };
  reactions: { user_id: string; type: string }[];
}

// ═══════════════════════════════════════════════════════════
// VideoPlayer
// ═══════════════════════════════════════════════════════════
const VideoPlayer = memo(function VideoPlayer({ src }: { src: string }) {
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
    <div className="mt-2 relative overflow-hidden bg-[#000305] shadow-lg group">
      <video ref={videoRef} src={src} className="w-full max-h-[32rem] object-contain" playsInline preload="metadata"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)} onClick={toggle} />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/30 cursor-pointer" onClick={toggle}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0A4D5C] shadow-lg transition-transform hover:scale-110">
            <Play className="h-8 w-8 text-[#f7f9fa] fill-[#f7f9fa] ml-1" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#000305]/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-[#f7f75e] backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold text-[#000305]">
        <Video className="h-3 w-3" /> Vídeo
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// AudioPlayer
// ═══════════════════════════════════════════════════════════
const AudioPlayer = memo(function AudioPlayer({ src }: { src: string }) {
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
    <div className="mt-2.5 rounded-3xl bg-[#0A4D5C]/[0.06] p-4 shadow-sm border border-[#0A4D5C]/10">
      <div className="flex items-center gap-3.5">
        <button onClick={toggle} className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] shadow-md hover:bg-[#0A4D5C]/90 transition-all hover:scale-105">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[#000305]/70 tabular-nums">{formatDuration(currentTime)}</span>
            <span className="text-[10px] text-[#0A4D5C]/30">/</span>
            <span className="text-[11px] text-[#0A4D5C]/40 tabular-nums">{formatDuration(duration)}</span>
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
      <audio ref={audioRef} src={src} preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => { const d = audioRef.current?.duration; setDuration(d && isFinite(d) ? d : 0); }}
        onEnded={() => setPlaying(false)} />
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// PhotoGrid
// ═══════════════════════════════════════════════════════════
const PhotoGrid = memo(function PhotoGrid({ photos, onPhotoClick }: { photos: string[]; onPhotoClick?: (index: number) => void }) {
  const count = photos.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <button onClick={() => onPhotoClick?.(0)} className="mt-2 w-full overflow-hidden">
        <img src={photos[0]} alt="Foto do post" className="w-full max-h-[70vh] sm:max-h-[32rem] object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
      </button>
    );
  }
  if (count === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden">
        {photos.map((url, i) => (
          <button key={i} onClick={() => onPhotoClick?.(i)} className="overflow-hidden">
            <img src={url} alt={`Foto ${i + 1}`} className="w-full h-56 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden">
        <button onClick={() => onPhotoClick?.(0)} className="row-span-2 overflow-hidden">
          <img src={photos[0]} alt="Foto 1" className="w-full h-full object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
        <button onClick={() => onPhotoClick?.(1)} className="overflow-hidden">
          <img src={photos[1]} alt="Foto 2" className="w-full h-56 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
        <button onClick={() => onPhotoClick?.(2)} className="overflow-hidden">
          <img src={photos[2]} alt="Foto 3" className="w-full h-56 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden">
      {photos.slice(0, 4).map((url, i) => (
        <button key={i} onClick={() => onPhotoClick?.(i)} className="relative overflow-hidden">
          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-56 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
          {i === 3 && count > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/50 text-[#f7f9fa] font-bold text-lg">+{count - 4}</div>
          )}
        </button>
      ))}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// PhotoViewer
// ═══════════════════════════════════════════════════════════
function PhotoViewer({ photos, initialIndex, onClose }: { photos: string[]; initialIndex: number; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa]/10 text-[#f7f9fa] hover:bg-[#f7f75e] hover:text-[#000305] transition-colors">
        <X className="h-5 w-5" />
      </button>
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
// ShareMenu
// ═══════════════════════════════════════════════════════════
function ShareMenu({ post, onClose, onRepost }: { post: PostWithAuthor; onClose: () => void; onRepost: (post: PostWithAuthor) => void }) {
  const handleExternalShare = async () => {
    const shareData = {
      title: `Post de ${post.author?.display_name || "Usuário"}`,
      text: (post.content || "").slice(0, 100) + ((post.content || "").length > 100 ? "..." : ""),
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(`${shareData.text}\n\n— Gente da Feira`); toast.success("Texto copiado!"); }
    } catch { /* cancelled */ }
    onClose();
  };

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText((post.content || "").slice(0, 200)); toast.success("Texto copiado!"); }
    catch { toast.error("Erro ao copiar"); }
    onClose();
  };

  return (
    <div className="absolute right-0 bottom-full mb-2 w-12 rounded-2xl bg-[#f7f9fa] p-1 shadow-xl border border-[#0A4D5C]/10 z-50 animate-in fade-in-0 zoom-in-95 flex flex-col items-center gap-0.5">
      <button onClick={() => { onRepost(post); onClose(); }} className="flex items-center justify-center rounded-xl p-2.5 text-[#000305] transition-colors hover:bg-[#f7f75e]/20" title="Compartilhar no feed">
        <Repeat2 className="h-4 w-4 text-[#0A4D5C]" />
      </button>
      <button onClick={handleExternalShare} className="flex items-center justify-center rounded-xl p-2.5 text-[#000305] transition-colors hover:bg-[#f7f75e]/20" title="Compartilhar fora">
        <ExternalLink className="h-4 w-4 text-[#0A4D5C]/50" />
      </button>
      <button onClick={handleCopyLink} className="flex items-center justify-center rounded-xl p-2.5 text-[#000305] transition-colors hover:bg-[#f7f75e]/20" title="Copiar texto">
        <Copy className="h-4 w-4 text-[#0A4D5C]/50" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FeedSkeleton — imita o layout masonry real
// ═══════════════════════════════════════════════════════════
function FeedSkeleton() {
  const leftHeights  = [130, 180, 120];
  const rightHeights = [160, 110, 200];
  return (
    <div className="space-y-4 animate-pulse">
      {/* Composer skeleton */}
      <div className="rounded-3xl bg-[#eef1f3] p-5 shadow-lg border border-[#0A4D5C]/8">
        <div className="flex items-start gap-3.5">
          <div className="h-12 w-12 rounded-full bg-[#0A4D5C]/10 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#0A4D5C]/8 rounded w-3/4" />
            <div className="h-4 bg-[#0A4D5C]/8 rounded w-1/2" />
          </div>
        </div>
      </div>
      {/* Masonry skeleton */}
      <div className="flex gap-3.5 mt-4">
        <div className="flex flex-1 flex-col gap-3.5">
          {leftHeights.map((h, i) => (
            <div key={i} className="rounded-2xl bg-[#0A4D5C]/8" style={{ height: h }} />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3.5">
          {rightHeights.map((h, i) => (
            <div key={i} className="rounded-2xl bg-[#0A4D5C]/8" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FeedView
// ═══════════════════════════════════════════════════════════
export function FeedView({ openUserProfile }: { openUserProfile?: (userId: string) => void }) {
  const { profile } = useStore();
  const navigateToProfile = useCallback((uid: string) => {
    if (openUserProfile) openUserProfile(uid);
    else window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: uid } }));
  }, [openUserProfile]);

  // Google Fonts só sob demanda (post_style) e de forma não-bloqueante
  useEffect(() => {
    const fontsParam = EDITOR_FONTS.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`).join("&");
    const href = `https://fonts.googleapis.com/css2?${fontsParam}&display=swap`;
    if (document.querySelector(`link[data-gdf-fonts="1"]`)) return;
    // preconnect leve
    if (!document.querySelector('link[href="https://fonts.gstatic.com"]')) {
      const pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = "https://fonts.gstatic.com";
      pre.crossOrigin = "anonymous";
      document.head.appendChild(pre);
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-gdf-fonts", "1");
    link.media = "print";
    link.onload = () => {
      link.media = "all";
    };
    document.head.appendChild(link);
  }, []);

  // ─── State principal ───────────────────────────────────
  const [posts,       setPosts]       = useState<PostWithAuthor[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [nextCursor,  setNextCursor]  = useState<string | null>(null);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ─── Composer state ────────────────────────────────────
  const [content,            setContent]            = useState("");
  const [selectedFiles,      setSelectedFiles]      = useState<File[]>([]);
  const [previewUrls,        setPreviewUrls]        = useState<string[]>([]);
  const [uploading,          setUploading]          = useState(false);
  const [activeMediaCount,   setActiveMediaCount]   = useState(0);
  const [videoPostsInWindow, setVideoPostsInWindow] = useState(0);
  const [selectedVideo,      setSelectedVideo]      = useState<File | null>(null);
  const [selectedAudio,      setSelectedAudio]      = useState<File | null>(null);
  const [videoPreview,       setVideoPreview]       = useState<string | null>(null);
  const [audioPreview,       setAudioPreview]       = useState<string | null>(null);
  const [videoDuration,      setVideoDuration]      = useState<number>(0);
  const [audioDuration,      setAudioDuration]      = useState<number>(0);
  const [visibility,         setVisibility]         = useState<"public" | "followers">("public");
  const [menuOpen,           setMenuOpen]           = useState(false);

  // Input refs
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);
  const audioInputRef  = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const menuRef        = useRef<HTMLDivElement>(null);

  // ─── Audio recording state ────────────────────────────
  const [isRecordingAudio,   setIsRecordingAudio]   = useState(false);
  const [recordingSeconds,   setRecordingSeconds]   = useState(0);
  const [isPausedRecording,  setIsPausedRecording]  = useState(false);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef    = useRef<MediaStream | null>(null);

  // ─── Viewer / share / repost ──────────────────────────
  const [viewerPhotos,  setViewerPhotos]  = useState<string[]>([]);
  const [viewerIndex,   setViewerIndex]   = useState(0);
  const [viewerOpen,    setViewerOpen]    = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState<string | null>(null);
  const [repostingPost, setRepostingPost] = useState<PostWithAuthor | null>(null);
  const [repostContent, setRepostContent] = useState("");

  const hasMediaInComposer = selectedFiles.length > 0 || selectedVideo || selectedAudio;
  const canPost = !!profile && (content.trim().length > 0 || hasMediaInComposer);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      previewUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Página menor = 1º paint mais rápido; scroll infinito completa o resto
  const FEED_PAGE_SIZE = 12;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  const mergePostsUnique = useCallback((prev: PostWithAuthor[], incoming: PostWithAuthor[]) => {
    if (!incoming?.length) return prev;
    const seen = new Set(prev.map((p) => p.id));
    const extra = incoming.filter((p) => p?.id && !seen.has(p.id));
    return extra.length ? [...prev, ...extra] : prev;
  }, []);

  // ─── Fetch inicial ────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setNextCursor(null);
    setHasMore(false);
    const nb = profile?.neighborhood || "all";
    fetch(`/api/posts?neighborhood=${nb}&limit=${FEED_PAGE_SIZE}`, {
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (ac.signal.aborted) return;
        setPosts(data.posts || []);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(data.hasMore ?? false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [profile?.neighborhood]);

  // ─── Refresh (puxar novos posts) ──────────────────────
  const refreshFeed = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const nb = profile?.neighborhood || "all";
    try {
      const res = await fetch(`/api/posts?neighborhood=${nb}&limit=${FEED_PAGE_SIZE}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch {
      toast.error("Não foi possível atualizar o feed");
    } finally {
      setRefreshing(false);
    }
  }, [profile?.neighborhood, refreshing]);

  // ─── Load more (cursor pagination) ───────────────────
  const loadMorePosts = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nb = profile?.neighborhood || "all";
    try {
      const res = await fetch(
        `/api/posts?neighborhood=${nb}&limit=${FEED_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`
      );
      const data = await res.json();
      setPosts((prev) => mergePostsUnique(prev, data.posts || []));
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch {
      /* silent */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, profile?.neighborhood, mergePostsUnique]);

  // Scroll infinito — carrega próxima página ao aproximar do fim
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMorePosts();
      },
      // Mobile: margem menor = menos requests antecipados (economia de dados)
      { rootMargin: typeof window !== "undefined" && window.innerWidth < 640 ? "200px 0px" : "400px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMorePosts]);

  // Light beta: vídeo/áudio desabilitados na API — evita GET pesado de 50 posts só para contagem
  useEffect(() => {
    setActiveMediaCount(0);
    setVideoPostsInWindow(0);
  }, [profile?.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS_PER_POST - selectedFiles.length;
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      const error = validateImageFile(file);
      if (error) { toast.error(error); continue; }
      setSelectedFiles((prev) => [...prev, file]);
      setPreviewUrls((prev) => [...prev, createPreviewUrl(file)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMenuOpen(false);
  };

  const handleCameraPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateImageFile(file);
    if (error) { toast.error(error); return; }
    setSelectedFiles((prev) => [...prev, file]);
    setPreviewUrls((prev) => [...prev, createPreviewUrl(file)]);
    if (cameraPhotoRef.current) cameraPhotoRef.current.value = "";
    setMenuOpen(false);
  };

  const handleCameraVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (cameraVideoRef.current) cameraVideoRef.current.value = "";
    setMenuOpen(false);
  };

  const removeSelectedFile = (index: number) => {
    revokePreviewUrl(previewUrls[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["video/mp4","video/webm","video/quicktime"].includes(file.type)) { toast.error("Tipo não suportado. Use MP4, WebM ou MOV."); return; }
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
    if (videoInputRef.current) videoInputRef.current.value = "";
    setMenuOpen(false);
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["audio/mpeg","audio/mp4","audio/webm","audio/ogg","audio/wav","audio/x-m4a"].includes(file.type)) { toast.error("Tipo não suportado. Use MP3, M4A, WebM, OGG ou WAV."); return; }
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
    if (audioInputRef.current) audioInputRef.current.value = "";
    setMenuOpen(false);
  };

  // ─── Audio recording ──────────────────────────────────
  const startAudioRecording = async () => {
    setMenuOpen(false);
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
        const ext  = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `gravação.${ext}`, { type: mimeType });
        const url  = URL.createObjectURL(file);
        const tempAudio = document.createElement("audio");
        tempAudio.preload = "metadata";
        tempAudio.onloadedmetadata = () => { setAudioDuration(tempAudio.duration); setSelectedAudio(file); setAudioPreview(url); URL.revokeObjectURL(tempAudio.src); };
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
        setRecordingSeconds((prev) => prev + 1 >= MAX_AUDIO_DURATION ? MAX_AUDIO_DURATION : prev + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopAudioRecording = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
  };

  useEffect(() => {
    if (isRecordingAudio && recordingSeconds >= MAX_AUDIO_DURATION) stopAudioRecording();
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

  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPausedRecording) {
      mediaRecorderRef.current.resume();
      setIsPausedRecording(false);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1 >= MAX_AUDIO_DURATION ? MAX_AUDIO_DURATION : prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPausedRecording(true);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    }
  };

  const clearMedia = () => {
    setSelectedFiles([]);
    previewUrls.forEach(revokePreviewUrl);
    setPreviewUrls([]);
    setSelectedVideo(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null); setVideoDuration(0);
    setSelectedAudio(null);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    setAudioPreview(null); setAudioDuration(0);
    cancelAudioRecording();
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of selectedFiles) {
      try {
        // Cliente: WebP (ou JPEG fallback) ≤ ~180KB, lado ≤ 1280
        const compressed = await compressImageForFeed(file);
        const formData = new FormData();
        formData.append("file", compressed, compressed.name);
        formData.append("folder", "posts");
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (data.url) urls.push(data.url);
        else toast.error(data.error || "Erro ao enviar foto");
      } catch (err: any) {
        toast.error(err?.message || "Erro ao processar foto");
      }
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

  const handlePost = async () => {
    if (!profile) return;
    if (!content.trim() && !hasMediaInComposer) return;
    const hasMedia = selectedFiles.length > 0 || selectedVideo || selectedAudio;
    if (hasMedia && activeMediaCount >= MAX_ACTIVE_MEDIA_POSTS) { toast.error(`Você já tem ${MAX_ACTIVE_MEDIA_POSTS} posts com mídia ativos. Aguarde a expiração.`); return; }
    if (selectedVideo && videoPostsInWindow >= MAX_VIDEO_POSTS_PER_12H) { toast.error(`Você já postou ${MAX_VIDEO_POSTS_PER_12H} vídeos nas últimas 12h.`); return; }
    setUploading(true);
    try {
      let imageUrls: string[] = [];
      let videoUrl: string | null = null;
      let audioUrl: string | null = null;
      if (selectedFiles.length > 0) {
        imageUrls = await uploadPhotos();
        if (imageUrls.length === 0 && selectedFiles.length > 0) { toast.error("Falha ao enviar fotos."); setUploading(false); return; }
      }
      if (selectedVideo) { videoUrl = await uploadVideo(selectedVideo); if (!videoUrl) { setUploading(false); return; } }
      if (selectedAudio) { audioUrl = await uploadAudio(selectedAudio); if (!audioUrl) { setUploading(false); return; } }
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), neighborhood: profile.neighborhood, imageUrls, videoUrl, audioUrl, audioDuration, videoDuration, visibility }),
      });
      const data = await res.json();
      if (data.post) {
        setPosts((prev) => [{ ...data.post, comment_count: data.post.comment_count || 0 }, ...prev]);
        setContent("");
        clearMedia();
        toast.success("Post publicado!");
      } else if (data.error) { toast.error(data.error); }
    } catch { toast.error("Erro ao publicar"); }
    setUploading(false);
  };

  const handleRepost = async (post: PostWithAuthor) => {
    if (!profile) return;
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: repostContent.trim() || `Compartilhado de @${post.author.username}`, neighborhood: profile.neighborhood, imageUrls: [], videoUrl: null, audioUrl: null, visibility: "public", sharedPostId: post.id }),
      });
      const data = await res.json();
      if (data.post) {
        setPosts((prev) => [{ ...data.post, comment_count: data.post.comment_count || 0, shared_post: post }, ...prev]);
        setRepostingPost(null);
        setRepostContent("");
        toast.success("Compartilhado no feed!");
      } else if (data.error) { toast.error(data.error); }
    } catch { toast.error("Erro ao compartilhar"); }
  };

  const handleReaction = useCallback(async (postId: string, type: string) => {
    if (!profile) return;
    // Optimistic: aplica na hora e reconcilia com a API
    let snapshot: PostWithAuthor[] | null = null;
    setPosts((prev) => {
      snapshot = prev;
      return prev.map((p) => {
        if (p.id !== postId) return p;
        const reactions = p.reactions || [];
        const already = reactions.some((r) => r.user_id === profile.id && r.type === type);
        return {
          ...p,
          reactions: already
            ? reactions.filter((r) => !(r.user_id === profile.id && r.type === type))
            : [...reactions, { user_id: profile.id, type }],
        };
      });
    });
    try {
      const res = await fetch("/api/posts/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.reacted === undefined) {
        if (snapshot) setPosts(snapshot);
        return;
      }
      // Reconcilia com resultado real
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const reactions = p.reactions || [];
          const has = reactions.some((r) => r.user_id === profile.id && r.type === type);
          if (data.reacted && !has) {
            return { ...p, reactions: [...reactions, { user_id: profile.id, type }] };
          }
          if (!data.reacted && has) {
            return {
              ...p,
              reactions: reactions.filter((r) => !(r.user_id === profile.id && r.type === type)),
            };
          }
          return p;
        })
      );
    } catch {
      if (snapshot) setPosts(snapshot);
    }
  }, [profile]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await fetch(`/api/posts?id=${postId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post excluído");
    } catch { toast.error("Erro ao excluir"); }
  }, []);

  const updateCommentCount = useCallback((postId: string, delta: number) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) + delta) } : p));
  }, []);

  const openPhotoViewer = useCallback((photos: string[], index: number) => {
    setViewerPhotos(photos); setViewerIndex(index); setViewerOpen(true);
  }, []);

  const handleRepostRequest = useCallback((p: PostWithAuthor) => {
    setRepostingPost(p);
    setRepostContent("");
  }, []);

  const hasPhotosInComposer = selectedFiles.length > 0;
  const hasVideoInComposer  = !!selectedVideo;
  const hasAudioInComposer  = !!selectedAudio;
  const canAddPhotos = !hasVideoInComposer && !hasAudioInComposer && selectedFiles.length < MAX_PHOTOS_PER_POST;
  // Light / Free: vídeo e áudio desabilitados
  const canAddVideo  = VIDEO_AUDIO_ENABLED && !hasPhotosInComposer && !hasAudioInComposer && !hasVideoInComposer;
  const canAddAudio  = VIDEO_AUDIO_ENABLED && !hasPhotosInComposer && !hasVideoInComposer && !hasAudioInComposer;

  if (loading) return <FeedSkeleton />;

  return (
    <div className="space-y-0 w-full min-w-0 max-w-full overflow-x-hidden">
      {/* Atualizar feed */}
      <div className="flex items-center justify-end mb-1">
        <button
          type="button"
          onClick={refreshFeed}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[#0A4D5C]/70 hover:bg-[#0A4D5C]/[0.06] active:scale-95 disabled:opacity-50 transition-colors"
          title="Atualizar feed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      <style>{`
        .post-content h1 { font-size:1.25rem;font-weight:700;line-height:1.3;margin:0.35em 0 0.1em; }
        .post-content h2 { font-size:1.1rem;font-weight:700;line-height:1.3;margin:0.25em 0 0.1em; }
        .post-content h3 { font-size:1rem;font-weight:700;line-height:1.3;margin:0.2em 0 0.1em; }
        .post-content b,.post-content strong { font-weight:700; }
        .post-content i,.post-content em { font-style:italic; }
        .post-content u { text-decoration:underline; }
        .post-content s,.post-content strike { text-decoration:line-through; }
        .post-content a { color:#0A4D5C;text-decoration:underline;text-underline-offset:2px;text-decoration-color:#0A4D5C66; }
        .post-content a:hover { color:#2EC4B6; }
        .post-content ul { list-style:disc;padding-left:1.5em;margin:0.3em 0; }
        .post-content ol { list-style:decimal;padding-left:1.5em;margin:0.3em 0; }
        .post-content li { margin:0.1em 0; }
        .post-content blockquote { border-left:3px solid #0A4D5C;padding-left:0.75em;margin:0.3em 0;font-style:italic; }
        .post-content pre { background:#f3f4f6;border-radius:8px;padding:0.5em 0.75em;margin:0.3em 0;overflow-x:auto;font-size:0.85em; }
        .post-content code { background:#f3f4f6;border-radius:4px;padding:0.1em 0.3em;font-size:0.9em; }
        .post-content div { margin:0; }
        .post-content hr { border:none;border-top:1px solid rgba(10,77,92,.15);margin:0.5em 0; }
      `}</style>

      {/* ═══════ COMPOSER ═══════ */}
      <div className="relative z-10 rounded-3xl bg-[#eef1f3] p-5 shadow-lg border border-[#0A4D5C]/8">
        <div className="flex items-start gap-3.5">
          <UserAvatar user={{ id: profile?.id || "", display_name: profile?.display_name || "?", avatar_url: profile?.avatar_url }} className="h-12 w-12 shrink-0" />
          <div className="flex-1 space-y-2">
            <textarea
              placeholder={hasMediaInComposer ? "Adicione uma legenda... (opcional)" : "O que está acontecendo no seu bairro?"}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              className="w-full min-h-[72px] resize-none border-0 bg-transparent p-0 text-sm text-[#000305] focus:outline-none placeholder:text-[#0A4D5C]/30"
              rows={2}
            />

            {hasPhotosInComposer && previewUrls.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`Preview ${i + 1}`} className="h-20 w-20 rounded-2xl object-cover shadow-md border-2 border-[#f7f9fa]" />
                    <button onClick={() => removeSelectedFile(i)} className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {hasVideoInComposer && videoPreview && (
              <div className="relative">
                <video src={videoPreview} className="w-full max-h-48 rounded-2xl object-cover" playsInline muted />
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-[#f7f75e] px-2 py-0.5 text-[10px] font-semibold text-[#000305]">
                  <Video className="h-3 w-3" /> {formatDuration(videoDuration)}
                </div>
                <button onClick={() => { setSelectedVideo(null); if (videoPreview) URL.revokeObjectURL(videoPreview); setVideoPreview(null); setVideoDuration(0); }} className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {hasAudioInComposer && audioPreview && (
              <div className="relative rounded-2xl bg-[#0A4D5C]/[0.06] p-3 border border-[#0A4D5C]/10">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-[#000305]">Áudio</span>
                    <span className="text-[10px] text-[#0A4D5C]/40 ml-2">{formatDuration(audioDuration)}</span>
                  </div>
                </div>
                <audio src={audioPreview} controls className="mt-2 w-full h-8" />
                <button onClick={() => { setSelectedAudio(null); if (audioPreview) URL.revokeObjectURL(audioPreview); setAudioPreview(null); setAudioDuration(0); }} className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A4D5C] text-[#f7f9fa]">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            {/* ACTION BAR */}
            <div className="flex items-center justify-between pt-1">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${menuOpen ? "bg-[#f7f75e] text-[#0A4D5C]" : "bg-[#f7f75e] text-[#0A4D5C] hover:bg-[#f7f75e]/80"}`}
                >
                  <Plus className="h-4 w-4" />
                  <span>Menu</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                </button>

                {menuOpen && (
                  <div className="absolute left-0 top-full mt-1 flex flex-col items-center gap-0.5 rounded-2xl bg-[#f7f9fa] p-1.5 shadow-lg border border-[#0A4D5C]/10 z-50 animate-in fade-in-0 zoom-in-95">
                    <button onClick={() => { if (canAddPhotos) cameraPhotoRef.current?.click(); }} disabled={!canAddPhotos} title="Tirar foto"
                      className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddPhotos ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <Camera className="h-4 w-4" />
                    </button>
                    <button onClick={() => { if (canAddPhotos) fileInputRef.current?.click(); }} disabled={!canAddPhotos} title="Escolher foto"
                      className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddPhotos ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                      <ImagePlus className="h-4 w-4" />
                    </button>
                    {/* Light / Free: vídeo e áudio desabilitados */}
                    {VIDEO_AUDIO_ENABLED && (
                      <>
                        <div className="w-8 h-px bg-[#0A4D5C]/10" />
                        <button onClick={() => { if (canAddVideo && videoPostsInWindow < MAX_VIDEO_POSTS_PER_12H) cameraVideoRef.current?.click(); }} disabled={!canAddVideo || videoPostsInWindow >= MAX_VIDEO_POSTS_PER_12H} title="Gravar vídeo"
                          className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddVideo && videoPostsInWindow < MAX_VIDEO_POSTS_PER_12H ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                          <Video className="h-4 w-4" />
                        </button>
                        <button onClick={() => { if (canAddVideo && videoPostsInWindow < MAX_VIDEO_POSTS_PER_12H) videoInputRef.current?.click(); }} disabled={!canAddVideo || videoPostsInWindow >= MAX_VIDEO_POSTS_PER_12H} title="Escolher vídeo"
                          className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddVideo && videoPostsInWindow < MAX_VIDEO_POSTS_PER_12H ? "text-[#0A4D5C]/70 hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                          <Video className="h-4 w-4" />
                        </button>
                        <div className="w-8 h-px bg-[#0A4D5C]/10" />
                        <button onClick={() => { if (canAddAudio && !isRecordingAudio) startAudioRecording(); }} disabled={!canAddAudio || isRecordingAudio} title="Gravar áudio"
                          className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddAudio && !isRecordingAudio ? "text-[#0A4D5C] hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                          <Mic className="h-4 w-4" />
                        </button>
                        <button onClick={() => { if (canAddAudio) audioInputRef.current?.click(); }} disabled={!canAddAudio} title="Escolher áudio"
                          className={`flex items-center justify-center rounded-full p-2 transition-colors ${canAddAudio ? "text-[#0A4D5C]/70 hover:bg-[#f7f75e]/30" : "text-[#0A4D5C]/25 cursor-not-allowed"}`}>
                          <Music className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <div className="w-8 h-px bg-[#0A4D5C]/10" />
                    <button onClick={() => setVisibility((v) => v === "public" ? "followers" : "public")} title={visibility === "public" ? "Público" : "Seguidores"}
                      className="flex items-center justify-center rounded-full p-2 text-[#0A4D5C] transition-colors hover:bg-[#f7f75e]/30">
                      {visibility === "public" ? <Globe className="h-4 w-4" /> : <UsersIcon className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                <input ref={cameraPhotoRef} type="file" accept="image/*" capture="environment" onChange={handleCameraPhotoSelect} className="hidden" />
                {/* Light: no máximo 1 foto — sem multiple */}
                <input ref={fileInputRef}   type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileSelect} className="hidden" />
                {VIDEO_AUDIO_ENABLED && (
                  <>
                    <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" onChange={handleCameraVideoSelect} className="hidden" />
                    <input ref={videoInputRef}  type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoSelect} className="hidden" />
                    <input ref={audioInputRef}  type="file" accept="audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav,audio/x-m4a" onChange={handleAudioSelect} className="hidden" />
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {content.trim().length > 0 && (
                  <span className={`text-[10px] ${content.length > 450 ? "text-red-500" : "text-[#0A4D5C]/30"}`}>{content.length}/500</span>
                )}
                <button disabled={!canPost || uploading} onClick={handlePost}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] shadow-md hover:bg-[#25b0a3] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                  title="Publicar">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-base">💬</span>}
                </button>
              </div>
            </div>

            {activeMediaCount >= MAX_ACTIVE_MEDIA_POSTS && (
              <div className="flex items-center gap-1 text-[10px] text-[#0A4D5C]/50 mt-1">
                <Clock className="h-3 w-3" /> {activeMediaCount}/{MAX_ACTIVE_MEDIA_POSTS} posts com mídia ativos
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repost dialog */}
      {repostingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000305]/50 backdrop-blur-sm" onClick={() => { setRepostingPost(null); setRepostContent(""); }}>
          <div className="w-full max-w-md mx-4 rounded-3xl bg-[#f7f9fa] p-5 shadow-lg border border-[#0A4D5C]/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#000305] mb-3">Compartilhar no feed</h3>
            <div className="rounded-2xl bg-[#0A4D5C]/[0.04] p-3 mb-3 border border-[#0A4D5C]/8">
              <div className="flex items-center gap-2 mb-1">
                <UserAvatar user={repostingPost.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-6 w-6" />
                <span className="text-xs font-semibold text-[#000305]">{repostingPost.author?.display_name || "Usuário"}</span>
                <span className="text-[10px] text-[#0A4D5C]/40">@{repostingPost.author?.username || "usuario"}</span>
              </div>
              <FormattedText className="text-xs text-[#0A4D5C]/60 line-clamp-3" content={repostingPost.content} />
            </div>
            <textarea placeholder="Adicione um comentário (opcional)..." value={repostContent}
              onChange={(e) => setRepostContent(e.target.value.slice(0, 200))}
              className="w-full min-h-[60px] resize-none border-0 bg-transparent p-3 text-sm text-[#000305] focus:outline-none placeholder:text-[#0A4D5C]/30" rows={2} />
            <div className="flex items-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => { setRepostingPost(null); setRepostContent(""); }} className="rounded-full border-[#0A4D5C]/10 text-[#0A4D5C]">Cancelar</Button>
              <Button size="sm" onClick={() => handleRepost(repostingPost)} className="rounded-full gap-1.5 bg-[#0A4D5C] text-[#f7f9fa] hover:bg-[#0A4D5C]/90 border-0">
                <Repeat2 className="h-3.5 w-3.5" /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#0A4D5C]/[0.04]">
            <MessageCircle className="h-8 w-8 text-[#0A4D5C]/30" />
          </div>
          <p className="text-sm font-medium text-[#000305]">Nenhum post por aqui ainda</p>
          <p className="text-xs text-[#0A4D5C]/40 mt-1">Seja o primeiro a publicar no seu bairro!</p>
        </div>
      )}

      {/* Masonry 2-column grid (1 col no mobile) */}
      <div className="columns-1 sm:columns-2 gap-3 sm:gap-3.5 mt-3 sm:mt-4">
        {posts.map((post) => (
          <div
            key={post.id}
            className="break-inside-avoid mb-3 sm:mb-3.5 [content-visibility:auto] [contain-intrinsic-size:auto_280px]"
          >
            <PostThread
              post={post}
              profile={profile}
              onReaction={handleReaction}
              onDelete={handleDelete}
              onUpdateCommentCount={updateCommentCount}
              openUserProfile={navigateToProfile}
              onPhotoClick={openPhotoViewer}
              onRepost={handleRepostRequest}
              isShareOpen={shareMenuOpen === post.id}
              setShareMenuOpen={setShareMenuOpen}
            />
          </div>
        ))}
      </div>

      {/* ─── Scroll infinito + fallback botão ───────────── */}
      {hasMore && (
        <div ref={loadMoreRef} className="mt-5 flex justify-center pb-2">
          <button
            onClick={loadMorePosts}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-full border border-[#0A4D5C]/20 bg-[#f7f9fa] px-6 py-2.5 text-sm font-medium text-[#0A4D5C] shadow-sm transition-all hover:border-[#0A4D5C]/40 hover:shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {loadingMore ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</>
            ) : (
              "Carregar mais posts"
            )}
          </button>
        </div>
      )}

      {/* Recording overlay */}
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

      {viewerOpen && <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PostThread
// ═══════════════════════════════════════════════════════════
const PostThread = memo(function PostThread({
  post, profile, onReaction, onDelete, onUpdateCommentCount, openUserProfile, onPhotoClick, onRepost, isShareOpen, setShareMenuOpen,
}: {
  post: PostWithAuthor; profile: Profile | null;
  onReaction: (postId: string, type: string) => void;
  onDelete: (postId: string) => void;
  onUpdateCommentCount: (postId: string, delta: number) => void;
  openUserProfile?: (userId: string) => void;
  onPhotoClick?: (photos: string[], index: number) => void;
  onRepost: (post: PostWithAuthor) => void;
  isShareOpen: boolean;
  setShareMenuOpen: (id: string | null) => void;
}) {
  const [showComments,    setShowComments]    = useState(false);
  const [comments,        setComments]        = useState<Comment[]>([]);
  const [commentInput,    setCommentInput]    = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [replyTo,         setReplyTo]         = useState<Comment | null>(null);
  const [showReactions,   setShowReactions]   = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const shareRef        = useRef<HTMLDivElement>(null);

  const reactionGroups = useMemo(
    () => buildReactionGroups(post.reactions || []),
    [post.reactions]
  );

  const commentCount = post.comment_count || 0;

  const {
    hasPhotos,
    hasVideo,
    hasAudio,
    isOwnPost,
    isTextOnly,
    hasPostStyle,
    postItColor,
    postItColorHex,
    useInlineStyle,
    cardBg,
    commentsBg,
    viewerReactionTypes,
  } = useMemo(() => {
    const hasPhotos = !!(post.image_urls && post.image_urls.length > 0);
    const hasVideo = !!post.video_url;
    const hasAudio = !!post.audio_url;
    const isOwnPost = post.author_id === profile?.id;
    const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;

    const hasPostStyle = post.post_style && typeof post.post_style === "object";
    const styleColorIdx =
      hasPostStyle && post.post_style!.postItColor != null
        ? post.post_style!.postItColor
        : -1;
    const postItColor = isTextOnly
      ? styleColorIdx >= 0 && styleColorIdx < POST_IT_COLORS.length
        ? POST_IT_COLORS[styleColorIdx]
        : getPostItColor(post.id)
      : null;
    const postItColorHex = isTextOnly
      ? styleColorIdx >= 0 && styleColorIdx < POST_IT_COLORS_HEX.length
        ? POST_IT_COLORS_HEX[styleColorIdx]
        : null
      : null;
    const useInlineStyle = isTextOnly && styleColorIdx >= 0;
    const cardBg = isTextOnly
      ? useInlineStyle
        ? ""
        : postItColor?.bg || "bg-[#fdf6b2]"
      : "bg-[#eef1f3]";
    const commentsBg = "bg-[#0A4D5C]/[0.04]";

    const viewerReactionTypes = new Set(
      (post.reactions || [])
        .filter((r) => r.user_id === profile?.id)
        .map((r) => r.type)
    );

    return {
      hasPhotos,
      hasVideo,
      hasAudio,
      isOwnPost,
      isTextOnly,
      hasPostStyle: !!hasPostStyle,
      postItColor,
      postItColorHex,
      useInlineStyle,
      cardBg,
      commentsBg,
      viewerReactionTypes,
    };
  }, [
    post.image_urls,
    post.video_url,
    post.audio_url,
    post.author_id,
    post.post_style,
    post.id,
    post.reactions,
    profile?.id,
  ]);

  const [expirationLabel, setExpirationLabel] = useState<string>("");
  useEffect(() => {
    if (!post.expires_at) return;
    const update = () => setExpirationLabel(getExpirationLabel(post.expires_at!));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [post.expires_at]);

  useEffect(() => {
    if (!isShareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isShareOpen, setShareMenuOpen]);

  const fetchComments = async () => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      const data = await res.json();
      if (data.comments) setComments(data.comments);
    } catch { /* silent */ }
    setCommentsLoading(false);
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0) fetchComments();
    setShowComments(!showComments);
  };

  const openAndFocus = () => {
    if (!showComments) { if (comments.length === 0) fetchComments(); setShowComments(true); }
    setTimeout(() => commentInputRef.current?.focus(), 100);
  };

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    if (!showComments) { if (comments.length === 0) fetchComments(); setShowComments(true); }
    setTimeout(() => commentInputRef.current?.focus(), 100);
  };

  const submitComment = async () => {
    if (!commentInput.trim() || !profile || submitting) return;
    setSubmitting(true);
    try {
      const body: { content: string; parentId?: string } = { content: commentInput.trim() };
      if (replyTo) body.parentId = replyTo.id;
      const res = await fetch(`/api/posts/${post.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setCommentInput(""); setReplyTo(null);
        onUpdateCommentCount(post.id, 1);
        if (!showComments) setShowComments(true);
      } else if (data.error) toast.error(data.error);
    } catch { toast.error("Erro ao comentar"); }
    setSubmitting(false);
  };

  const deleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/posts/${post.id}/comments?commentId=${commentId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { setComments((prev) => prev.filter((c) => c.id !== commentId)); onUpdateCommentCount(post.id, -1); }
    } catch { toast.error("Erro ao excluir comentário"); }
  };

  const handleCommentReaction = async (commentId: string, type: string) => {
    if (!profile) return;
    try {
      const res = await fetch("/api/comments/reaction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId, type }) });
      const data = await res.json();
      if (data.reacted !== undefined) {
        setComments((prev) => prev.map((c) => {
          if (c.id !== commentId) return c;
          const reactions = data.reacted ? [...(c.reactions || []), { user_id: profile.id, type }] : (c.reactions || []).filter((r: any) => !(r.user_id === profile.id && r.type === type));
          return { ...c, reactions };
        }));
      }
    } catch { /* silent */ }
  };

  const { roots: commentRoots, map: commentMap } = useMemo(
    () => buildCommentTree(comments),
    [comments]
  );

  const handleOpenPostDetail = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("textarea") || target.closest("[contenteditable]")) return;
    window.dispatchEvent(new CustomEvent("openPostDetail", { detail: { post } }));
  };

  return (
    <div
      className={`rounded-2xl ${cardBg} shadow-md ${isShareOpen ? "overflow-visible" : "overflow-hidden"} transition-shadow hover:shadow-lg cursor-pointer ${isOwnPost ? "border-l-3 border-l-[#f7f75e]" : ""} ${isTextOnly && !useInlineStyle && postItColor ? `border ${postItColor.border}` : ""} ${!useInlineStyle ? "border border-[#0A4D5C]/8" : ""}`}
      style={useInlineStyle && postItColorHex ? { backgroundColor: postItColorHex.bg, border: `1px solid ${postItColorHex.border}` } : undefined}
      onClick={handleOpenPostDetail}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-2.5">
          <button onClick={() => post.author?.id && openUserProfile?.(post.author.id)} className="shrink-0 group">
            <UserAvatar user={post.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-9 w-9 sm:h-11 sm:w-11 hover:opacity-80 transition-opacity ring-2 ring-[#f7f9fa] shadow-sm" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => post.author?.id && openUserProfile?.(post.author.id)}
                className={`text-sm font-semibold hover:underline underline-offset-2 transition-all ${isTextOnly && !(hasPostStyle && post.post_style!.fontColor) ? postItColor?.text || "text-[#000305]" : "text-[#000305]"}`}
                style={hasPostStyle && post.post_style!.fontColor ? { color: post.post_style!.fontColor } : undefined}>
                {post.author?.display_name || "Usuário"}
              </button>
              {post.visibility === "followers" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f7f75e] px-2 py-0.5 text-[10px] font-semibold text-[#000305]">
                  <UsersIcon className="h-2.5 w-2.5" />Seguidores
                </span>
              )}
              {isOwnPost && (
                <span className="inline-flex items-center rounded-full bg-[#f7f75e]/30 px-2 py-0.5 text-[10px] font-medium text-[#0A4D5C]">Seu post</span>
              )}
              <span className={`text-[10px] ${isTextOnly ? "text-[#000305]/20" : "text-[#0A4D5C]/25"}`}>·</span>
              <span className={`text-[10px] ${isTextOnly ? "text-[#000305]/40" : "text-[#0A4D5C]/40"}`}>{timeAgo(post.created_at)}</span>
            </div>

            {isTextOnly && post.content && !isMediaPlaceholder(post.content) && (
              <FormattedText
                className={`mt-1.5 text-base sm:text-lg leading-snug whitespace-pre-wrap ${useInlineStyle || (hasPostStyle && post.post_style!.fontColor) ? "" : (postItColor?.text || "text-[#000305]")}`}
                content={post.content}
                openUserProfile={openUserProfile}
                style={{
                  fontFamily:  hasPostStyle && post.post_style!.font ? `'${post.post_style!.font}', sans-serif` : "serif",
                  fontWeight:  hasPostStyle && post.post_style!.bold ? 700 : undefined,
                  fontStyle:   hasPostStyle && post.post_style!.italic ? "italic" : undefined,
                  textAlign:   hasPostStyle && post.post_style!.alignment ? post.post_style!.alignment : undefined,
                  color:       hasPostStyle && post.post_style!.fontColor ? post.post_style!.fontColor : (useInlineStyle && postItColorHex ? postItColorHex.text : undefined),
                }}
              />
            )}

            {post.shared_post && !Array.isArray(post.shared_post) && (
              <div className="mt-2.5 rounded-2xl bg-[#0A4D5C]/[0.04] p-3 border border-[#0A4D5C]/8">
                <div className="flex items-center gap-2 mb-1.5">
                  <Repeat2 className="h-3 w-3 text-[#0A4D5C]/40" />
                  <span className="text-[10px] text-[#0A4D5C]/40">Compartilhado de</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => post.shared_post?.author?.id && openUserProfile?.(post.shared_post.author.id)} className="shrink-0">
                    <UserAvatar user={post.shared_post?.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-6 w-6" />
                  </button>
                  <button onClick={() => post.shared_post?.author?.id && openUserProfile?.(post.shared_post.author.id)} className="text-xs font-semibold text-[#000305] hover:underline">
                    {post.shared_post?.author?.display_name || "Usuário"}
                  </button>
                </div>
                <FormattedText className="text-xs text-[#0A4D5C]/60 leading-relaxed line-clamp-4" content={post.shared_post.content} openUserProfile={openUserProfile} />
                {post.shared_post.image_urls && post.shared_post.image_urls.length > 0 && (
                  <div className="mt-1.5 flex gap-1 overflow-x-auto">
                    {post.shared_post.image_urls.slice(0, 2).map((url, i) => (
                      <img key={i} src={url} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />
                    ))}
                    {post.shared_post.image_urls.length > 2 && (
                      <div className="h-16 w-16 rounded-xl bg-[#0A4D5C]/[0.04] flex items-center justify-center text-xs text-[#0A4D5C]/40 shrink-0">
                        +{post.shared_post.image_urls.length - 2}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isTextOnly && post.content && post.content.trim() && !isMediaPlaceholder(post.content) && (
              <div className="px-1 sm:px-1.5 mt-2">
                <FormattedText
                  className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap text-[#000305]"
                  content={post.content}
                  openUserProfile={openUserProfile}
                  style={{
                    fontFamily:  hasPostStyle && post.post_style!.font      ? `'${post.post_style!.font}', sans-serif` : undefined,
                    fontWeight:  hasPostStyle && post.post_style!.bold      ? 700                                      : undefined,
                    fontStyle:   hasPostStyle && post.post_style!.italic    ? "italic"                                 : undefined,
                    textAlign:   hasPostStyle && post.post_style!.alignment ? post.post_style!.alignment as any        : undefined,
                    color:       hasPostStyle && post.post_style!.fontColor ? post.post_style!.fontColor               : undefined,
                  }}
                />
              </div>
            )}

            {post.expires_at && expirationLabel && (
              <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#000305] bg-[#f7f75e] rounded-full px-2.5 py-1 w-fit">
                <Clock className="h-3 w-3" /><span>{expirationLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* FULL-BLEED MEDIA — outside the avatar flex row */}
        {(hasPhotos || hasVideo || hasAudio) && (
          <div className="-mx-3 sm:-mx-4">
            {hasPhotos && (
              <PhotoGrid
                photos={post.image_urls!}
                onPhotoClick={(index) => onPhotoClick?.(post.image_urls || [], index)}
              />
            )}
            {hasVideo  && <VideoPlayer src={post.video_url!} />}
            {hasAudio  && <AudioPlayer src={post.audio_url!} />}
          </div>
        )}

        {/* ACTION BAR */}
        <div className="mt-2 flex items-center gap-0.5">
          <div className="relative">
            <button
              onClick={() => setShowReactions(!showReactions)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors ${viewerReactionTypes.size > 0 ? "text-[#0A4D5C] bg-[#0A4D5C]/10 font-medium" : "text-[#0A4D5C]/40 hover:bg-[#0A4D5C]/[0.04] hover:text-[#0A4D5C]"}`}>
              <Heart className="h-4 w-4" />
              {post.reactions?.length > 0 && <span>{post.reactions.length}</span>}
            </button>
            {showReactions && (
              <div className="absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-2xl bg-[#f7f9fa] p-1.5 shadow-lg border border-[#0A4D5C]/10 z-20">
                {REACTION_EMOJIS.map(({ type, emoji, label }) => {
                  const isActive = viewerReactionTypes.has(type);
                  return (
                    <button key={type} onClick={() => { onReaction(post.id, type); setShowReactions(false); }}
                      className={`rounded-xl p-1.5 text-lg transition-all hover:scale-125 ${isActive ? "bg-[#0A4D5C]/10 ring-1 ring-[#0A4D5C]" : ""}`} title={label}>
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {reactionGroups.length > 0 && (
            <div className="flex gap-0.5 ml-0.5">
              {reactionGroups.slice(0, 3).map((g, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-[#0A4D5C]/[0.06] px-1.5 py-0.5 text-[10px]">{g.emoji} {g.count}</span>
              ))}
            </div>
          )}

          <button onClick={openAndFocus}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors ${showComments ? "text-[#0A4D5C] bg-[#0A4D5C]/10 font-medium" : "text-[#0A4D5C]/40 hover:bg-[#0A4D5C]/[0.04] hover:text-[#0A4D5C]"}`}>
            <MessageCircle className="h-4 w-4" />
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>

          <div className="relative" ref={shareRef}>
            <button onClick={() => setShareMenuOpen(isShareOpen ? null : post.id)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/40 hover:bg-[#0A4D5C]/[0.04] hover:text-[#0A4D5C] transition-colors">
              <Share2 className="h-4 w-4" />
            </button>
            {isShareOpen && <ShareMenu post={post} onClose={() => setShareMenuOpen(null)} onRepost={onRepost} />}
          </div>

          {isOwnPost && (
            <button onClick={() => onDelete(post.id)}
              className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/25 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {!isOwnPost && (
            <button
              onClick={() => useStore.getState().openReportDialog({ targetType: "post", targetId: post.id })}
              title="Denunciar post"
              className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/25 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Flag className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* COMMENTS */}
        {showComments && (
          <div className={`mt-2 rounded-xl ${commentsBg} p-2.5 space-y-1.5`}>
            {commentsLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2 animate-pulse">
                    <div className="h-6 w-6 rounded-full bg-[#0A4D5C]/10" />
                    <div className="flex-1 h-3 bg-[#0A4D5C]/8 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {commentRoots.map((comment) => (
                  <CommentItem key={comment.id} comment={comment} replies={commentMap.get(comment.id) || []} profile={profile}
                    onReply={handleReply} onDelete={deleteComment} onReaction={handleCommentReaction} openUserProfile={openUserProfile} />
                ))}
                {comments.length === 0 && <p className="text-xs text-[#0A4D5C]/30 text-center py-2">Nenhum comentário ainda</p>}
              </>
            )}
            <div className="flex items-center gap-1.5 mt-1.5">
              <UserAvatar user={{ id: profile?.id || "", display_name: profile?.display_name || "?", avatar_url: profile?.avatar_url }} className="h-5 w-5 shrink-0" />
              <div className="flex-1 relative">
                {replyTo && (
                  <div className="absolute -top-3.5 left-0 flex items-center gap-1 text-[9px] text-[#0A4D5C]/40">
                    <Reply className="h-2 w-2" />
                    <span>Respondendo a {replyTo?.author?.display_name || "Usuário"}</span>
                    <button onClick={() => setReplyTo(null)} className="text-[#0A4D5C]/60 hover:text-[#0A4D5C] ml-1">✕</button>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <input ref={commentInputRef} placeholder="Comentar..." value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitComment()}
                    className="flex-1 min-w-0 rounded-full border border-[#0A4D5C]/10 bg-[#f7f9fa] px-2.5 py-1 text-[11px] sm:text-xs text-[#000305] focus:outline-none focus:border-[#2EC4B6] placeholder:text-[#0A4D5C]/30" />
                  <button onClick={submitComment} disabled={!commentInput.trim() || submitting}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] hover:bg-[#25b0a3] transition-colors disabled:opacity-30">
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">💬</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// CommentItem
// ═══════════════════════════════════════════════════════════
const CommentItem = memo(function CommentItem({
  comment, replies, profile, onReply, onDelete, onReaction, openUserProfile,
}: {
  comment: Comment; replies: Comment[]; profile: Profile | null;
  onReply: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  onReaction: (commentId: string, type: string) => void;
  openUserProfile?: (userId: string) => void;
}) {
  const isOwn = comment.author_id === profile?.id;
  const [showCommentReactions, setShowCommentReactions] = useState(false);

  return (
    <div>
      <div className="flex items-start gap-1.5">
        <button onClick={() => comment.author?.id && openUserProfile?.(comment.author.id)} className="shrink-0">
          <UserAvatar user={comment.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => comment.author?.id && openUserProfile?.(comment.author.id)} className="text-[10px] sm:text-[11px] font-semibold text-[#000305] hover:underline">
              {comment.author?.display_name || "Usuário"}
            </button>
            <span className="text-[9px] sm:text-[10px] text-[#0A4D5C]/30">{timeAgo(comment.created_at)}</span>
          </div>
          <FormattedText className="text-[11px] sm:text-xs text-[#000305]/80 leading-relaxed" content={comment.content} />
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="relative">
              <button onClick={() => setShowCommentReactions(!showCommentReactions)} className="text-[10px] text-[#0A4D5C]/30 hover:text-[#0A4D5C] transition-colors">
                {comment.reactions?.length > 0 ? `❤️ ${comment.reactions.length}` : "❤️"}
              </button>
              {showCommentReactions && (
                <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 rounded-xl bg-[#f7f9fa] p-1 shadow-lg border border-[#0A4D5C]/10 z-20">
                  {REACTION_EMOJIS.map(({ type, emoji }) => (
                    <button key={type} onClick={() => { onReaction(comment.id, type); setShowCommentReactions(false); }} className="rounded-lg p-1 text-sm hover:scale-110 transition-transform">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => onReply(comment)} className="text-[10px] text-[#0A4D5C]/30 hover:text-[#0A4D5C] transition-colors">Responder</button>
            {isOwn && <button onClick={() => onDelete(comment.id)} className="text-[10px] text-[#0A4D5C]/20 hover:text-red-500 transition-colors">Excluir</button>}
            {!isOwn && (
              <button
                onClick={() => useStore.getState().openReportDialog({ targetType: "comment", targetId: comment.id })}
                className="text-[10px] text-[#0A4D5C]/20 hover:text-red-500 transition-colors"
              >
                Denunciar
              </button>
            )}
          </div>
        </div>
      </div>
      {replies.length > 0 && (
        <div className="ml-6 mt-1 space-y-1 border-l-2 border-[#0A4D5C]/8 pl-2">
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} replies={[]} profile={profile} onReply={onReply} onDelete={onDelete} onReaction={onReaction} openUserProfile={openUserProfile} />
          ))}
        </div>
      )}
    </div>
  );
});
