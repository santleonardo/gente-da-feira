"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, UserPlus, UserMinus, MessageCircle, Users, Lock, Loader2, Clock, MoreVertical, Ban, ShieldBan, Play, Pause, Video, Mic, X, Repeat2, Users as UsersIcon, Camera, Flag } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { timeAgo } from "@/lib/constants";
import { parseInlineFormatting as parseInlineContent } from "@/lib/link-utils";
import { toast } from "sonner";
import { sanitizeHTMLSync } from "@/lib/sanitize";

// Abre o perfil de um usuário (ex: ao clicar numa @menção) via evento global,
// mesmo padrão usado em outras telas (FeedView, ProfileView, DMsView, RoomsView).
function openUserProfileById(userId: string) {
  window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId } }));
}

// ═══════════════════════════════════════════════════════════
// Post-it colors (Tailwind classes)
// ═══════════════════════════════════════════════════════════
const POST_IT_COLORS = [
  { bg: "bg-[#fef9c3]", text: "text-[#854d0e]", border: "border-[#fde68a]" },       // Amarelo
  { bg: "bg-[#fce7f3]", text: "text-[#9d174d]", border: "border-[#fbcfe8]" },        // Rosa
  { bg: "bg-[#dbeafe]", text: "text-[#1e40af]", border: "border-[#bfdbfe]" },        // Azul
  { bg: "bg-[#dcfce7]", text: "text-[#166534]", border: "border-[#bbf7d0]" },        // Verde
  { bg: "bg-[#ffedd5]", text: "text-[#9a3412]", border: "border-[#fed7aa]" },        // Laranja
  { bg: "bg-[#ede9fe]", text: "text-[#5b21b6]", border: "border-[#ddd6fe]" },        // Roxo
  { bg: "bg-[#fee2e2]", text: "text-[#991b1b]", border: "border-[#fecaca]" },        // Coral
  { bg: "bg-[#d1fae5]", text: "text-[#065f46]", border: "border-[#a7f3d0]" },        // Menta
  { bg: "bg-[#e0e7ff]", text: "text-[#3730a3]", border: "border-[#c7d2fe]" },        // Lavanda
  { bg: "bg-[#fef3c7]", text: "text-[#92400e]", border: "border-[#fde68a]" },        // Pêssego
  { bg: "bg-white", text: "text-[#374151]", border: "border-[#d1d5db]" },              // Branco
  { bg: "bg-[#f3f4f6]", text: "text-[#4b5563]", border: "border-[#d1d5db]" },        // Cinza
] as const;

// Cores em hex para uso com inline styles (post_style)
const POST_IT_COLORS_HEX = [
  { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },       // Amarelo
  { bg: "#fce7f3", text: "#9d174d", border: "#fbcfe8" },        // Rosa
  { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },        // Azul
  { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },        // Verde
  { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa" },        // Laranja
  { bg: "#ede9fe", text: "#5b21b6", border: "#ddd6fe" },        // Roxo
  { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },        // Coral
  { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0" },        // Menta
  { bg: "#e0e7ff", text: "#3730a3", border: "#c7d2fe" },        // Lavanda
  { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },        // Pêssego
  { bg: "#ffffff", text: "#374151", border: "#d1d5db" },        // Branco
  { bg: "#f3f4f6", text: "#4b5563", border: "#d1d5db" },        // Cinza
] as const;

const EDITOR_FONTS = ["Nunito", "Quicksand", "Poppins", "Inter", "Comfortaa", "Montserrat", "Lato", "Raleway", "DM Sans", "Work Sans"] as const;

// ═══════════════════════════════════════════════════════════
// Helpers para renderização de mídia nos posts
// ═══════════════════════════════════════════════════════════

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
// VideoPlayer (para posts do perfil público)
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
    <div className="mt-2 relative rounded-xl overflow-hidden bg-[#000305] shadow-md group">
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-56 object-contain"
        playsInline
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
        onClick={toggle}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/30 cursor-pointer" onClick={toggle}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-lg transition-transform hover:scale-110">
            <Play className="h-6 w-6 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#000305]/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="text-white">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (videoRef.current && duration) videoRef.current.currentTime = pct * duration;
          }}>
            <div className="h-full bg-white rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
          </div>
          <span className="text-[9px] text-white/80 tabular-nums">{formatDuration(currentTime)}/{formatDuration(duration)}</span>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-[#000305]/60 backdrop-blur-sm px-2 py-0.5 text-[9px] font-medium text-white">
        <Video className="h-2.5 w-2.5" /> Vídeo
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AudioPlayer (para posts do perfil público)
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
    <div className="mt-2 rounded-xl bg-[#0A4D5C]/[0.06] p-2.5 shadow-sm border border-[#0A4D5C]/10">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A4D5C] text-white shadow-md hover:bg-[#0A4D5C]/90 transition-all">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="h-3 w-3 text-[#0A4D5C]" />
            <span className="text-[10px] font-semibold text-[#0A4D5C]">Áudio</span>
            <span className="text-[9px] text-[#0A4D5C]/40 tabular-nums">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
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
// PhotoGrid (para posts do perfil público)
// ═══════════════════════════════════════════════════════════
function PhotoGrid({ photos, onPhotoClick }: { photos: string[]; onPhotoClick?: (index: number) => void }) {
  const count = photos.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <button onClick={() => onPhotoClick?.(0)} className="mt-2 w-full overflow-hidden rounded-xl shadow-sm">
        <img src={photos[0]} alt="Foto do post" className="w-full max-h-56 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
      </button>
    );
  }
  if (count === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl shadow-sm">
        {photos.map((url, i) => (
          <button key={i} onClick={() => onPhotoClick?.(i)} className="overflow-hidden">
            <img src={url} alt={`Foto ${i + 1}`} className="w-full h-32 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl shadow-sm">
        <button onClick={() => onPhotoClick?.(0)} className="row-span-2 overflow-hidden">
          <img src={photos[0]} alt="Foto 1" className="w-full h-full object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
        <button onClick={() => onPhotoClick?.(1)} className="overflow-hidden">
          <img src={photos[1]} alt="Foto 2" className="w-full h-32 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
        <button onClick={() => onPhotoClick?.(2)} className="overflow-hidden">
          <img src={photos[2]} alt="Foto 3" className="w-full h-32 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl shadow-sm">
      {photos.slice(0, 4).map((url, i) => (
        <button key={i} onClick={() => onPhotoClick?.(i)} className="relative overflow-hidden">
          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-32 object-cover hover:opacity-95 transition-opacity" loading="lazy" decoding="async" />
          {i === 3 && count > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#000305]/50 text-white font-bold text-sm">+{count - 4}</div>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#000305]/90 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X className="h-5 w-5" /></button>
      {photos.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => (i > 0 ? i - 1 : photos.length - 1)); }} className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">&#8249;</button>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => (i < photos.length - 1 ? i + 1 : 0)); }} className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">&#8250;</button>
        </>
      )}
      <img src={photos[currentIndex]} alt={`Foto ${currentIndex + 1}`} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
      {photos.length > 1 && <div className="absolute bottom-4 text-white/70 text-sm">{currentIndex + 1} / {photos.length}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ExpirationCounter
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
    <div className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold text-card-foreground bg-[#f7f75e] rounded-full px-2 py-0.5 w-fit">
      <Clock className="h-2.5 w-2.5" />
      <span>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FormattedText — renderiza HTML do editor WYSIWYG ou markdown
// ═══════════════════════════════════════════════════════════
function isHTMLContent(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function sanitizeHTML(html: string): string {
  return sanitizeHTMLSync(html);
}

// parseInlineFormatting agora vem de @/lib/link-utils (importado como
// parseInlineContent) — fonte única, com suporte a URL + @menção + markdown.

function FormattedText({
  content,
  className,
  style,
}: {
  content: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!content) return null;
  if (isHTMLContent(content)) {
    return (
      <div
        className={`post-content ${className || ""}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: sanitizeHTML(content) }}
      />
    );
  }

  const lines = content.split("\n");

  return (
    <div className={className} style={style}>
      {lines.map((line, i) => {
        let headingLevel = 0;
        let text = line;
        if (text.startsWith("### ")) { headingLevel = 3; text = text.slice(4); }
        else if (text.startsWith("## ")) { headingLevel = 2; text = text.slice(3); }
        else if (text.startsWith("# ")) { headingLevel = 1; text = text.slice(2); }

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

function getPostItColor(postId: string) {
  let hash = 0;
  for (let i = 0; i < postId.length; i++) {
    hash = postId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return POST_IT_COLORS[Math.abs(hash) % POST_IT_COLORS.length];
}

interface UserProfileDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProfileDialog({ userId, open, onOpenChange }: UserProfileDialogProps) {
  const { profile } = useStore();
  const [userData, setUserData] = useState<any>(null);
  const [followData, setFollowData] = useState<{
    followingCount: number;
    followersCount: number;
    isFollowing: boolean;
    isPending: boolean;
  }>({ followingCount: 0, followersCount: 0, isFollowing: false, isPending: false });
  const [postCount, setPostCount] = useState(0);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "followers" | "following" | "album">("posts");
  const [followList, setFollowList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [albumPhotos, setAlbumPhotos] = useState<any[]>([]);
  const [albumVideos, setAlbumVideos] = useState<any[]>([]);
  const [albumLoading, setAlbumLoading] = useState(false);

  // Photo viewer state
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const openPhotoViewer = (photos: string[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const [privacyInfo, setPrivacyInfo] = useState<{
    is_private: boolean;
    hide_following: boolean;
    hide_followers: boolean;
    hide_neighborhood: boolean;
    approve_followers: boolean;
    isRestricted: boolean;
    isPending: boolean;
    isBlockedByViewer: boolean;
    isBlockedByTarget: boolean;
  }>({ is_private: false, hide_following: false, hide_followers: false, hide_neighborhood: false, approve_followers: false, isRestricted: false, isPending: false, isBlockedByViewer: false, isBlockedByTarget: false });

  // Carregar Google Fonts para post_style
  useEffect(() => {
    const fontsParam = EDITOR_FONTS.map(
      (f) => `family=${f.replace(/ /g, "+")}:wght@400;700`
    ).join("&");
    const href = `https://fonts.googleapis.com/css2?${fontsParam}&display=swap`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (!userId || !open) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const profileRes = await fetch(`/api/users/${userId}`);
        const profileData = await profileRes.json();
        if (profileData.user) {
          setUserData(profileData.user);
          setPostCount(profileData.user._count?.posts || 0);
          if (profileData._privacy) {
            setPrivacyInfo((prev) => ({ ...prev, ...profileData._privacy }));
          }
        }
        const followRes = await fetch(`/api/follows?userId=${userId}`);
        const followDataResult = await followRes.json();
        if (!followRes.ok && followDataResult.error) {
          setFollowData({ followingCount: 0, followersCount: 0, isFollowing: false, isPending: false });
        } else {
          setFollowData({
            followingCount: followDataResult.followingCount || 0,
            followersCount: followDataResult.followersCount || 0,
            isFollowing: followDataResult.isFollowing || false,
            isPending: followDataResult.isPending || false,
          });
          if (followDataResult._privacy) {
            setPrivacyInfo((prev) => ({
              ...prev,
              hide_following: followDataResult._privacy.hide_following,
              hide_followers: followDataResult._privacy.hide_followers,
              hide_neighborhood: followDataResult._privacy.hide_neighborhood,
              approve_followers: followDataResult._privacy.approve_followers,
              isRestricted: followDataResult._privacy.isRestricted ?? prev.isRestricted,
            }));
          }
        }
        setPostsLoading(true);
        const postsRes = await fetch(`/api/users/${userId}/posts`);
        const postsData = await postsRes.json();
        if (postsData.posts) setUserPosts(postsData.posts);
        setPostsLoading(false);
        // Fetch album
        setAlbumLoading(true);
        try {
          const [pRes, vRes] = await Promise.all([
            fetch(`/api/profile-photos?userId=${userId}`),
            fetch(`/api/profile-videos?userId=${userId}`),
          ]);
          const pData = await pRes.json();
          const vData = await vRes.json();
          if (pData.photos) setAlbumPhotos(pData.photos);
          if (vData.videos) setAlbumVideos(vData.videos);
        } catch { /* silent */ }
        setAlbumLoading(false);
      } catch { /* silent */ }
      setLoading(false);
    };
    fetchData();
  }, [userId, open]);

  useEffect(() => {
    if (!userId || !open || privacyInfo.isRestricted || activeTab === "posts") return;
    const fetchList = async () => {
      setListLoading(true);
      try {
        const res = await fetch(`/api/follows?userId=${userId}`);
        const data = await res.json();
        if (data.error) { setFollowList([]); } else {
          let list: any[] = [];
          if (activeTab === "followers") list = (data.followers || []).map((f: any) => f.follower).filter(Boolean);
          else if (activeTab === "following") list = (data.following || []).map((f: any) => f.following).filter(Boolean);
          setFollowList(list);
        }
      } catch { setFollowList([]); }
      setListLoading(false);
    };
    fetchList();
  }, [userId, open, activeTab, privacyInfo.isRestricted]);

  const handleFollowToggle = async () => {
    if (!userId || !profile || profile.id === userId || followLoading) return;
    setFollowLoading(true);
    try {
      const res = await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: userId }) });
      const data = await res.json();
      if (data.error) { toast.error(data.error); } else {
        if (data.following) {
          setFollowData((prev) => ({ ...prev, isFollowing: true, isPending: false, followersCount: prev.followersCount + 1 }));
          toast.success("Seguindo!");
          if (privacyInfo.is_private) {
            setPrivacyInfo((prev) => ({ ...prev, isRestricted: false }));
            const profileRes = await fetch(`/api/users/${userId}`);
            const profileData = await profileRes.json();
            if (profileData.user) { setUserData(profileData.user); setPostCount(profileData.user._count?.posts || 0); }
            const postsRes = await fetch(`/api/users/${userId}/posts`);
            const postsData = await postsRes.json();
            if (postsData.posts) setUserPosts(postsData.posts);
          }
        } else if (data.pending) {
          setFollowData((prev) => ({ ...prev, isFollowing: false, isPending: true }));
          toast.success("Solicitação enviada!");
        } else {
          const wasPending = followData.isPending;
          setFollowData((prev) => ({ ...prev, isFollowing: false, isPending: false, followersCount: wasPending ? prev.followersCount : prev.followersCount - 1 }));
          toast.success(wasPending ? "Solicitação cancelada" : "Deixou de seguir");
        }
      }
    } catch { toast.error("Erro ao seguir"); }
    setFollowLoading(false);
  };

  const handleBlockToggle = async () => {
    if (!userId || !profile || profile.id === userId || blockLoading) return;
    setBlockLoading(true);
    try {
      const res = await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: userId }) });
      const data = await res.json();
      if (data.blocked) {
        setPrivacyInfo((prev) => ({ ...prev, isBlockedByViewer: true }));
        setFollowData((prev) => ({ ...prev, isFollowing: false, isPending: false, followersCount: prev.isFollowing ? prev.followersCount - 1 : prev.followersCount }));
        toast.success("Usuário bloqueado");
      } else if (data.blocked === false) {
        setPrivacyInfo((prev) => ({ ...prev, isBlockedByViewer: false }));
        toast.success("Usuário desbloqueado");
      } else {
        toast.error(data.error || "Erro ao bloquear");
      }
    } catch { toast.error("Erro ao bloquear"); }
    setBlockLoading(false);
  };

  const handleStartDM = async () => {
    if (!profile || !userId) return;
    if (privacyInfo.isBlockedByViewer || privacyInfo.isBlockedByTarget) { toast.error("Não é possível enviar mensagem para este usuário"); return; }
    try {
      const res = await fetch("/api/dm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiverId: userId }) });
      const data = await res.json();
      if (data.conversation) { useStore.getState().setSelectedDM(data.conversation); useStore.getState().setTab("dms"); onOpenChange(false); }
    } catch { toast.error("Erro ao iniciar conversa"); }
  };

  const isOwnProfile = profile?.id === userId;
  const isBlocked = privacyInfo.isBlockedByViewer || privacyInfo.isBlockedByTarget;
  const isRestricted = (privacyInfo.isRestricted && !isOwnProfile) || isBlocked;
  const canSeeFollowing = isOwnProfile || !privacyInfo.hide_following;
  const canSeeFollowers = isOwnProfile || !privacyInfo.hide_followers;
  const canSeeNeighborhood = isOwnProfile || !privacyInfo.hide_neighborhood;

  const visibleTabs: Array<{ id: "posts" | "followers" | "following" | "album"; label: string }> = [{ id: "posts", label: "Posts" }];
  if (canSeeFollowers) visibleTabs.push({ id: "followers", label: "Seguidores" });
  if (canSeeFollowing) visibleTabs.push({ id: "following", label: "Seguindo" });
  visibleTabs.push({ id: "album", label: "Álbum" });

  useEffect(() => {
    if (activeTab !== "posts" && activeTab !== "album" && !visibleTabs.find(t => t.id === activeTab)) setActiveTab("posts");
  }, [canSeeFollowers, canSeeFollowing]);

  const renderFollowButton = () => {
    if (isOwnProfile || isBlocked) return null;
    if (followData.isFollowing) {
      return <Button size="sm" onClick={handleFollowToggle} disabled={followLoading} variant="outline" className="h-8 w-8 p-0 rounded-full">
        {followLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
      </Button>;
    }
    if (followData.isPending) {
      return <Button size="sm" onClick={handleFollowToggle} disabled={followLoading} variant="outline" className="gap-1.5 rounded-full px-4">
        {followLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Clock className="h-3.5 w-3.5" />Solicitado</>}
      </Button>;
    }
    const label = privacyInfo.approve_followers ? "Solicitar" : "Seguir";
    return <Button size="sm" onClick={handleFollowToggle} disabled={followLoading} variant="default" className="gap-1.5 rounded-full px-4">
      {followLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5" />{label}</>}
    </Button>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0 max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Perfil do usuário</DialogTitle>
        <DialogDescription className="sr-only">Informações e ações do perfil selecionado.</DialogDescription>
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2 flex-1"><div className="h-5 w-32 rounded bg-muted animate-pulse" /><div className="h-3 w-24 rounded bg-muted animate-pulse" /></div>
            </div>
          </div>
        ) : userData ? (
          <>
            <div className="px-5 pb-5 pt-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <UserAvatar user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }} className="h-14 w-14 shadow-lg" />
                    {(isRestricted || isBlocked) && (
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground">
                        <Lock className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-lg font-bold leading-tight">{userData.display_name}</h2>
                      {privacyInfo.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <p className="text-sm text-muted-foreground">@{userData.username}</p>
                  </div>
                </div>
                {!isOwnProfile && (
                  <div className="flex items-center gap-1.5 mt-8">
                    {renderFollowButton()}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!isBlocked && (
                          <DropdownMenuItem onClick={handleStartDM}>
                            <MessageCircle className="h-4 w-4 mr-2" />Enviar mensagem
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleBlockToggle} disabled={blockLoading}>
                          {privacyInfo.isBlockedByViewer ? <><ShieldBan className="h-4 w-4 mr-2" />Desbloquear</> : <><Ban className="h-4 w-4 mr-2" />Bloquear</>}
                        </DropdownMenuItem>
                        {/* UX-024: Denunciar perfil */}
                        <DropdownMenuItem
                          onClick={() => useStore.getState().openReportDialog({
                            targetType: "profile",
                            targetId: userId!,
                            label: `perfil de @${userData.username}`,
                          })}
                          className="text-red-500 focus:text-red-600"
                        >
                          <Flag className="h-4 w-4 mr-2" />Denunciar perfil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {isBlocked && privacyInfo.isBlockedByViewer ? (
                <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                  <Ban className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Você bloqueou este usuário</p>
                  <Button variant="outline" size="sm" onClick={handleBlockToggle} disabled={blockLoading} className="mt-2">Desbloquear</Button>
                </div>
              ) : isBlocked && privacyInfo.isBlockedByTarget ? (
                <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Este perfil não está disponível</p>
                </div>
              ) : isRestricted ? (
                <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Este perfil é privado</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Siga este perfil para ver suas publicações e informações</p>
                </div>
              ) : (
                <>
                  {userData.neighborhood && canSeeNeighborhood && <Badge variant="secondary" className="mt-2 gap-1"><MapPin className="h-3 w-3" /> {userData.neighborhood}</Badge>}
                  {userData.bio ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{parseInlineContent(userData.bio, openUserProfileById)}</p> : <p className="mt-3 text-sm text-muted-foreground italic">Sem bio ainda</p>}
                </>
              )}

              <div className="mt-3 flex gap-5">
                <button onClick={() => setActiveTab("posts")} className="text-center hover:opacity-80 transition-opacity"><p className="text-base font-bold">{postCount}</p><p className="text-[11px] text-muted-foreground">Posts</p></button>
                {canSeeFollowing && <button onClick={() => setActiveTab("following")} className="text-center hover:opacity-80 transition-opacity"><p className="text-base font-bold">{followData.followingCount}</p><p className="text-[11px] text-muted-foreground">Seguindo</p></button>}
                {canSeeFollowers && <button onClick={() => setActiveTab("followers")} className="text-center hover:opacity-80 transition-opacity"><p className="text-base font-bold">{followData.followersCount}</p><p className="text-[11px] text-muted-foreground">Seguidores</p></button>}
              </div>

              {!isRestricted && visibleTabs.length > 1 && (
                <div className="mt-4 flex border-b">
                  {visibleTabs.map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 pb-2 text-xs font-semibold text-center transition-colors ${activeTab === tab.id ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
              )}

              {!isRestricted && (
                <div className="overflow-y-auto mt-2 custom-scrollbar">
                  {activeTab === "posts" && (postsLoading ? <div className="space-y-2 py-2">{[1,2,3].map(i=><div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div> : userPosts.length === 0 ? <div className="py-8 text-center"><p className="text-xs text-muted-foreground">Nenhum post ainda</p></div> : (
                    <div className="space-y-2">
                      {userPosts.map((post: any) => {
                        // Coletar todas as fotos do post (image_urls ou image_url legado)
                        const postPhotos: string[] = post.image_urls?.length > 0
                          ? post.image_urls
                          : post.image_url
                            ? [post.image_url]
                            : [];

                        const hasPhotos = postPhotos.length > 0;
                        const hasVideo = !!post.video_url;
                        const hasAudio = !!post.audio_url;
                        const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;

                        // Sem cores de post-it: fundo branco + texto preto
                        const hasPostStyle = post.post_style && typeof post.post_style === "object";
                        const cardBg = "bg-card";

                        return (
                          <div
                            key={post.id}
                            className={`rounded-2xl ${cardBg} text-card-foreground shadow-sm cursor-pointer hover:shadow-md transition-shadow border border-[#0A4D5C]/10`}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('audio') || target.closest('video')) return;
                              onOpenChange(false);
                              setTimeout(() => {
                                const postWithAuthor = {
                                  ...post,
                                  author: post.author || {
                                    id: userId,
                                    display_name: userData?.display_name || "",
                                    username: userData?.username || "",
                                    avatar_url: userData?.avatar_url || null,
                                  },
                                };
                                window.dispatchEvent(new CustomEvent("openPostDetail", { detail: { post: postWithAuthor } }));
                              }, 200);
                            }}
                          >
                            <div className="p-3">
                              {/* Fotos */}
                              {postPhotos.length > 0 && (
                                <PhotoGrid
                                  photos={postPhotos}
                                  onPhotoClick={(index) => openPhotoViewer(postPhotos, index)}
                                />
                              )}

                              {/* Vídeo */}
                              {post.video_url && <VideoPlayer src={post.video_url} />}

                              {/* Áudio */}
                              {post.audio_url && <AudioPlayer src={post.audio_url} />}

                              {/* Texto com FormattedText + post_style */}
                              {isTextOnly ? (
                                <FormattedText
                                  className="mt-1 text-sm leading-snug whitespace-pre-wrap text-card-foreground"
                                  content={post.content}
                                  style={{
                                    fontFamily: hasPostStyle && post.post_style!.font ? `'${post.post_style!.font}', sans-serif` : undefined,
                                    fontWeight: hasPostStyle && post.post_style!.bold ? 700 : undefined,
                                    fontStyle: hasPostStyle && post.post_style!.italic ? "italic" : undefined,
                                    textAlign: hasPostStyle && post.post_style!.alignment ? post.post_style!.alignment : undefined,
                                    color: "var(--card-foreground)",
                                  }}
                                />
                              ) : (
                                <FormattedText
                                  className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-card-foreground"
                                  content={post.content}
                                />
                              )}

                              {/* Post compartilhado/repostado */}
                              {post.shared_post && !Array.isArray(post.shared_post) && (
                                <div className="mt-2 rounded-xl bg-[#0A4D5C]/[0.04] p-2.5 border border-[#0A4D5C]/8">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Repeat2 className="h-3 w-3 text-[#0A4D5C]/40" />
                                    <span className="text-[10px] text-[#0A4D5C]/40">Compartilhado de</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {post.shared_post.author?.avatar_url && (
                                      <img src={post.shared_post.author.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                                    )}
                                    <span className="text-xs font-semibold">{post.shared_post.author?.display_name || "Usuário"}</span>
                                  </div>
                                  <FormattedText className="text-xs text-[#0A4D5C]/60 leading-relaxed line-clamp-3" content={post.shared_post.content} />
                                  {post.shared_post.image_urls && post.shared_post.image_urls.length > 0 && (
                                    <div className="mt-1.5 flex gap-1 overflow-x-auto">
                                      {post.shared_post.image_urls.slice(0, 2).map((url: string, i: number) => (
                                        <img key={i} src={url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                                      ))}
                                      {post.shared_post.image_urls.length > 2 && (
                                        <div className="h-12 w-12 rounded-lg bg-[#0A4D5C]/[0.04] flex items-center justify-center text-[10px] text-[#0A4D5C]/40 shrink-0">
                                          +{post.shared_post.image_urls.length - 2}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Expiração */}
                              {post.expires_at && <ExpirationCounter expiresAt={post.expires_at} />}

                              {/* Data e bairro */}
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{timeAgo(post.created_at)}</span>
                                {post.neighborhood && <><span>·</span><span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{post.neighborhood}</span></>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {(activeTab === "followers" || activeTab === "following") && (listLoading ? <div className="space-y-2 py-2">{[1,2,3].map(i=><div key={i} className="flex items-center gap-2.5 animate-pulse"><div className="h-8 w-8 rounded-full bg-muted" /><div className="h-3 w-24 rounded bg-muted" /></div>)}</div> : followList.length === 0 ? <div className="py-8 text-center"><Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-xs text-muted-foreground">{activeTab === "followers" ? "Nenhum seguidor ainda" : "Não segue ninguém ainda"}</p></div> : (
                    <div className="space-y-0.5">
                      {followList.map((u: any) => (
                        <button key={u.id} onClick={() => { onOpenChange(false); setTimeout(() => { window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId: u.id } })); }, 200); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent">
                          <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-8 w-8" />
                          <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{u.display_name}</div><div className="text-[11px] text-muted-foreground truncate">@{u.username}</div></div>
                        </button>
                      ))}
                    </div>
                  ))}
                  {activeTab === "album" && (albumLoading ? <div className="grid grid-cols-3 gap-1.5 py-2">{[1,2,3,4,5,6].map(i=><div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}</div> : (albumPhotos.length === 0 && albumVideos.length === 0) ? <div className="py-8 text-center"><Camera className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-xs text-muted-foreground">Nenhuma foto ou vídeo no álbum</p></div> : (
                    <div className="space-y-3 py-1">
                      {albumPhotos.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Fotos ({albumPhotos.length})</p>
                          <div className="grid grid-cols-3 gap-1">
                            {albumPhotos.map((photo: any) => (
                              <button key={photo.id} className="aspect-square rounded-lg overflow-hidden" onClick={() => openPhotoViewer(albumPhotos.map((p: any) => p.url), albumPhotos.findIndex((p: any) => p.id === photo.id))}>
                                <img src={photo.url} alt="Foto do álbum" className="w-full h-full object-cover hover:opacity-90 transition-opacity" loading="lazy" decoding="async" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {albumVideos.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Vídeos ({albumVideos.length})</p>
                          <div className="space-y-1.5">
                            {albumVideos.map((video: any) => (
                              <div key={video.id} className="relative rounded-xl overflow-hidden bg-[#000305]">
                                <video src={video.url} className="w-full max-h-40 object-contain" playsInline preload="metadata" controls />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 text-[11px] text-muted-foreground/60">Entrou em {new Date(userData.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
            </div>
          </>
        ) : (
          <div className="p-6 text-center"><p className="text-sm text-muted-foreground">Usuário não encontrado</p></div>
        )}
      </DialogContent>
      {viewerOpen && viewerPhotos.length > 0 && (
        <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />
      )}
    </Dialog>
  );
}
