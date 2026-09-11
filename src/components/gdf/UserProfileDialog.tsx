"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, UserPlus, UserMinus, MessageCircle, Users, Lock, Loader2, Clock, Menu as MenuIcon, Ban, ShieldBan, Play, Pause, Video, Mic, X, Repeat2, Flag, ChevronRight } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { ProfileEditorialStyles } from "./ProfileEditorialStyles";
import { ProfileHeroSlider } from "./ProfileHeroSlider";
import { PhotoViewer } from "./PhotoViewer";
import { resolveNameBandTheme } from "@/lib/name-band-theme";
import { timeAgo } from "@/lib/constants";
import { parseInlineFormatting as parseInlineContent } from "@/lib/link-utils";
import { toast } from "sonner";
import { sanitizeHTMLSync } from "@/lib/sanitize";

// Abre o perfil de um usuário (ex: ao clicar numa @menção) via evento global,
// mesmo padrão usado em outras telas (FeedView, ProfileView, DMsView, RoomsView).
function openUserProfileById(userId: string) {
  window.dispatchEvent(new CustomEvent("openUserProfile", { detail: { userId } }));
}

// ── helpers ───────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
    <div className="mt-2 rounded-xl bg-[#D96C4A]/[0.06] p-2.5 shadow-sm border border-black/[0.06]">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] text-white shadow-md hover:bg-[#1A1A1A]/90 transition-all">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="h-3 w-3 text-[#D96C4A]" />
            <span className="text-[10px] font-semibold text-[#1A1A1A]">Áudio</span>
            <span className="text-[9px] text-[#4A4A4A]/50 tabular-nums">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
          </div>
          <div className="h-1.5 bg-[#D96C4A]/20 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration) audioRef.current.currentTime = pct * duration;
          }}>
            <div className="h-full bg-[#D96C4A] rounded-full transition-all" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => { const d = audioRef.current?.duration; setDuration(d && isFinite(d) ? d : 0); }} onEnded={() => setPlaying(false)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PhotoViewer — fullscreen overlay
// ═══════════════════════════════════════════════════════════

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
  const [activeTab, setActiveTab] = useState<"posts" | "followers" | "following" | "sobre" | "salas">("posts");
  const [followList, setFollowList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  // Fotos do álbum, exibidas junto com a foto de perfil no slide do hero
  // (a antiga aba "Fotografia"/"Álbum" foi removida).
  const [heroPhotos, setHeroPhotos] = useState<string[]>([]);
  const [postsVisibleCount, setPostsVisibleCount] = useState(8);
  // Salas criadas pelo usuário, exibidas na aba "Sobre"
  const [createdRooms, setCreatedRooms] = useState<any[]>([]);
  const [createdRoomsLoading, setCreatedRoomsLoading] = useState(false);
  const [aboutPosts, setAboutPosts] = useState<any[]>([]);
  const [aboutPostsLoading, setAboutPostsLoading] = useState(false);
  const [aboutPostsLoadingMore, setAboutPostsLoadingMore] = useState(false);
  const [aboutPostsHasMore, setAboutPostsHasMore] = useState(false);
  const [aboutPostsCursor, setAboutPostsCursor] = useState<string | null>(null);
  const createdRoomsUserIdRef = useRef<string | null>(null);

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

  // Tipografia do shell: só Playfair (leve). Fontes de post_style ficam por conta do CSS do app.
  useEffect(() => {
    if (!open) return;
    const href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap";
    if (document.querySelector(`link[data-upd-fonts="1"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-upd-fonts", "1");
    // Não bloqueia first paint
    link.media = "print";
    link.onload = () => {
      link.media = "all";
    };
    document.head.appendChild(link);
  }, [open]);

  useEffect(() => {
    if (!userId || !open) return;

    const ac = new AbortController();
    const { signal } = ac;
    let cancelled = false;

    // Reset leve ao abrir outro perfil (evita flash de dados antigos)
    setActiveTab("posts");
    setPostsVisibleCount(8);
    setUserPosts([]);
    setAboutPosts([]);
    setAboutPostsCursor(null);
    setAboutPostsHasMore(false);
    setHeroPhotos([]);
    setFollowList([]);
    setViewerOpen(false);
    setCreatedRooms([]);
    createdRoomsUserIdRef.current = null;

    const fetchData = async () => {
      setLoading(true);
      setPostsLoading(true);
      try {
        // Perfil + follows em paralelo (caminho crítico)
        const [profileRes, followRes] = await Promise.all([
          fetch(`/api/users/${userId}`, { signal }),
          fetch(`/api/follows?userId=${userId}`, { signal }),
        ]);
        if (cancelled) return;

        const [profileData, followDataResult] = await Promise.all([
          profileRes.json(),
          followRes.json(),
        ]);
        if (cancelled) return;

        if (profileData.user) {
          setUserData(profileData.user);
          setPostCount(profileData.user._count?.posts || 0);
          if (profileData._privacy) {
            setPrivacyInfo((prev) => ({ ...prev, ...profileData._privacy }));
          }
        }

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

        // Libera o shell do perfil o quanto antes
        setLoading(false);

        // Posts depois (não bloqueia hero)
        const postsRes = await fetch(`/api/users/${userId}/posts`, { signal });
        if (cancelled) return;
        const postsData = await postsRes.json();
        if (!cancelled && postsData.posts) setUserPosts(postsData.posts);

        const aboutRes = await fetch(`/api/users/${userId}/posts?postType=about&limit=8`, { signal });
        if (cancelled) return;
        const aboutData = await aboutRes.json();
        if (!cancelled) {
          if (aboutData.posts) setAboutPosts(aboutData.posts);
          setAboutPostsCursor(aboutData.nextCursor ?? null);
          setAboutPostsHasMore(!!aboutData.hasMore && !!aboutData.nextCursor);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      } finally {
        if (!cancelled) {
          setPostsLoading(false);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [userId, open]);

  // Fotos do álbum para o slide do hero (junto com a foto de perfil).
  // Carregadas assim que o perfil abre — não dependem mais de uma aba.
  useEffect(() => {
    if (!userId || !open) return;

    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/profile-photos?userId=${userId}`, { signal: ac.signal });
        if (cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.photos)) {
          setHeroPhotos(data.photos.map((p: any) => p.url));
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [userId, open]);

  // Salas criadas pelo usuário — carregadas assim que o perfil abre
  // (junto com as fotos do hero), pois a própria aba "Salas" só aparece
  // na navegação quando sabemos que existe pelo menos uma sala.
  // /api/rooms retorna isMember/canJoin relativos a QUEM está vendo
  // (o viewer), o que é o comportamento certo: ao clicar numa sala
  // aqui, abrimos o chat se o viewer já é membro, ou o prompt de
  // entrada caso contrário — igual ao fluxo normal da aba Salas.
  useEffect(() => {
    if (!userId || !open) return;
    if (createdRoomsUserIdRef.current === userId) return;

    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setCreatedRoomsLoading(true);
      try {
        const res = await fetch("/api/rooms", { signal: ac.signal });
        if (cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.rooms)) {
          setCreatedRooms(data.rooms.filter((r: any) => r.created_by === userId));
          createdRoomsUserIdRef.current = userId;
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      } finally {
        if (!cancelled) setCreatedRoomsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [userId, open]);

  useEffect(() => {
    if (!userId || !open || privacyInfo.isRestricted || activeTab === "posts") return;
    const ac = new AbortController();
    let cancelled = false;
    const fetchList = async () => {
      setListLoading(true);
      try {
        const res = await fetch(`/api/follows?userId=${userId}`, { signal: ac.signal });
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setFollowList([]); } else {
          let list: any[] = [];
          if (activeTab === "followers") list = (data.followers || []).map((f: any) => f.follower).filter(Boolean);
          else if (activeTab === "following") list = (data.following || []).map((f: any) => f.following).filter(Boolean);
          setFollowList(list);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (!cancelled) setFollowList([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    };
    fetchList();
    return () => {
      cancelled = true;
      ac.abort();
    };
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
            const aboutRes = await fetch(`/api/users/${userId}/posts?postType=about&limit=8`);
            const aboutData = await aboutRes.json();
            if (aboutData.posts) setAboutPosts(aboutData.posts);
            setAboutPostsCursor(aboutData.nextCursor ?? null);
            setAboutPostsHasMore(!!aboutData.hasMore && !!aboutData.nextCursor);
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

  // Abre uma sala listada em "Salas criadas" — mesma sala/objeto retornado
  // por /api/rooms, já com isMember/canJoin calculados para QUEM está
  // vendo o perfil. RoomChat sabe lidar com os dois casos (chat direto
  // se já é membro, ou tela de "Entrar na sala" caso contrário).
  const handleOpenCreatedRoom = (room: any) => {
    onOpenChange(false);
    setTimeout(() => {
      useStore.getState().setSelectedRoom(room);
    }, 200);
  };

  const loadMoreAboutPosts = () => {
    if (!userId || !aboutPostsHasMore || aboutPostsLoadingMore || !aboutPostsCursor) return;
    setAboutPostsLoadingMore(true);
    const qs = new URLSearchParams({
      postType: "about",
      limit: "8",
      cursor: aboutPostsCursor,
    });
    fetch(`/api/users/${userId}/posts?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.posts) ? data.posts : [];
        setAboutPosts((prev) => [...prev, ...list]);
        setAboutPostsCursor(data.nextCursor ?? null);
        setAboutPostsHasMore(!!data.hasMore && !!data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setAboutPostsLoadingMore(false));
  };

  const isOwnProfile = profile?.id === userId;
  const isBlocked = privacyInfo.isBlockedByViewer || privacyInfo.isBlockedByTarget;
  const isRestricted = (privacyInfo.isRestricted && !isOwnProfile) || isBlocked;
  const nameBand = resolveNameBandTheme(userData?.theme);
  const canSeeFollowing = isOwnProfile || !privacyInfo.hide_following;
  const canSeeFollowers = isOwnProfile || !privacyInfo.hide_followers;
  const canSeeNeighborhood = isOwnProfile || !privacyInfo.hide_neighborhood;

  const visibleTabs: Array<{ id: "posts" | "followers" | "following" | "sobre" | "salas"; label: string }> = [
    { id: "posts", label: "Posts" },
    { id: "sobre", label: "Sobre" },
  ];
  if (createdRooms.length > 0) visibleTabs.push({ id: "salas", label: "Salas" });
  if (canSeeFollowers) visibleTabs.push({ id: "followers", label: "Seguidores" });
  if (canSeeFollowing) visibleTabs.push({ id: "following", label: "Seguindo" });

  useEffect(() => {
    if (activeTab !== "posts" && activeTab !== "sobre" && !visibleTabs.find(t => t.id === activeTab)) setActiveTab("posts");
  }, [canSeeFollowers, canSeeFollowing, createdRooms.length]);

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
      <DialogContent
        showCloseButton={false}
        // BUG-FIX: com o PhotoViewer aberto, Esc não deve fechar o
        // perfil inteiro — só a foto (o PhotoViewer já trata Esc sozinho).
        onEscapeKeyDown={(e) => {
          if (viewerOpen) e.preventDefault();
        }}
        className={
          "p-0 gap-0 overflow-hidden bg-[#F9F8F6] border-0 shadow-2xl " +
          // fullscreen total — sobrescreve defaults do Dialog (centro/max-w)
          "!fixed !inset-0 !left-0 !top-0 !z-50 " +
          "!w-screen !h-[100dvh] !max-w-none !max-h-none " +
          // BUG-FIX: no Tailwind v4, `translate-x-*`/`translate-y-*` setam a
          // propriedade CSS `translate` (separada de `transform`). Zerar só
          // o `transform` (como na tentativa anterior) deixava o `translate:
          // -50% -50%` herdado do Dialog centralizado ainda ativo, empurrando
          // o modal inteiro pra fora da tela — só sobrava visível o
          // quadrante superior esquerdo, sem dar pra ver nem interagir.
          // Zerando as DUAS propriedades o modal realmente fica full-screen,
          // e também resolve o problema original: qualquer `transform`
          // OU `translate` diferente de "none" vira containing block dos
          // filhos com `position: fixed` (caso do PhotoViewer), o que
          // desalinhava a foto no celular.
          "!transform-none !translate-none !rounded-none " +
          "data-[state=open]:!zoom-in-100"
        }
      >
        <DialogTitle className="sr-only">Perfil do usuário</DialogTitle>
        <DialogDescription className="sr-only">Informações e ações do perfil selecionado.</DialogDescription>

        {/* Fechar — sempre visível no topo */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#1A1A1A]/85 text-white hover:bg-[#1A1A1A] transition-colors shadow-md"
          aria-label="Fechar perfil"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Menu de ações — canto superior ESQUERDO no celular (espelha o "Fechar",
            que fica no canto direito). No mobile o hero vira um layout de "blog
            pessoal" (nome em cima, foto em destaque, bio pequena), então as ações
            de seguir/mensagem/bloquear/denunciar saem de baixo da foto e viram
            este menu compacto, sempre visível mesmo com a página rolada. */}
        {!loading && userData && !isRestricted && !isOwnProfile && (
          <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-50 sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-10 rounded-xl p-0 bg-[#1A1A1A]/85 text-white ring-1 ring-inset ring-white/15 shadow-lg shadow-black/20 hover:bg-[#1A1A1A] hover:ring-white/25 active:scale-95 transition-all duration-200 data-[state=open]:bg-[#1A1A1A] data-[state=open]:ring-[#D96C4A]/60"
                  aria-label="Ações do perfil"
                >
                  <MenuIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl">
                {!isBlocked && (
                  <DropdownMenuItem onClick={handleFollowToggle} disabled={followLoading} className="gap-2">
                    {followLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : followData.isFollowing ? (
                      <UserMinus className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {followData.isFollowing
                      ? "Deixar de seguir"
                      : followData.isPending
                      ? "Solicitado"
                      : privacyInfo.approve_followers
                      ? "Solicitar"
                      : "Seguir"}
                  </DropdownMenuItem>
                )}
                {!isBlocked && (
                  <DropdownMenuItem onClick={handleStartDM} className="gap-2">
                    <MessageCircle className="h-4 w-4" /> Mensagem
                  </DropdownMenuItem>
                )}
                {privacyInfo.isBlockedByViewer ? (
                  <DropdownMenuItem onClick={handleBlockToggle} disabled={blockLoading} className="gap-2">
                    <ShieldBan className="h-4 w-4" /> Desbloquear
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleBlockToggle} disabled={blockLoading} className="gap-2 text-red-600">
                    <Ban className="h-4 w-4" /> Bloquear
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("openReport", {
                      detail: { type: "user", id: userId, name: userData.display_name },
                    }));
                  }}
                  className="gap-2"
                >
                  <Flag className="h-4 w-4" /> Denunciar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <ProfileEditorialStyles />

{loading ? (
          <div className="upd-blog h-[100dvh] p-8 pt-16 space-y-5 overflow-y-auto">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-full bg-black/5 animate-pulse" />
              <div className="space-y-2 flex-1 pb-1">
                <div className="h-7 w-40 rounded bg-black/5 animate-pulse" />
                <div className="h-3 w-28 rounded bg-black/5 animate-pulse" />
              </div>
            </div>
            <div className="h-4 w-3/4 rounded bg-black/5 animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-black/5 animate-pulse" />
          </div>
        ) : userData ? (
          <div className="upd-blog h-[100dvh] w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain" style={{WebkitOverflowScrolling: "touch"}}>
            {/* ═══════ HERO ═══════ */}
            <div className="relative">
              {/* ---- Perfil privado / bloqueado: layout centrado e limpo ---- */}
              {isRestricted ? (
                <div className="px-5 pt-16 sm:pt-10 pb-8 flex flex-col items-center text-center">
                  {/* Foto — tamanho fixo, centrada (mobile e desktop) */}
                  <div
                    className="relative h-36 w-36 sm:h-40 sm:w-40 shrink-0 rounded-2xl p-[4px] shadow-[0_8px_24px_rgba(26,26,26,0.14)]"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <div className="h-full w-full rounded-[14px] p-[3px] bg-[#F9F8F6]">
                      <div className="relative h-full w-full overflow-hidden rounded-xl bg-black/[0.04]">
                        <UserAvatar
                          user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                          className="h-full w-full rounded-xl text-3xl"
                        />
                        <div className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A]/85 text-white shadow-sm">
                          <Lock className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nome */}
                  <div
                    className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <h2
                      className="font-serif text-xl sm:text-2xl font-medium tracking-tight leading-tight break-words"
                      style={{ color: nameBand.text }}
                    >
                      {userData.display_name}
                    </h2>
                    {privacyInfo.is_private && !isBlocked && (
                      <Lock className="h-4 w-4 shrink-0 opacity-70" style={{ color: nameBand.text }} />
                    )}
                  </div>

                  <p className="mt-2 text-sm text-[#4A4A4A]/75">@{userData.username}</p>

                  {/* Aviso + CTA */}
                  <div className="mt-6 w-full max-w-sm rounded-2xl border border-black/[0.08] bg-white/80 px-5 py-6 shadow-sm">
                    <Lock className="h-7 w-7 text-[#4A4A4A]/35 mx-auto mb-2.5" />
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      {isBlocked
                        ? "Você não pode ver este perfil"
                        : "Este perfil é privado"}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#4A4A4A]/75">
                      {isBlocked
                        ? "O conteúdo e as conexões não estão disponíveis."
                        : "Siga para solicitar acesso às entradas, fotos e lista de seguidores."}
                    </p>
                    {!isBlocked && (
                      <div className="mt-4 flex flex-col items-center gap-2">
                        {renderFollowButton()}
                        {followData.isPending && (
                          <p className="text-[11px] text-[#4A4A4A]/55">Aguardando aprovação</p>
                        )}
                      </div>
                    )}
                    {!isOwnProfile && (
                      <div className="mt-4 pt-3 border-t border-black/[0.06] flex items-center justify-center gap-2">
                        {privacyInfo.isBlockedByViewer ? (
                          <Button size="sm" variant="outline" onClick={handleBlockToggle} disabled={blockLoading} className="rounded-full gap-1.5 text-xs">
                            <ShieldBan className="h-3.5 w-3.5" /> Desbloquear
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={handleBlockToggle} disabled={blockLoading} className="rounded-full gap-1.5 text-xs text-[#4A4A4A]">
                            <Ban className="h-3.5 w-3.5" /> Bloquear
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full gap-1.5 text-xs text-[#4A4A4A]"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("openReport", {
                              detail: { type: "user", id: userId, name: userData.display_name },
                            }));
                          }}
                        >
                          <Flag className="h-3.5 w-3.5" /> Denunciar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
              {/* ---- Mobile: hero estilo "blog pessoal" ---- */}
              <div className="sm:hidden px-5 pt-16 pb-6 text-center">
                {/* Foto + faixa do nome na mesma largura */}
                <div className="upd-hero-photo">
                  {/* Faixa colorida — largura total da foto */}
                  <div
                    className="flex w-full items-center justify-center gap-2 rounded-t-2xl px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <span
                      className="h-px w-6 shrink-0"
                      style={{ background: `linear-gradient(to right, transparent, ${nameBand.line})` }}
                      aria-hidden
                    />
                    <h2
                      className="font-serif text-[22px] font-medium tracking-tight leading-tight break-words min-w-0"
                      style={{ color: nameBand.text }}
                    >
                      {userData.display_name}
                    </h2>
                    {privacyInfo.is_private && (
                      <Lock className="h-4 w-4 shrink-0 opacity-70" style={{ color: nameBand.text }} />
                    )}
                    <span
                      className="h-px w-6 shrink-0"
                      style={{ background: `linear-gradient(to left, transparent, ${nameBand.line})` }}
                      aria-hidden
                    />
                  </div>

                  {/* Moldura — mesma cor da faixa */}
                  <div
                    className="relative aspect-square w-full p-[4px] shadow-xl transition-[background-color] duration-300"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <div className="h-full w-full rounded-[14px] p-[4px] bg-[#F9F8F6]">
                      <div className="relative h-full w-full overflow-hidden rounded-xl bg-black/[0.04]">
                        <UserAvatar
                          user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                          className="h-full w-full rounded-xl text-3xl"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Faixa do handle */}
                  <div
                    className="flex w-full items-center justify-center gap-1.5 rounded-b-2xl px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <span className="text-[12.5px] font-medium tracking-wide" style={{ color: nameBand.text }}>
                      @{userData.username}
                    </span>
                  </div>
                </div>

                {/* Bairro em chip */}
                {canSeeNeighborhood && userData.neighborhood && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-black/[0.03] px-2.5 py-0.5 text-xs text-[#4A4A4A]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {userData.neighborhood}
                    </span>
                  </div>
                )}

                {/* Cartão meta: tagline + contadores */}
                <div className="mt-4 mx-auto w-[min(90vw,calc(100vw-2.5rem))] max-w-[440px] text-center">
                  {userData.tagline && (
                    <p
                      className="text-[13px] leading-snug text-[#3A3A3A]/85 mb-3"
                      style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                    >
                      {parseInlineContent(userData.tagline, openUserProfileById)}
                    </p>
                  )}
                  <div
                    className="profile-stats-row divide-x divide-black/[0.06] rounded-xl border border-black/[0.06] bg-[#F9F8F6]/90"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTab("posts")}
                      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors hover:bg-black/[0.03]"
                    >
                      <span className="text-sm font-semibold tabular-nums text-[#1A1A1A]">{postCount}</span>
                      <span className="text-[9px] uppercase tracking-wide text-[#4A4A4A]/60">entradas</span>
                    </button>
                    {canSeeFollowing && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("following")}
                        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors hover:bg-black/[0.03]"
                      >
                        <span className="text-sm font-semibold tabular-nums text-[#1A1A1A]">{followData.followingCount}</span>
                        <span className="text-[9px] uppercase tracking-wide text-[#4A4A4A]/60">seguindo</span>
                      </button>
                    )}
                    {canSeeFollowers && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("followers")}
                        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors hover:bg-black/[0.03]"
                      >
                        <span className="text-sm font-semibold tabular-nums text-[#1A1A1A]">{followData.followersCount}</span>
                        <span className="text-[9px] uppercase tracking-wide text-[#4A4A4A]/60">seguidores</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ---- Tablet / desktop: layout horizontal ---- */}
              <div className="hidden sm:block px-6 pt-6 pb-5 relative min-w-0">
                <div className="flex items-end justify-between gap-3">
                  <div
                    className="relative h-24 w-24 shrink-0 rounded-xl p-[3px] shadow-[0_6px_18px_rgba(26,26,26,0.12)] transition-[background-color] duration-300"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <div className="h-full w-full rounded-[9px] p-[3px] bg-[#F9F8F6]">
                      <div className="relative h-full w-full overflow-hidden rounded-lg bg-black/[0.04]">
                        <UserAvatar
                          user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                          className="h-full w-full rounded-lg text-2xl"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 pb-1 flex-wrap justify-end max-w-[55%]">
                    {renderFollowButton()}
                    {!isOwnProfile && !isBlocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleStartDM}
                        className="rounded-full gap-1.5 border-black/15 text-[#1A1A1A] hover:bg-black/5"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Mensagem</span>
                      </Button>
                    )}
                    {!isOwnProfile && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 rounded-lg p-0 border-black/15 bg-white/80 text-[#4A4A4A] shadow-sm hover:border-black/25 hover:bg-black/5 hover:text-[#1A1A1A] active:scale-95 transition-all duration-200 data-[state=open]:bg-[#1A1A1A] data-[state=open]:border-[#1A1A1A] data-[state=open]:text-white"
                            aria-label="Mais ações"
                          >
                            <MenuIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          {privacyInfo.isBlockedByViewer ? (
                            <DropdownMenuItem onClick={handleBlockToggle} disabled={blockLoading} className="gap-2">
                              <ShieldBan className="h-4 w-4" /> Desbloquear
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={handleBlockToggle} disabled={blockLoading} className="gap-2 text-red-600">
                              <Ban className="h-4 w-4" /> Bloquear
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent("openReport", {
                                detail: { type: "user", id: userId, name: userData.display_name },
                              }));
                            }}
                            className="gap-2"
                          >
                            <Flag className="h-4 w-4" /> Denunciar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="mt-4 min-w-0">
                  <div
                    className="flex w-full max-w-xl items-center gap-2.5 rounded-xl px-3.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ backgroundColor: nameBand.bg }}
                  >
                    <span
                      className="h-px w-5 shrink-0"
                      style={{ background: `linear-gradient(to right, transparent, ${nameBand.line})` }}
                      aria-hidden
                    />
                    <h2
                      className="font-serif text-lg sm:text-xl md:text-2xl font-medium tracking-tight leading-tight break-words min-w-0"
                      style={{ color: nameBand.text }}
                    >
                      {userData.display_name}
                    </h2>
                    {privacyInfo.is_private && (
                      <Lock className="h-4 w-4 shrink-0 opacity-70" style={{ color: nameBand.text }} />
                    )}
                    <span
                      className="h-px flex-1 min-w-[1rem]"
                      style={{ background: `linear-gradient(to left, transparent, ${nameBand.line})` }}
                      aria-hidden
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-black/[0.08] bg-white/80 px-2.5 py-0.5 text-xs font-medium text-[#3A3A3A] shadow-sm">
                      @{userData.username}
                    </span>
                    {canSeeNeighborhood && userData.neighborhood && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] bg-black/[0.03] px-2.5 py-0.5 text-xs text-[#4A4A4A]">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {userData.neighborhood}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 max-w-xl overflow-hidden rounded-2xl border border-black/[0.07] bg-white/70 shadow-sm">
                  <div className="h-1 w-full" style={{ backgroundColor: nameBand.bg }} aria-hidden />
                  <div className="px-4 py-3.5 sm:px-5">
                    {userData.tagline && (
                      <p
                        className="text-base sm:text-[17px] leading-relaxed text-[#3A3A3A]"
                        style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                      >
                        {parseInlineContent(userData.tagline, openUserProfileById)}
                      </p>
                    )}
                    <div
                      className={`profile-stats-row divide-x divide-black/[0.06] rounded-xl border border-black/[0.06] bg-[#F9F8F6]/90 ${userData.tagline ? "mt-3" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveTab("posts")}
                        className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-3 transition-colors hover:bg-black/[0.03]"
                      >
                        <span className="text-base sm:text-lg font-semibold tabular-nums text-[#1A1A1A]">{postCount}</span>
                        <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#4A4A4A]/70">entradas</span>
                      </button>
                      {canSeeFollowing && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("following")}
                          className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-3 transition-colors hover:bg-black/[0.03]"
                        >
                          <span className="text-base sm:text-lg font-semibold tabular-nums text-[#1A1A1A]">{followData.followingCount}</span>
                          <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#4A4A4A]/70">seguindo</span>
                        </button>
                      )}
                      {canSeeFollowers && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("followers")}
                          className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-3 transition-colors hover:bg-black/[0.03]"
                        >
                          <span className="text-base sm:text-lg font-semibold tabular-nums text-[#1A1A1A]">{followData.followersCount}</span>
                          <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-[#4A4A4A]/70">seguidores</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
                </>
              )}
            </div>

            {/* ═══════ TABS — faixa colorida no título ativo ═══════ */}
            {!isRestricted && (
              <>
                <nav className="bg-[#F9F8F6] border-b border-black/[0.06] w-full max-w-full overflow-x-hidden">
                  <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-2" style={{WebkitOverflowScrolling: "touch"}}>
                    {visibleTabs.map((tab) => {
                      const active = activeTab === tab.id;
                      const label = tab.id === "posts" ? "Entradas" : tab.id === "sobre" ? "Sobre" : tab.label;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`relative shrink-0 rounded-xl px-3 sm:px-4 py-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-200
                            ${active
                              ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              : "border border-black/[0.08] bg-white/70 text-[#3A3A3A] shadow-sm hover:border-black/[0.14] hover:bg-white hover:text-[#1A1A1A] hover:shadow"}`}
                          style={
                            active
                              ? { backgroundColor: nameBand.bg, color: nameBand.text }
                              : undefined
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </nav>

                {/* ═══════ CONTEÚDO ═══════ */}
                <div className="px-3.5 sm:px-6 py-5 sm:py-6 min-w-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                  {/* Posts / Entradas */}
                  {activeTab === "posts" && (
                    postsLoading ? (
                      <div className="space-y-6">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="space-y-3 animate-pulse">
                            <div className="aspect-[16/10] rounded-sm bg-black/5" />
                            <div className="h-5 w-2/3 rounded bg-black/5" />
                            <div className="h-3 w-full rounded bg-black/5" />
                          </div>
                        ))}
                      </div>
                    ) : userPosts.length === 0 ? (
                      <div className="py-16 text-center">
                        <p className="font-serif text-lg text-[#4A4A4A]/50">Nenhuma entrada ainda</p>
                      </div>
                    ) : (
                      <>
                      <div className="space-y-10">
                        {userPosts.slice(0, postsVisibleCount).map((post: any, idx: number) => {
                          const postPhotos: string[] = post.image_urls?.length > 0
                            ? post.image_urls
                            : post.image_url
                              ? [post.image_url]
                              : [];
                          const hasPhotos = postPhotos.length > 0;
                          const hasVideo = !!post.video_url;
                          const hasAudio = !!post.audio_url;
                          const isTextOnly = !hasPhotos && !hasVideo && !hasAudio;
                          const hasPostStyle = post.post_style && typeof post.post_style === "object";

                          const htmlToLines = (html: string): string => {
                            return html
                              .replace(/<(h[1-6]|p|div|li|blockquote|br|hr)\b[^>]*>/gi, "\n")
                              .replace(/<\/(h[1-6]|p|div|li|blockquote)>/gi, "\n")
                              .replace(/<[^>]+>/g, " ")
                              .replace(/[ \t]+/g, " ")
                              .replace(/\n[ \t]+/g, "\n")
                              .replace(/\n{2,}/g, "\n")
                              .trim();
                          };

                          const getTitle = () => {
                            if (!post.content) return "Entrada";
                            const text = htmlToLines(post.content);
                            const first = (text.split("\n")[0] || text).trim();
                            return first.length > 70 ? first.slice(0, 70) + "…" : first || "Entrada";
                          };

                          const getExcerpt = () => {
                            if (!post.content) return "";
                            const text = htmlToLines(post.content);
                            const lines = text.split("\n").filter(Boolean);
                            const rest = (lines.length > 1 ? lines.slice(1) : lines).join(" ").trim();
                            return rest.length > 160 ? rest.slice(0, 160) + "…" : rest;
                          };

                          return (
                            <article
                              key={post.id}
                              className="upd-post-card group cursor-pointer"
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("audio") || target.closest("video")) return;
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
                              {hasPhotos && (
                                <div className="aspect-[16/10] overflow-hidden rounded-sm bg-black/5 mb-4">
                                  <img
                                    src={postPhotos[0]}
                                    alt=""
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPhotoViewer(postPhotos, 0);
                                    }}
                                  />
                                </div>
                              )}

                              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-[#4A4A4A]/80 mb-1.5">
                                <time>{timeAgo(post.created_at)}</time>
                                {post.expires_at && (
                                  <span className="inline-flex items-center gap-1 text-[#D96C4A]/80">
                                    <Clock className="h-3 w-3" />
                                    Expira
                                  </span>
                                )}
                              </div>

                              <h3 className="font-serif text-base sm:text-lg md:text-xl font-medium tracking-tight text-[#1A1A1A] group-hover:text-[#D96C4A] transition-colors leading-snug break-words">
                                {getTitle()}
                              </h3>

                              {!isTextOnly && (
                                <p className="mt-2 text-[#4A4A4A] leading-relaxed line-clamp-3 text-[14px]">
                                  {getExcerpt()}
                                </p>
                              )}

                              {isTextOnly && (
                                <div className="mt-3">
                                  <FormattedText
                                    className="text-[#4A4A4A] leading-relaxed text-[14px]"
                                    content={post.content}
                                    style={{
                                      fontFamily: hasPostStyle && post.post_style!.font ? `'${post.post_style!.font}', sans-serif` : undefined,
                                      fontWeight: hasPostStyle && post.post_style!.bold ? 700 : undefined,
                                      fontStyle: hasPostStyle && post.post_style!.italic ? "italic" : undefined,
                                      textAlign: hasPostStyle && post.post_style!.alignment ? post.post_style!.alignment : undefined,
                                    }}
                                  />
                                </div>
                              )}

                              {hasVideo && (
                                <div className="mt-3 rounded-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                  <VideoPlayer src={post.video_url} />
                                </div>
                              )}
                              {hasAudio && (
                                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                                  <AudioPlayer src={post.audio_url} />
                                </div>
                              )}

                              {post.shared_post && !Array.isArray(post.shared_post) && (post.shared_post as any).removed && (
                                <div className="mt-4 rounded-lg border border-black/10 bg-white/60 p-3">
                                  <div className="flex items-center gap-1.5 text-[11px] italic text-[#4A4A4A]/50">
                                    <Repeat2 className="h-3 w-3" />
                                    Post original removido
                                  </div>
                                </div>
                              )}

                              {post.shared_post && !Array.isArray(post.shared_post) && !(post.shared_post as any).removed && (
                                <div className="mt-4 rounded-lg border border-black/10 bg-white/60 p-3">
                                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wider text-[#4A4A4A]/70">
                                    <Repeat2 className="h-3 w-3" />
                                    Compartilhado de {post.shared_post.author?.display_name}
                                  </div>
                                  <FormattedText className="text-sm text-[#4A4A4A] line-clamp-3" content={post.shared_post.content} />
                                </div>
                              )}

                              {idx < Math.min(userPosts.length, postsVisibleCount) - 1 && (
                                <div className="mt-10 border-t border-black/[0.06]" />
                              )}
                            </article>
                          );
                        })}
                      </div>
                      {userPosts.length > postsVisibleCount && (
                        <div className="pt-4 pb-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setPostsVisibleCount((n) => n + 8)}
                            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-black/[0.03] transition-colors"
                          >
                            Ver mais entradas ({userPosts.length - postsVisibleCount} restantes)
                          </button>
                        </div>
                      )}
                      </>
                    )
                  )}

                  {/* Sobre */}
                  {activeTab === "sobre" && (
                    <article className="pb-4 space-y-6">
                      {/* 1) Fotos em slide — primeiro */}
                      {!isRestricted ? (
                        <div className="w-full max-w-md mx-auto sm:mx-0">
                          <ProfileHeroSlider
                            user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                            photos={heroPhotos}
                            includeAvatar={false}
                            framed
                            frameColor={nameBand.bg}
                            className="aspect-[4/5] w-full max-h-[min(70vh,480px)]"
                          />
                        </div>
                      ) : (
                        <div className="rounded-2xl border-[3px] border-[#1A1A1A]/15 bg-black/[0.03] py-12 flex flex-col items-center justify-center gap-2">
                          <Lock className="h-8 w-8 text-[#4A4A4A]/25" />
                          <p className="text-sm text-[#4A4A4A]/50">Álbum indisponível</p>
                        </div>
                      )}

                      {/* 2) Bio logo abaixo */}
                      <div className="flex flex-col min-w-0 w-full">
                        {/* Faixa Sobre — nome + profissão/adjetivo opcional */}
                        <div
                          className="mb-3 flex w-full max-w-2xl flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          style={{ backgroundColor: nameBand.bg }}
                        >
                          <span
                            className="hidden sm:block h-px w-5 shrink-0"
                            style={{ background: `linear-gradient(to right, transparent, ${nameBand.line})` }}
                            aria-hidden
                          />
                          <h3
                            className="font-serif text-xl sm:text-2xl font-medium tracking-tight leading-tight min-w-0"
                            style={{ color: nameBand.text }}
                          >
                            Sobre {userData.display_name?.split(" ")[0] || "este perfil"}
                            {userData.headline?.trim() ? (
                              <span className="font-normal opacity-90">
                                {" · "}
                                {userData.headline.trim()}
                              </span>
                            ) : null}
                          </h3>
                          <span
                            className="hidden sm:block h-px flex-1 min-w-[1rem]"
                            style={{ background: `linear-gradient(to left, transparent, ${nameBand.line})` }}
                            aria-hidden
                          />
                        </div>
                        {canSeeNeighborhood && userData.neighborhood && (
                          <p className="flex items-center gap-1.5 text-sm text-[#4A4A4A]/70 mb-5">
                            <MapPin className="h-3.5 w-3.5" />
                            {userData.neighborhood}
                          </p>
                        )}
                        {userData.bio ? (
                          <div className="space-y-4 max-w-2xl">
                            <p
                              className="text-lg sm:text-xl text-[#1A1A1A] leading-relaxed"
                              style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                            >
                              {parseInlineContent(userData.bio, openUserProfileById)}
                            </p>
                            <p className="text-[#4A4A4A] leading-relaxed text-[14px]">
                              Espaço pessoal de {userData.display_name} no Gente da Feira
                              {userData.neighborhood ? ` · ${userData.neighborhood}` : ""}.
                            </p>
                          </div>
                        ) : (
                          <p
                            className="text-lg sm:text-xl text-[#4A4A4A]/50 leading-relaxed max-w-2xl"
                            style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                          >
                            Este perfil ainda não escreveu uma apresentação.
                          </p>
                        )}

                        {/* Notas / blog interno em Sobre */}
                        {aboutPosts.length > 0 && (
                          <div className="mt-10 pt-6 border-t border-black/[0.06]">
                            <h4 className="font-serif text-base font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
                              Notas em Sobre
                            </h4>
                            <ul className="space-y-3">
                              {aboutPosts.map((post: any) => {
                                const htmlToLines = (html: string) =>
                                  (html || "")
                                    .replace(/<(h[1-6]|p|div|li|blockquote|br|hr)\b[^>]*>/gi, "\n")
                                    .replace(/<\/(h[1-6]|p|div|li|blockquote)>/gi, "\n")
                                    .replace(/<[^>]+>/g, " ")
                                    .replace(/[ \t]+/g, " ")
                                    .replace(/\n[ \t]+/g, "\n")
                                    .replace(/\n{2,}/g, "\n")
                                    .trim();
                                const lines = htmlToLines(post.content || "");
                                const title = lines.split("\n")[0]?.trim() || "Sem título";
                                const excerpt = lines.split("\n").slice(1).join(" ").trim().slice(0, 140);
                                return (
                                  <li key={post.id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const postWithAuthor = {
                                          ...post,
                                          author: post.author || {
                                            id: userId,
                                            display_name: userData.display_name,
                                            username: userData.username,
                                            avatar_url: userData.avatar_url,
                                          },
                                        };
                                        window.dispatchEvent(
                                          new CustomEvent("openPostDetail", { detail: { post: postWithAuthor } })
                                        );
                                      }}
                                      className="w-full text-left rounded-xl border border-black/[0.06] bg-white/80 p-3.5 hover:border-black/10 transition-all"
                                    >
                                      <h5 className="font-serif text-[15px] font-medium text-[#1A1A1A] leading-snug">
                                        {title}
                                      </h5>
                                      {excerpt && (
                                        <p className="mt-1 text-sm text-[#4A4A4A]/70 line-clamp-2">
                                          {excerpt}{excerpt.length >= 140 ? "…" : ""}
                                        </p>
                                      )}
                                      <p className="mt-1.5 text-[11px] text-[#4A4A4A]/45">
                                        {post.created_at
                                          ? new Date(post.created_at).toLocaleDateString("pt-BR", {
                                              day: "numeric",
                                              month: "short",
                                              year: "numeric",
                                            })
                                          : ""}
                                        {post.visibility === "followers" ? " · Só seguidores" : ""}
                                      </p>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            {aboutPostsHasMore && (
                              <div className="mt-3 flex justify-center">
                                <button
                                  type="button"
                                  onClick={loadMoreAboutPosts}
                                  disabled={aboutPostsLoadingMore}
                                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-black/[0.03] transition-colors disabled:opacity-60"
                                >
                                  {aboutPostsLoadingMore ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Carregando…
                                    </>
                                  ) : (
                                    "Carregar mais notas"
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <p className="mt-6 text-[11px] text-[#4A4A4A]/40">
                          @{userData.username}
                          {userData.created_at && (
                            <> · Entrou em {new Date(userData.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</>
                          )}
                        </p>
                      </div>
                    </article>
                  )}

                  {/* Salas */}
                  {activeTab === "salas" && (
                    <div>
                      {createdRoomsLoading && createdRooms.length === 0 ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-16 rounded-xl bg-black/[0.04] animate-pulse" />
                          ))}
                        </div>
                      ) : createdRooms.length === 0 ? (
                        <div className="py-12 text-center">
                          <MessageCircle className="h-8 w-8 text-black/10 mx-auto mb-2" />
                          <p className="text-sm text-[#4A4A4A]/60">Nenhuma sala criada</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {createdRooms.map((room: any) => (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => handleOpenCreatedRoom(room)}
                              className="flex items-center gap-3 w-full rounded-xl border border-black/[0.06] bg-white/60 px-3.5 py-3 text-left hover:bg-white hover:border-black/10 transition-colors"
                            >
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F3F1ED] text-xl">
                                {room.icon || "💬"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[#1A1A1A] truncate">{room.name}</div>
                                {room.description && (
                                  <div className="text-[12px] text-[#4A4A4A]/70 truncate">{room.description}</div>
                                )}
                                <div className="text-[11px] text-[#4A4A4A]/50 mt-0.5">
                                  {room.memberCount || 0} membro{room.memberCount === 1 ? "" : "s"}
                                  {room.is_open === false && " · Fechada"}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-[#4A4A4A]/30 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seguidores */}
                  {activeTab === "followers" && (
                    listLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex items-center gap-3 animate-pulse py-1">
                            <div className="h-10 w-10 rounded-full bg-black/5" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 w-28 rounded bg-black/5" />
                              <div className="h-2.5 w-20 rounded bg-black/5" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : followList.length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="h-8 w-8 text-black/10 mx-auto mb-2" />
                        <p className="text-sm text-[#4A4A4A]/60">Nenhum seguidor</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {followList.map((u: any) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              onOpenChange(false);
                              setTimeout(() => openUserProfileById(u.id), 150);
                            }}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 w-full text-left hover:bg-black/[0.03] transition-colors"
                          >
                            <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-10 w-10" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate text-[#1A1A1A]">{u.display_name}</div>
                              <div className="text-[11px] text-[#4A4A4A]/60 truncate">@{u.username}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  )}

                  {/* Seguindo */}
                  {activeTab === "following" && (
                    listLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex items-center gap-3 animate-pulse py-1">
                            <div className="h-10 w-10 rounded-full bg-black/5" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 w-28 rounded bg-black/5" />
                              <div className="h-2.5 w-20 rounded bg-black/5" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : followList.length === 0 ? (
                      <div className="py-12 text-center">
                        <Users className="h-8 w-8 text-black/10 mx-auto mb-2" />
                        <p className="text-sm text-[#4A4A4A]/60">Não segue ninguém</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {followList.map((u: any) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              onOpenChange(false);
                              setTimeout(() => openUserProfileById(u.id), 150);
                            }}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 w-full text-left hover:bg-black/[0.03] transition-colors"
                          >
                            <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-10 w-10" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate text-[#1A1A1A]">{u.display_name}</div>
                              <div className="text-[11px] text-[#4A4A4A]/60 truncate">@{u.username}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  )}

                </div>
              </>
            )}
          </div>
        ) : (
          <div className="upd-blog p-8 text-center">
            <p className="text-sm text-[#4A4A4A]/60">Usuário não encontrado</p>
          </div>
        )}

        {/*
          BUG-FIX: o PhotoViewer precisa ficar DENTRO do DialogContent.
          Quando ele era renderizado como irmão do DialogContent (fora da
          árvore do Content), o Radix Dialog tratava cliques nos botões do
          viewer (fechar, seta anterior/próxima) como "clique fora do
          modal" e disparava o fechamento de todo o perfil antes do
          onClick do próprio botão rodar — por isso os botões pareciam não
          fazer nada. Como o DialogContent aqui já ocupa a tela inteira
          (!fixed !inset-0 !w-screen !h-[100dvh]), mover o viewer para
          dentro não muda o visual (o "fixed inset-0" dele continua
          cobrindo 100% da tela).
        */}
        {viewerOpen && viewerPhotos.length > 0 && (
          <PhotoViewer photos={viewerPhotos} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
