"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, UserPlus, UserMinus, MessageCircle, Users, Lock, Loader2, Clock, Menu as MenuIcon, Ban, ShieldBan, Play, Pause, Video, Mic, X, Repeat2, Flag } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { ProfileHeroSlider } from "./ProfileHeroSlider";
import { PhotoViewer } from "./PhotoViewer";
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
  const [activeTab, setActiveTab] = useState<"posts" | "followers" | "following" | "sobre">("posts");
  const [followList, setFollowList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  // Fotos do álbum, exibidas junto com a foto de perfil no slide do hero
  // (a antiga aba "Fotografia"/"Álbum" foi removida).
  const [heroPhotos, setHeroPhotos] = useState<string[]>([]);
  const [postsVisibleCount, setPostsVisibleCount] = useState(8);

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
    setHeroPhotos([]);
    setFollowList([]);
    setViewerOpen(false);

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

  const visibleTabs: Array<{ id: "posts" | "followers" | "following" | "sobre"; label: string }> = [
    { id: "posts", label: "Posts" },
    { id: "sobre", label: "Sobre" },
  ];
  if (canSeeFollowers) visibleTabs.push({ id: "followers", label: "Seguidores" });
  if (canSeeFollowing) visibleTabs.push({ id: "following", label: "Seguindo" });

  useEffect(() => {
    if (activeTab !== "posts" && activeTab !== "sobre" && !visibleTabs.find(t => t.id === activeTab)) setActiveTab("posts");
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
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#1A1A1A]/80 text-white backdrop-blur-sm hover:bg-[#1A1A1A] transition-colors shadow-md"
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
                  className="h-10 w-10 rounded-xl p-0 bg-[#1A1A1A]/80 text-white backdrop-blur-md ring-1 ring-inset ring-white/15 shadow-lg shadow-black/20 hover:bg-[#1A1A1A] hover:ring-white/25 active:scale-95 transition-all duration-200 data-[state=open]:bg-[#1A1A1A] data-[state=open]:ring-[#D96C4A]/60"
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

        <style>{`
          .upd-blog {
            font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
            --paper: #F9F8F6;
            --ink: #1A1A1A;
            --ink-light: #4A4A4A;
            --accent: #D96C4A;
            contain: layout style;
          }
          .upd-blog .font-serif {
            font-family: "Playfair Display", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          }
          .upd-blog .post-content a { color: #0A4D5C; text-decoration: underline; text-underline-offset: 2px; }
          .upd-blog .post-content a:hover { color: #D96C4A; }
          .upd-post-card {
            content-visibility: auto;
            contain-intrinsic-size: 280px;
          }
        `}</style>

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
              {/* ---- Mobile: hero estilo "blog pessoal" — inspirado nos templates
                  Wix de blog pessoal: nome no topo, foto em grande destaque logo
                  abaixo, username, e uma bio pequena centralizada antes das entradas.
                  As ações (seguir/mensagem/bloquear) ficam no menu do canto
                  superior esquerdo, não competindo com a foto. ---- */}
              <div className="sm:hidden px-5 pt-16 pb-6 text-center">
                <div className="flex items-center justify-center gap-2 flex-wrap min-w-0">
                  <h2 className="font-serif text-[26px] font-medium tracking-tight text-[#1A1A1A] leading-tight break-words">
                    {userData.display_name}
                  </h2>
                  {privacyInfo.is_private && <Lock className="h-4 w-4 shrink-0 text-[#4A4A4A]/60" />}
                </div>

                <div className="mt-5 flex justify-center">
                  <ProfileHeroSlider
                    user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                    photos={isRestricted ? [] : heroPhotos}
                    className="h-[min(90vw,calc(100vw-2.5rem))] w-[min(90vw,calc(100vw-2.5rem))] max-h-[440px] max-w-[440px] ring-8 ring-[#F9F8F6] shadow-xl"
                    overlay={
                      (isRestricted || isBlocked) && (
                        <div className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A]/80 text-white">
                          <Lock className="h-4 w-4" />
                        </div>
                      )
                    }
                  />
                </div>

                <p className="mt-4 text-sm text-[#4A4A4A]">
                  @{userData.username}
                  {canSeeNeighborhood && userData.neighborhood && (
                    <span className="inline-flex items-center gap-1 ml-2.5">
                      <MapPin className="h-3 w-3" />
                      {userData.neighborhood}
                    </span>
                  )}
                </p>

                {userData.bio && !isRestricted && (
                  <p
                    className="mt-3 text-[15px] leading-relaxed text-[#4A4A4A] max-w-sm mx-auto"
                    style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                  >
                    {parseInlineContent(userData.bio, openUserProfileById)}
                  </p>
                )}

                {!isRestricted && (
                  <div className="mt-5 flex justify-center items-center gap-5 text-sm">
                    <div>
                      <span className="font-semibold text-[#1A1A1A]">{postCount}</span>
                      <span className="text-[#4A4A4A] ml-1.5">entradas</span>
                    </div>
                    {canSeeFollowing && (
                      <button
                        onClick={() => setActiveTab("following")}
                        className="hover:text-[#D96C4A] transition-colors"
                      >
                        <span className="font-semibold text-[#1A1A1A]">{followData.followingCount}</span>
                        <span className="text-[#4A4A4A] ml-1.5">seguindo</span>
                      </button>
                    )}
                    {canSeeFollowers && (
                      <button
                        onClick={() => setActiveTab("followers")}
                        className="hover:text-[#D96C4A] transition-colors"
                      >
                        <span className="font-semibold text-[#1A1A1A]">{followData.followersCount}</span>
                        <span className="text-[#4A4A4A] ml-1.5">seguidores</span>
                      </button>
                    )}
                  </div>
                )}

                {isRestricted && (
                  <div className="mt-6 rounded-xl border border-black/10 bg-white/60 px-4 py-5 text-center">
                    <Lock className="h-8 w-8 text-[#4A4A4A]/30 mx-auto mb-2" />
                    <p className="text-sm text-[#4A4A4A]">
                      {isBlocked
                        ? "Você não pode ver este perfil"
                        : "Este perfil é privado"}
                    </p>
                    {!isBlocked && !followData.isFollowing && !followData.isPending && (
                      <div className="mt-3 flex justify-center">{renderFollowButton()}</div>
                    )}
                  </div>
                )}
              </div>

              {/* ---- Tablet / desktop: layout horizontal original (avatar + ações lado a lado) ---- */}
              <div className="hidden sm:block px-6 pt-6 pb-5 relative min-w-0">
                <div className="flex items-end justify-between gap-3">
                  <ProfileHeroSlider
                    user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                    photos={isRestricted ? [] : heroPhotos}
                    className="h-20 w-20 sm:h-24 sm:w-24 ring-[5px] ring-[#F9F8F6] shadow-md"
                    overlay={
                      (isRestricted || isBlocked) && (
                        <div className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A]/80 text-white">
                          <Lock className="h-3.5 w-3.5" />
                        </div>
                      )
                    }
                  />

                  {/* Actions */}
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

                <div className="mt-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-serif text-lg sm:text-xl md:text-2xl font-medium tracking-tight text-[#1A1A1A] leading-tight break-words min-w-0">
                      {userData.display_name}
                    </h2>
                    {privacyInfo.is_private && <Lock className="h-4 w-4 text-[#4A4A4A]/60" />}
                  </div>
                  <p className="text-sm text-[#4A4A4A] mt-1">
                    @{userData.username}
                    {canSeeNeighborhood && userData.neighborhood && (
                      <span className="inline-flex items-center gap-1 ml-2.5">
                        <MapPin className="h-3 w-3" />
                        {userData.neighborhood}
                      </span>
                    )}
                  </p>
                </div>

                {/* Bio – serif clássica neutra */}
                {userData.bio && !isRestricted && (
                  <p
                    className="mt-4 text-base sm:text-[17px] leading-relaxed text-[#4A4A4A] max-w-xl"
                    style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                  >
                    {parseInlineContent(userData.bio, openUserProfileById)}
                  </p>
                )}

                {/* Contadores */}
                {!isRestricted && (
                  <div className="mt-5 flex flex-wrap items-center gap-5 text-sm">
                    <div>
                      <span className="font-semibold text-[#1A1A1A]">{postCount}</span>
                      <span className="text-[#4A4A4A] ml-1.5">entradas</span>
                    </div>
                    {canSeeFollowing && (
                      <button
                        onClick={() => setActiveTab("following")}
                        className="hover:text-[#D96C4A] transition-colors"
                      >
                        <span className="font-semibold text-[#1A1A1A]">{followData.followingCount}</span>
                        <span className="text-[#4A4A4A] ml-1.5">seguindo</span>
                      </button>
                    )}
                    {canSeeFollowers && (
                      <button
                        onClick={() => setActiveTab("followers")}
                        className="hover:text-[#D96C4A] transition-colors"
                      >
                        <span className="font-semibold text-[#1A1A1A]">{followData.followersCount}</span>
                        <span className="text-[#4A4A4A] ml-1.5">seguidores</span>
                      </button>
                    )}
                  </div>
                )}

                {isRestricted && (
                  <div className="mt-6 rounded-xl border border-black/10 bg-white/60 px-4 py-5 text-center">
                    <Lock className="h-8 w-8 text-[#4A4A4A]/30 mx-auto mb-2" />
                    <p className="text-sm text-[#4A4A4A]">
                      {isBlocked
                        ? "Você não pode ver este perfil"
                        : "Este perfil é privado"}
                    </p>
                    {!isBlocked && !followData.isFollowing && !followData.isPending && (
                      <div className="mt-3">{renderFollowButton()}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ═══════ TABS ═══════ */}
            {!isRestricted && (
              <>
                <nav className="bg-[#F9F8F6] border-b border-black/[0.06] w-full max-w-full overflow-x-hidden">
                  <div className="flex gap-0 overflow-x-auto overscroll-x-contain px-1" style={{WebkitOverflowScrolling: "touch"}}>
                    {visibleTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors
                          ${activeTab === tab.id
                            ? "text-[#1A1A1A]"
                            : "text-[#4A4A4A]/70 hover:text-[#1A1A1A]"}`}
                      >
                        {tab.id === "posts" ? "Entradas" : tab.id === "sobre" ? "Sobre" : tab.label}
                        {activeTab === tab.id && (
                          <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D96C4A] rounded-full" />
                        )}
                      </button>
                    ))}
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

                          const getTitle = () => {
                            if (!post.content) return "Entrada";
                            const text = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                            const first = text.split("\n")[0] || text;
                            return first.length > 70 ? first.slice(0, 70) + "…" : first || "Entrada";
                          };

                          const getExcerpt = () => {
                            if (!post.content) return "";
                            const text = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                            return text.length > 160 ? text.slice(0, 160) + "…" : text;
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

                              {post.shared_post && !Array.isArray(post.shared_post) && (
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
                    <article className="pb-4">
                      <div className="flex flex-col sm:flex-row gap-5 sm:gap-8 items-start min-w-0 w-full">
                        <div className="w-full sm:w-[40%] shrink-0">
                          <div className="aspect-[4/5] overflow-hidden rounded-sm bg-black/5">
                            {userData.avatar_url ? (
                              <img
                                src={userData.avatar_url}
                                alt={userData.display_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0A4D5C]/10 to-[#D96C4A]/10">
                                <UserAvatar
                                  user={{ id: userId!, display_name: userData.display_name, avatar_url: userData.avatar_url }}
                                  className="h-24 w-24"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-full sm:w-[60%] flex flex-col">
                          <h3 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-[#1A1A1A] mb-2">
                            Sobre {userData.display_name?.split(" ")[0] || "este perfil"}
                          </h3>
                          {canSeeNeighborhood && userData.neighborhood && (
                            <p className="flex items-center gap-1.5 text-sm text-[#4A4A4A]/70 mb-5">
                              <MapPin className="h-3.5 w-3.5" />
                              {userData.neighborhood}
                            </p>
                          )}
                          {userData.bio ? (
                            <div className="space-y-4">
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
                              className="text-lg sm:text-xl text-[#4A4A4A]/50 leading-relaxed"
                              style={{ fontFamily: 'Georgia, "Times New Roman", Times, ui-serif, serif' }}
                            >
                              Este perfil ainda não escreveu uma apresentação.
                            </p>
                          )}
                          <p className="mt-8 text-[11px] text-[#4A4A4A]/40">
                            @{userData.username}
                            {userData.created_at && (
                              <> · Entrou em {new Date(userData.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</>
                            )}
                          </p>
                        </div>
                      </div>
                    </article>
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

                  <p className="mt-8 text-[11px] text-[#4A4A4A]/40 text-center">
                    Entrou em {new Date(userData.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                  </p>
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
