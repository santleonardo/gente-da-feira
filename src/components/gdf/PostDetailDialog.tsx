"use client";

import { useState, useEffect, useRef } from "react";
import { useStore, Profile } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Heart,
  MessageCircle,
  Trash2,
  Send,
  Reply,
  Share2,
  ChevronDown,
  X,
  Clock,
  Loader2,
  Play,
  Pause,
  Volume2,
  Repeat2,
  Copy,
  ExternalLink,
  Users as UsersIcon,
  Globe,
  Pencil,
  Flag,
} from "lucide-react";
import { getInitials, getAvatarColor, timeAgo } from "@/lib/constants";
import { UserAvatar } from "./UserAvatar";
import { toast } from "sonner";
import { parseInlineFormatting } from "@/lib/link-utils";
import { sanitizeHTMLSync, sanitizeHTMLAsync } from "@/lib/sanitize";

// ═══════════════════════════════════════════════════════════
// HTML detection and sanitization helpers
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

/**
 * FormattedContent — renderiza conteúdo de post detectando HTML automaticamente.
 * Se o conteúdo tem tags HTML, usa dangerouslySetInnerHTML com sanitização.
 * Caso contrário, usa parseInlineFormatting para links e menções.
 */
function FormattedContent({
  content,
  className,
  style,
  openUserProfile,
  isMine,
  linkClassName,
}: {
  content: string | null;
  className?: string;
  style?: React.CSSProperties;
  openUserProfile?: (userId: string) => void;
  isMine?: boolean;
  linkClassName?: string;
}) {
  const domPurifyReady = useDOMPurify();
  const [safeHTML, setSafeHTML] = useState<string | null>(null);

  useEffect(() => {
    if (!content || !isHTMLContent(content)) return;
    sanitizeHTMLAsync(content).then(setSafeHTML);
  }, [content]);

  if (!content) return null;

  if (isHTMLContent(content)) {
    const html = safeHTML ?? sanitizeHTMLSync(content);
    return (
      <div className={`post-content ${className || ""}`} style={style}
        dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  // Conteúdo de texto puro — renderizar com menções e links
  return (
    <p className={className} style={style}>
      {parseInlineFormatting(content, openUserProfile, { isMine, linkClassName })}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════
// Constants (duplicated from FeedView for self-containment)
// ═══════════════════════════════════════════════════════════
const REACTION_EMOJIS = [
  { type: "like", emoji: "❤️", label: "Curtir" },
  { type: "laugh", emoji: "😂", label: "Engraçado" },
  { type: "sad", emoji: "😔", label: "Triste" },
  { type: "wow", emoji: "😲", label: "Uau" },
  { type: "angry", emoji: "😡", label: "Bravo" },
  { type: "love", emoji: "😍", label: "Amei" },
] as const;

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

function getPostItColor(postId: string) {
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = postId.charCodeAt(i) + ((hash << 5) - hash);
  }
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
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Check if content is just a media placeholder emoji (legacy posts) or empty
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
// VideoPlayer (simplified for dialog)
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
    <div className="mt-2.5 relative rounded-3xl overflow-hidden bg-[#000305] shadow-lg group">
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-96 object-contain"
        playsInline
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
        onClick={toggle}
      />
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AudioPlayer (simplified for dialog)
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
      <audio ref={audioRef} src={src} preload="metadata" onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} onEnded={() => setPlaying(false)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PhotoGrid (simplified for dialog)
// ═══════════════════════════════════════════════════════════
function PhotoGrid({ photos, onPhotoClick }: { photos: string[]; onPhotoClick?: (index: number) => void }) {
  const count = photos.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <button onClick={() => onPhotoClick?.(0)} className="mt-2.5 w-full overflow-hidden rounded-3xl shadow-lg">
        <img src={photos[0]} alt="Foto do post" className="w-full max-h-80 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
      </button>
    );
  }
  if (count === 2) {
    return (
      <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-3xl shadow-lg">
        {photos.map((url, i) => (
          <button key={i} onClick={() => onPhotoClick?.(i)} className="overflow-hidden">
            <img src={url} alt={`Foto ${i + 1}`} className="w-full h-44 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
          </button>
        ))}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-3xl shadow-lg">
        <button onClick={() => onPhotoClick?.(0)} className="row-span-2 overflow-hidden">
          <img src={photos[0]} alt="Foto 1" className="w-full h-full object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
        <button onClick={() => onPhotoClick?.(1)} className="overflow-hidden">
          <img src={photos[1]} alt="Foto 2" className="w-full h-44 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
        <button onClick={() => onPhotoClick?.(2)} className="overflow-hidden">
          <img src={photos[2]} alt="Foto 3" className="w-full h-44 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-1 overflow-hidden rounded-3xl shadow-lg">
      {photos.slice(0, 4).map((url, i) => (
        <button key={i} onClick={() => onPhotoClick?.(i)} className="relative overflow-hidden">
          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-44 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
          {i === 3 && count > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/50 text-[#f7f9fa] font-bold text-lg">+{count - 4}</div>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PhotoViewer
// ═══════════════════════════════════════════════════════════
function PhotoViewer({ photos, initialIndex, onClose }: { photos: string[]; initialIndex: number; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#000305]/90 backdrop-blur-sm" onClick={onClose}>
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
// ShareMenu
// ═══════════════════════════════════════════════════════════
function ShareMenu({
  post,
  onClose,
  onRepost,
}: {
  post: PostWithAuthor;
  onClose: () => void;
  onRepost: (post: PostWithAuthor) => void;
}) {
  const handleExternalShare = async () => {
    const shareData = {
      title: `Post de ${post.author?.display_name || "Usuário"}`,
      text: (post.content || "").slice(0, 100) + ((post.content || "").length > 100 ? "..." : ""),
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n\n--- GDF Chat`);
        toast.success("Texto copiado!");
      }
    } catch { /* cancelled */ }
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText((post.content || "").slice(0, 200));
      toast.success("Texto copiado!");
    } catch { toast.error("Erro ao copiar"); }
    onClose();
  };

  return (
    <div className="absolute right-0 bottom-full mb-2 w-12 rounded-2xl bg-[#f7f9fa] p-1 shadow-lg border border-[#0A4D5C]/10 z-30 animate-in fade-in-0 zoom-in-95 flex flex-col items-center gap-0.5">
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
// CommentItem
// ═══════════════════════════════════════════════════════════
function CommentItem({
  comment, replies, profile, onReply, onDelete, onReaction, openUserProfile,
}: {
  comment: Comment;
  replies: Comment[];
  profile: Profile | null;
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
          <p className="text-[11px] sm:text-xs text-[#000305]/80 leading-relaxed">{comment.content}</p>
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
            {isOwn && (
              <button onClick={() => onDelete(comment.id)} className="text-[10px] text-[#0A4D5C]/20 hover:text-red-500 transition-colors">Excluir</button>
            )}
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
}

// ═══════════════════════════════════════════════════════════
// PostDetailDialog (main export)
// ═══════════════════════════════════════════════════════════
interface PostDetailDialogProps {
  post: PostWithAuthor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDetailDialog({ post, open, onOpenChange }: PostDetailDialogProps) {
  const { profile } = useStore();
  const [localPost, setLocalPost] = useState<PostWithAuthor | null>(null);
  const [showComments, setShowComments] = useState(true); // Always expanded in detail view
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [repostingPost, setRepostingPost] = useState<PostWithAuthor | null>(null);
  const [repostContent, setRepostContent] = useState("");
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [expirationLabel, setExpirationLabel] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [wasEdited, setWasEdited] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  // Sync post prop to local state
  useEffect(() => {
    if (post) setLocalPost({ ...post });
  }, [post]);

  // Fetch comments on open
  useEffect(() => {
    if (!open || !post) return;
    setShowComments(true);
    fetchComments();
  }, [open, post?.id]);

  // Expiration label
  useEffect(() => {
    if (!localPost?.expires_at) return;
    const update = () => setExpirationLabel(getExpirationLabel(localPost.expires_at!));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [localPost?.expires_at]);

  // Close share menu on outside click
  useEffect(() => {
    if (!shareMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareMenuOpen]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setComments([]);
      setCommentInput("");
      setReplyTo(null);
      setShowReactions(false);
      setShareMenuOpen(false);
      setRepostingPost(null);
      setRepostContent("");
      setViewerOpen(false);
      setIsEditing(false);
      setEditContent("");
      setWasEdited(false);
    }
  }, [open]);

  const navigateToProfile = (uid: string) => {
    onOpenChange(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: uid } }));
    }, 200);
  };

  const fetchComments = async () => {
    if (!post) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      const data = await res.json();
      if (data.comments) setComments(data.comments);
    } catch { /* silent */ }
    setCommentsLoading(false);
  };

  const submitComment = async () => {
    if (!commentInput.trim() || !profile || !post || submitting) return;
    setSubmitting(true);
    try {
      const body: { content: string; parentId?: string } = { content: commentInput.trim() };
      if (replyTo) body.parentId = replyTo.id;
      const res = await fetch(`/api/posts/${post.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setCommentInput("");
        setReplyTo(null);
        setLocalPost((prev) => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev);
      } else if (data.error) toast.error(data.error);
    } catch { toast.error("Erro ao comentar"); }
    setSubmitting(false);
  };

  const deleteComment = async (commentId: string) => {
    if (!post) return;
    try {
      const res = await fetch(`/api/posts/${post.id}/comments?commentId=${commentId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setLocalPost((prev) => prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count || 0) - 1) } : prev);
      }
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

  const handleReaction = async (type: string) => {
    if (!profile || !localPost) return;
    try {
      const res = await fetch("/api/posts/reaction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: localPost.id, type }) });
      const data = await res.json();
      if (data.reacted !== undefined) {
        setLocalPost((prev) => prev ? { ...prev, reactions: data.reacted ? [...prev.reactions, { user_id: profile.id, type }] : prev.reactions.filter((r) => !(r.user_id === profile.id && r.type === type)) } : prev);
      }
    } catch { /* silent */ }
    setShowReactions(false);
  };

  const handleEdit = () => {
    if (!localPost) return;
    setEditContent(localPost.content || "");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    // Permite conteúdo vazio se o post tem mídia
    const hasMedia = (localPost?.image_urls && localPost.image_urls.length > 0) || !!localPost?.video_url || !!localPost?.audio_url;
    if (!localPost) return;
    if (!editContent.trim() && !hasMedia) return;
    try {
      const res = await fetch(`/api/posts/${localPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const data = await res.json();
      if (data.post) {
        setLocalPost({ ...localPost, content: editContent.trim() || "" });
        setIsEditing(false);
        setWasEdited(true);
        toast.success("Post editado");
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch {
      toast.error("Erro ao editar");
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent("");
  };

  const handleDelete = async () => {
    if (!localPost) return;
    try {
      await fetch(`/api/posts?id=${localPost.id}`, { method: "DELETE" });
      toast.success("Post excluído");
      onOpenChange(false);
    } catch { toast.error("Erro ao excluir"); }
  };

  const handleRepost = async (repostPost: PostWithAuthor) => {
    if (!profile) return;
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: repostContent.trim() || `Compartilhado de @${repostPost.author.username}`,
          neighborhood: profile.neighborhood,
          imageUrls: [],
          videoUrl: null,
          audioUrl: null,
          visibility: "public",
          sharedPostId: repostPost.id,
        }),
      });
      const data = await res.json();
      if (data.post) {
        setRepostingPost(null);
        setRepostContent("");
        toast.success("Compartilhado no feed!");
      } else if (data.error) { toast.error(data.error); }
    } catch { toast.error("Erro ao compartilhar"); }
  };

  const openPhotoViewer = (photos: string[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const buildCommentTree = (flatComments: Comment[]) => {
    const map = new Map<string, Comment[]>();
    const roots: Comment[] = [];
    for (const c of flatComments) {
      if (c.parent_id) { const children = map.get(c.parent_id) || []; children.push(c); map.set(c.parent_id, children); }
      else roots.push(c);
    }
    return { roots, map };
  };

  if (!localPost || !open) return null;

  const { roots: commentRoots, map: commentMap } = buildCommentTree(comments);
  const reactionGroups = buildReactionGroups(localPost.reactions || []);
  const commentCount = localPost.comment_count || 0;
  const hasPhotos = localPost.image_urls && localPost.image_urls.length > 0;
  const hasVideo = !!localPost.video_url;
  const hasAudio = !!localPost.audio_url;
  const isOwnPost = localPost.author_id === profile?.id;
  const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;

  const hasPostStyle   = localPost.post_style && typeof localPost.post_style === "object";
  const styleColorIdx  = hasPostStyle && localPost.post_style!.postItColor != null ? localPost.post_style!.postItColor : -1;
  const postItColor    = isTextOnly ? (styleColorIdx >= 0 && styleColorIdx < POST_IT_COLORS.length ? POST_IT_COLORS[styleColorIdx] : getPostItColor(localPost.id)) : null;
  const postItColorHex = isTextOnly ? (styleColorIdx >= 0 && styleColorIdx < POST_IT_COLORS_HEX.length ? POST_IT_COLORS_HEX[styleColorIdx] : null) : null;
  const useInlineStyle = isTextOnly && styleColorIdx >= 0;

  const cardBg     = isTextOnly ? (useInlineStyle ? "" : (postItColor?.bg || "bg-[#fdf6b2]")) : "bg-[#eef1f3]";
  const commentsBg = "bg-[#0A4D5C]/[0.04]";

  // Link class based on post type
  const linkClass = isTextOnly
    ? "text-[#0A4D5C] underline decoration-[#0A4D5C]/40 underline-offset-2 hover:decoration-[#0A4D5C] transition-colors"
    : "text-[#0A4D5C] underline decoration-[#0A4D5C]/40 underline-offset-2 hover:decoration-[#0A4D5C] transition-colors";

  return (
    <>
      {/* Full-screen dialog overlay */}
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#000305]/50 backdrop-blur-sm overflow-y-auto" onClick={() => onOpenChange(false)}>
        <div
          className="w-full max-w-lg mx-4 my-8 rounded-3xl bg-[#f7f9fa] shadow-2xl border border-[#0A4D5C]/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#0A4D5C]/8">
            <h3 className="text-sm font-semibold text-[#000305]">Post</h3>
            <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#0A4D5C]/10 transition-colors">
              <X className="h-4 w-4 text-[#0A4D5C]/60" />
            </button>
          </div>

          {/* Post content */}
          <div
            className={`rounded-none ${cardBg} overflow-hidden ${isTextOnly && !useInlineStyle && postItColor ? `border ${postItColor.border}` : ""} ${!useInlineStyle ? "border border-[#0A4D5C]/8" : ""}`}
            style={useInlineStyle && postItColorHex ? { backgroundColor: postItColorHex.bg, border: `1px solid ${postItColorHex.border}` } : undefined}
          >
            <div className="p-4 sm:p-5">
              {/* Header */}
              <div className="flex items-start gap-2.5">
                <button onClick={() => localPost.author?.id && navigateToProfile(localPost.author.id)} className="shrink-0 group">
                  <UserAvatar user={localPost.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-10 w-10 sm:h-12 sm:w-12 hover:opacity-80 transition-opacity ring-2 ring-[#f7f9fa] shadow-sm" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => localPost.author?.id && navigateToProfile(localPost.author.id)}
                      className={`text-sm font-semibold hover:underline underline-offset-2 transition-all ${isTextOnly && !(hasPostStyle && localPost.post_style!.fontColor) ? postItColor?.text || "text-[#000305]" : "text-[#000305]"}`}
                      style={hasPostStyle && localPost.post_style!.fontColor ? { color: localPost.post_style!.fontColor } : undefined}
                    >
                      {localPost.author?.display_name || "Usuário"}
                    </button>
                    {localPost.visibility === "followers" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f7f75e] px-2 py-0.5 text-[10px] font-semibold text-[#000305]">
                        <UsersIcon className="h-2.5 w-2.5" />Seguidores
                      </span>
                    )}
                    {isOwnPost && (
                      <span className="inline-flex items-center rounded-full bg-[#f7f75e]/30 px-2 py-0.5 text-[10px] font-medium text-[#0A4D5C]">
                        Seu post
                      </span>
                    )}
                    {wasEdited && (
                      <span className="inline-flex items-center rounded-full bg-[#0A4D5C]/10 px-2 py-0.5 text-[10px] font-medium text-[#0A4D5C]/60">
                        Editado
                      </span>
                    )}
                    <span className={`text-[10px] ${isTextOnly ? "text-[#000305]/20" : "text-[#0A4D5C]/25"}`}>·</span>
                    <span className={`text-[10px] ${isTextOnly ? "text-[#000305]/40" : "text-[#0A4D5C]/40"}`}>{timeAgo(localPost.created_at)}</span>
                  </div>

                  {/* Content with clickable links and mentions */}
                  {isEditing ? (
                    <div className="mt-1.5">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value.slice(0, 500))}
                        className="w-full resize-none rounded-xl border border-[#0A4D5C]/20 bg-white/80 p-2.5 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#0A4D5C]/30"
                        rows={3}
                        autoFocus
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-[#0A4D5C]/40">{editContent.length}/500</span>
                        <div className="flex gap-1.5">
                          <button onClick={handleCancelEdit} className="rounded-full px-3 py-1 text-xs text-[#0A4D5C]/50 hover:bg-[#0A4D5C]/[0.04] transition-colors">Cancelar</button>
                          <button onClick={handleSaveEdit} disabled={!editContent.trim() && !((localPost?.image_urls && localPost.image_urls.length > 0) || localPost?.video_url || localPost?.audio_url)} className="rounded-full px-3 py-1 text-xs bg-[#0A4D5C] text-white hover:bg-[#0A4D5C]/90 transition-colors disabled:opacity-40">Salvar</button>
                        </div>
                      </div>
                    </div>
                  ) : isTextOnly && localPost.content && !isMediaPlaceholder(localPost.content) ? (
                    <FormattedContent
                      className={`mt-1.5 text-base sm:text-lg leading-snug whitespace-pre-wrap ${useInlineStyle || (hasPostStyle && localPost.post_style!.fontColor) ? "" : (postItColor?.text || "text-[#000305]")}`}
                      content={localPost.content}
                      openUserProfile={navigateToProfile}
                      isMine={isOwnPost}
                      linkClassName={linkClass}
                      style={{
                        fontFamily:  hasPostStyle && localPost.post_style!.font ? `'${localPost.post_style!.font}', sans-serif` : "serif",
                        fontWeight:  hasPostStyle && localPost.post_style!.bold ? 700 : undefined,
                        fontStyle:   hasPostStyle && localPost.post_style!.italic ? "italic" : undefined,
                        textAlign:   hasPostStyle && localPost.post_style!.alignment ? localPost.post_style!.alignment : undefined,
                        color:       hasPostStyle && localPost.post_style!.fontColor ? localPost.post_style!.fontColor : (useInlineStyle && postItColorHex ? postItColorHex.text : undefined),
                      }}
                    />
                  ) : null}

                  {/* Shared post (repost) */}
                  {localPost.shared_post && (
                    <div className="mt-2.5 rounded-2xl bg-[#0A4D5C]/[0.04] p-3 border border-[#0A4D5C]/8">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Repeat2 className="h-3 w-3 text-[#0A4D5C]/40" />
                        <span className="text-[10px] text-[#0A4D5C]/40">Compartilhado de</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <button onClick={() => localPost.shared_post?.author?.id && navigateToProfile(localPost.shared_post.author.id)} className="shrink-0">
                          <UserAvatar user={localPost.shared_post?.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-6 w-6" />
                        </button>
                        <button onClick={() => localPost.shared_post?.author?.id && navigateToProfile(localPost.shared_post.author.id)} className="text-xs font-semibold text-[#000305] hover:underline">
                          {localPost.shared_post?.author?.display_name || "Usuário"}
                        </button>
                      </div>
                      <FormattedContent className="text-xs text-[#0A4D5C]/60 leading-relaxed" content={localPost.shared_post.content} openUserProfile={navigateToProfile} linkClassName={linkClass} />
                      {localPost.shared_post.image_urls && localPost.shared_post.image_urls.length > 0 && (
                        <div className="mt-1.5 flex gap-1 overflow-x-auto">
                          {localPost.shared_post.image_urls.slice(0, 2).map((url, i) => (
                            <img key={i} src={url} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />
                          ))}
                          {localPost.shared_post.image_urls.length > 2 && (
                            <div className="h-16 w-16 rounded-xl bg-[#0A4D5C]/[0.04] flex items-center justify-center text-xs text-[#0A4D5C]/40 shrink-0">
                              +{localPost.shared_post.image_urls.length - 2}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Media */}
                  {/* Media — full width for non-text-only */}
                  {!isTextOnly && (hasPhotos || hasVideo || hasAudio) ? (
                    <div className="-mx-3 sm:-mx-4 mt-1.5">
                      {hasPhotos && <PhotoGrid photos={localPost.image_urls!} onPhotoClick={(index) => openPhotoViewer(localPost.image_urls || [], index)} />}
                      {hasVideo && <VideoPlayer src={localPost.video_url!} />}
                      {hasAudio && <AudioPlayer src={localPost.audio_url!} />}
                    </div>
                  ) : (
                    <>
                      {hasPhotos && <PhotoGrid photos={localPost.image_urls!} onPhotoClick={(index) => openPhotoViewer(localPost.image_urls || [], index)} />}
                      {hasVideo && <VideoPlayer src={localPost.video_url!} />}
                      {hasAudio && <AudioPlayer src={localPost.audio_url!} />}
                    </>
                  )}

                  {/* Caption — text below media for media posts */}
                  {!isTextOnly && localPost.content && localPost.content.trim() && !isMediaPlaceholder(localPost.content) && (
                    <div className="px-1 sm:px-1.5 mt-2">
                      <FormattedContent
                        className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap text-[#000305]"
                        content={localPost.content}
                        openUserProfile={navigateToProfile}
                        isMine={isOwnPost}
                        linkClassName={linkClass}
                        style={{
                          fontFamily:  hasPostStyle && localPost.post_style!.font      ? `'${localPost.post_style!.font}', sans-serif` : undefined,
                          fontWeight:  hasPostStyle && localPost.post_style!.bold      ? 700                                      : undefined,
                          fontStyle:   hasPostStyle && localPost.post_style!.italic    ? "italic"                                 : undefined,
                          textAlign:   hasPostStyle && localPost.post_style!.alignment ? localPost.post_style!.alignment as any    : undefined,
                          color:       hasPostStyle && localPost.post_style!.fontColor ? localPost.post_style!.fontColor           : undefined,
                        }}
                      />
                    </div>
                  )}

                  {/* Expiration */}
                  {localPost.expires_at && expirationLabel && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#000305] bg-[#f7f75e] rounded-full px-2.5 py-1 w-fit">
                      <Clock className="h-3 w-3" />
                      <span>{expirationLabel}</span>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="mt-2 flex items-center gap-0.5">
                    {/* Reactions */}
                    <div className="relative">
                      <button
                        onClick={() => setShowReactions(!showReactions)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors ${localPost.reactions?.some((r) => r.user_id === profile?.id) ? "text-[#0A4D5C] bg-[#0A4D5C]/10 font-medium" : "text-[#0A4D5C]/40 hover:bg-[#0A4D5C]/[0.04] hover:text-[#0A4D5C]"}`}
                      >
                        <Heart className="h-4 w-4" />
                        {localPost.reactions?.length > 0 && <span>{localPost.reactions.length}</span>}
                      </button>
                      {showReactions && (
                        <div className="absolute bottom-full left-0 mb-1.5 flex gap-0.5 rounded-2xl bg-[#f7f9fa] p-1.5 shadow-lg border border-[#0A4D5C]/10 z-20">
                          {REACTION_EMOJIS.map(({ type, emoji, label }) => {
                            const isActive = localPost.reactions?.some((r) => r.user_id === profile?.id && r.type === type);
                            return (
                              <button
                                key={type}
                                onClick={() => handleReaction(type)}
                                className={`rounded-xl p-1.5 text-lg transition-all hover:scale-125 ${isActive ? "bg-[#0A4D5C]/10 ring-1 ring-[#0A4D5C]" : ""}`}
                                title={label}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Reaction summary pills */}
                    {reactionGroups.length > 0 && (
                      <div className="flex gap-0.5 ml-0.5">
                        {reactionGroups.slice(0, 3).map((g, i) => (
                          <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-[#0A4D5C]/[0.06] px-1.5 py-0.5 text-[10px]">
                            {g.emoji} {g.count}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Comments */}
                    <button
                      onClick={() => commentInputRef.current?.focus()}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C] bg-[#0A4D5C]/10 font-medium"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {commentCount > 0 && <span>{commentCount}</span>}
                    </button>

                    {/* Share */}
                    <div className="relative" ref={shareRef}>
                      <button
                        onClick={() => setShareMenuOpen(!shareMenuOpen)}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/40 hover:bg-[#0A4D5C]/[0.04] hover:text-[#0A4D5C] transition-colors"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      {shareMenuOpen && (
                        <ShareMenu post={localPost} onClose={() => setShareMenuOpen(false)} onRepost={(p) => { setRepostingPost(p); setRepostContent(""); }} />
                      )}
                    </div>

                    {/* Edit (own posts) */}
                    {isOwnPost && !isEditing && (
                      <button
                        onClick={handleEdit}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/25 hover:text-[#0A4D5C] hover:bg-[#0A4D5C]/[0.04] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Delete (own posts) */}
                    {isOwnPost && (
                      <button
                        onClick={handleDelete}
                        className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/25 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Denunciar (posts de outros usuários) */}
                    {!isOwnPost && (
                      <button
                        onClick={() => useStore.getState().openReportDialog({ targetType: "post", targetId: localPost.id })}
                        title="Denunciar post"
                        className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-[#0A4D5C]/25 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Comments section - always expanded in detail view */}
              <div className={`mt-3 rounded-xl ${commentsBg} p-2.5 space-y-1.5`}>
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
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        replies={commentMap.get(comment.id) || []}
                        profile={profile}
                        onReply={(c) => { setReplyTo(c); setTimeout(() => commentInputRef.current?.focus(), 100); }}
                        onDelete={deleteComment}
                        onReaction={handleCommentReaction}
                        openUserProfile={navigateToProfile}
                      />
                    ))}
                    {comments.length === 0 && (
                      <p className="text-xs text-[#0A4D5C]/30 text-center py-2">Nenhum comentário ainda</p>
                    )}
                  </>
                )}

                {/* Comment input */}
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
                      <input
                        ref={commentInputRef}
                        placeholder="Comentar..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitComment()}
                        className="flex-1 min-w-0 rounded-full border border-[#0A4D5C]/10 bg-[#f7f9fa] px-2.5 py-1 text-[11px] sm:text-xs text-[#000305] focus:outline-none focus:border-[#2EC4B6] placeholder:text-[#0A4D5C]/30"
                      />
                      <button
                        onClick={submitComment}
                        disabled={!commentInput.trim() || submitting}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2EC4B6] text-[#f7f9fa] hover:bg-[#25b0a3] transition-colors disabled:opacity-30"
                      >
                        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">💬</span>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Repost dialog */}
      {repostingPost && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#000305]/50 backdrop-blur-sm" onClick={() => { setRepostingPost(null); setRepostContent(""); }}>
          <div className="w-full max-w-md mx-4 rounded-3xl bg-[#f7f9fa] p-5 shadow-lg border border-[#0A4D5C]/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#000305] mb-3">Compartilhar no feed</h3>
            <div className="rounded-2xl bg-[#0A4D5C]/[0.04] p-3 mb-3 border border-[#0A4D5C]/8">
              <div className="flex items-center gap-2 mb-1">
                <UserAvatar user={repostingPost.author || { id: "", display_name: "Usuário", username: "usuario" }} className="h-6 w-6" />
                <span className="text-xs font-semibold text-[#000305]">{repostingPost.author?.display_name || "Usuário"}</span>
                <span className="text-[10px] text-[#0A4D5C]/40">@{repostingPost.author?.username || "usuario"}</span>
              </div>
              <p className="text-xs text-[#0A4D5C]/60 line-clamp-3">{repostingPost.content}</p>
            </div>
            <textarea
              placeholder="Adicione um comentário (opcional)..."
              value={repostContent}
              onChange={(e) => setRepostContent(e.target.value.slice(0, 200))}
              className="w-full min-h-[60px] resize-none border-0 bg-transparent p-3 text-sm text-[#000305] focus:outline-none placeholder:text-[#0A4D5C]/30"
              rows={2}
            />
            <div className="flex items-center gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => { setRepostingPost(null); setRepostContent(""); }} className="rounded-full border-[#0A4D5C]/10 text-[#0A4D5C]">Cancelar</Button>
              <Button size="sm" onClick={() => handleRepost(repostingPost)} className="rounded-full gap-1.5 bg-[#0A4D5C] text-[#f7f9fa] hover:bg-[#0A4D5C]/90 border-0">
                <Repeat2 className="h-3.5 w-3.5" /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {viewerOpen && <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />}
    </>
  );
}
