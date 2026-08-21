"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import { AuthForm } from "@/components/gdf/AuthForm";
import { FeedView } from "@/components/gdf/FeedView";
import { DeletionPendingView } from "@/components/gdf/DeletionPendingView";
import { createClient } from "@/lib/supabase/client";
import { Home, Users, MessageSquare, Compass, User, Loader2, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

const HIDDEN_BANNERS_KEY = "gdf_hidden_banners";

function getHiddenBannerIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_BANNERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hideBannerId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getHiddenBannerIds();
    if (!current.includes(id)) {
      localStorage.setItem(HIDDEN_BANNERS_KEY, JSON.stringify([...current, id]));
    }
  } catch {
    /* ignore */
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERF-002: Lazy-loaded views — chunks carregados sob demanda por tab/ação.
// FeedView permanece eager pois é a tab padrão (first contentful paint).
// ═══════════════════════════════════════════════════════════════════════════════

const RoomsView = dynamic(
  () => import("@/components/gdf/RoomsView").then((m) => ({ default: m.RoomsView })),
  { loading: () => <TabSkeleton /> }
);

const DMsView = dynamic(
  () => import("@/components/gdf/DMsView").then((m) => ({ default: m.DMsView })),
  { loading: () => <TabSkeleton /> }
);

const DiscoverView = dynamic(
  () => import("@/components/gdf/DiscoverView").then((m) => ({ default: m.DiscoverView })),
  { loading: () => <TabSkeleton /> }
);

const ProfileView = dynamic(
  () => import("@/components/gdf/ProfileView").then((m) => ({ default: m.ProfileView })),
  { loading: () => <TabSkeleton /> }
);

// PERF-002: Profile sub-views — carregados ao navegar dentro da tab perfil
const SettingsView = dynamic(
  () => import("@/components/gdf/SettingsView").then((m) => ({ default: m.SettingsView })),
  { loading: () => <TabSkeleton /> }
);

const AlbumView = dynamic(
  () => import("@/components/gdf/AlbumView").then((m) => ({ default: m.AlbumView })),
  { loading: () => <TabSkeleton /> }
);

// PERF-002: Admin-only — chunk NUNCA baixado para usuários comuns
const AdminReportsView = dynamic(
  () => import("@/components/gdf/AdminReportsView").then((m) => ({ default: m.AdminReportsView })),
  { loading: () => <TabSkeleton /> }
);

// PERF-002: Dialogs — carregados apenas quando abertos pelo usuário
const UserProfileDialog = dynamic(
  () => import("@/components/gdf/UserProfileDialog").then((m) => ({ default: m.UserProfileDialog })),
  { loading: () => null }
);

const PostDetailDialog = dynamic(
  () => import("@/components/gdf/PostDetailDialog").then((m) => ({ default: m.PostDetailDialog })),
  { loading: () => null }
);

const ReportDialog = dynamic(
  () => import("@/components/gdf/ReportDialog").then((m) => ({ default: m.ReportDialog })),
  { loading: () => null }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Skeleton loader — exibido brevemente enquanto o chunk da view carrega
// ═══════════════════════════════════════════════════════════════════════════════

function TabSkeleton() {
  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex gap-2">
              <div className="h-3 w-12 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab configuration
// ═══════════════════════════════════════════════════════════════════════════════

const tabs = [
  { id: "feed"     as const, icon: Home,          label: "Feed"      },
  { id: "rooms"    as const, icon: Users,         label: "Salas"     },
  { id: "dms"      as const, icon: MessageSquare, label: "Mensagens" },
  { id: "discover" as const, icon: Compass,       label: "Descobrir" },
  { id: "profile"  as const, icon: User,          label: "Perfil"    },
];

// SEC-003: Colunas seguras do perfil (mesma lista do backend)
// SEC-013: Inclui deletion_requested_at e deletion_scheduled_at para LGPD
// UX-024: Inclui is_moderator para exibir o acesso ao painel de moderação
// Moderação global: is_banned / is_suspended
const PROFILE_SAFE_SELECT = "id,username,display_name,avatar_url,bio,neighborhood,theme,is_private,hide_following,hide_followers,hide_neighborhood,approve_followers,created_at,updated_at,deletion_requested_at,deletion_scheduled_at,is_moderator,is_banned,banned_reason,is_suspended,suspended_until,suspend_reason";

export function AppShell() {
  const { profile, tab, setTab, profileSubView, selectedRoom, selectedDM, setSelectedRoom, setSelectedDM, setProfile, logout, setDeletionPending, reportTarget } = useStore();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [moderationBlock, setModerationBlock] = useState<null | {
    kind: "banned" | "suspended";
    reason?: string | null;
    until?: string | null;
  }>(null);
  const [profileDialogUserId, setProfileDialogUserId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [postDetailPost, setPostDetailPost] = useState<any>(null);
  const [postDetailOpen, setPostDetailOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  // PERF-002: CSS transition key instead of framer-motion for tab switching
  const [transitionKey, setTransitionKey] = useState("feed");
  const [isPending, startTransition] = useTransition();

  // Banner do admin (mensagem para todos)
  const [adminBanner, setAdminBanner] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [bannerHidden, setBannerHidden] = useState(false);

  // ── Online/offline listener ──────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── Custom events ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      const userId = e.detail?.userId;
      if (userId) {
        setProfileDialogUserId(userId);
        setProfileDialogOpen(true);
      }
    };
    window.addEventListener("openUserProfile", handler);
    return () => window.removeEventListener("openUserProfile", handler);
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const post = e.detail?.post;
      if (post) {
        setPostDetailPost(post);
        setPostDetailOpen(true);
      }
    };
    window.addEventListener("openPostDetail", handler);
    return () => window.removeEventListener("openPostDetail", handler);
  }, []);

  const openUserProfile = useCallback((userId: string) => {
    setProfileDialogUserId(userId);
    setProfileDialogOpen(true);
  }, []);

  // ── Auth ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const initAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // SEC-003: Select explícito — nunca SELECT *
        const { data: prof } = await supabase.from("profiles").select(PROFILE_SAFE_SELECT).eq("id", user.id).single();
        if (prof) {
          // Ban global — mostra aviso e encerra sessão
          if (prof.is_banned) {
            setModerationBlock({
              kind: "banned",
              reason: prof.banned_reason || null,
            });
            await supabase.auth.signOut();
            logout();
            setCheckedAuth(true);
            return;
          }
          // Suspensão ativa — mostra prazo/motivo e encerra sessão
          if (prof.is_suspended) {
            const until = prof.suspended_until
              ? new Date(prof.suspended_until)
              : null;
            if (!until || until > new Date()) {
              setModerationBlock({
                kind: "suspended",
                reason: prof.suspend_reason || null,
                until: prof.suspended_until || null,
              });
              await supabase.auth.signOut();
              logout();
              setCheckedAuth(true);
              return;
            }
          }
          setModerationBlock(null);
          setProfile(prof);
          // SEC-013: Detectar conta com exclusão pendente (LGPD)
          if (prof.deletion_requested_at) {
            setDeletionPending(true);
          }
        }
      }
      setCheckedAuth(true);
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        try { await supabase.removeAllChannels(); } catch { /* silent */ }
        logout();
      }
    });
    return () => subscription.unsubscribe();
  }, [setProfile, logout, setDeletionPending]);

  // ── Notificações não lidas ───────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const fetchUnread = () => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((data) => {
          if (typeof data.unreadCount === "number") {
            useStore.getState().setUnreadNotifications(data.unreadCount);
          }
        })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [profile]);

  // ── Banner do admin ──────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const loadBanner = () => {
      fetch("/api/banners")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.banner?.id) {
            if (!cancelled) {
              setAdminBanner(null);
              setBannerHidden(false);
            }
            return;
          }
          const hidden = getHiddenBannerIds();
          setAdminBanner({ id: data.banner.id, message: data.banner.message });
          setBannerHidden(hidden.includes(data.banner.id));
        })
        .catch(() => {
          if (!cancelled) {
            setAdminBanner(null);
            setBannerHidden(false);
          }
        });
    };
    loadBanner();
    // Revalida a cada 2 min (admin pode ter apagado ou enviado novo)
    const interval = setInterval(loadBanner, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

  const handleHideBanner = () => {
    if (!adminBanner) return;
    hideBannerId(adminBanner.id);
    setBannerHidden(true);
  };

  // ── Loading ──────────────────────────────────────────────
  if (!checkedAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary animate-pulse shadow-md">
            <span className="text-xl font-bold text-primary-foreground">GF</span>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
            <p className="text-sm text-primary/40">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  // Conta banida ou suspensa — aviso antes do login
  if (moderationBlock) {
    const isBan = moderationBlock.kind === "banned";
    const untilLabel = moderationBlock.until
      ? new Date(moderationBlock.until).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
              isBan ? "bg-red-500/10" : "bg-amber-500/10"
            }`}
          >
            <span className="text-3xl">{isBan ? "🚫" : "⏸️"}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {isBan ? "Conta banida" : "Conta suspensa"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isBan
              ? "Sua conta foi banida pela moderação do Gente da Feira e não pode mais ser usada."
              : "Sua conta está temporariamente suspensa e não pode acessar o app neste momento."}
          </p>
          {untilLabel && (
            <p className="text-sm font-medium">
              Até: <span className="text-foreground">{untilLabel}</span>
            </p>
          )}
          {moderationBlock.reason && (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                Motivo
              </p>
              <p className="text-sm whitespace-pre-wrap">{moderationBlock.reason}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setModerationBlock(null)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return <AuthForm />;

  // SEC-013: Conta com exclusão pendente — mostrar tela de recuperação
  if (profile.deletion_requested_at) {
    return <DeletionPendingView />;
  }

  const inChat = (tab === "rooms" && selectedRoom) || (tab === "dms" && selectedDM);

  const renderProfileContent = () => {
    if (profileSubView === "settings") return <SettingsView />;
    // Light / Free: álbum desabilitado no beta
    // if (profileSubView === "album") return <AlbumView />;
    // UX-024: Painel de moderação — só acessível se profile.is_moderator,
    // mas o AdminReportsView também revalida no servidor (RLS + API 403).
    if (profileSubView === "moderation" && profile.is_moderator) return <AdminReportsView />;
    return <ProfileView />;
  };

  const handleTabClick = (id: typeof tabs[number]["id"]) => {
    if (id === "rooms") setSelectedRoom(null);
    if (id === "dms") setSelectedDM(null);
    if (id === "profile") useStore.getState().setProfileSubView("profile");
    startTransition(() => {
      setTab(id);
      setTransitionKey(inChat ? `${id}-chat` : id);
    });
  };

  const showAdminBanner = !!adminBanner && !bannerHidden;
  // Altura aproximada dos banners fixos no topo (para offset do header/main)
  const topOffsetClass =
    !isOnline && showAdminBanner
      ? "top-14"
      : !isOnline || showAdminBanner
        ? "top-7"
        : "top-0";
  const mainOffsetClass =
    !isOnline && showAdminBanner
      ? "mt-14 md:mt-0"
      : !isOnline || showAdminBanner
        ? "mt-7 md:mt-0"
        : "";

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        inChat ? "h-[100dvh] min-h-0 overflow-hidden" : "min-h-screen"
      )}
    >

      {/* ── Banner offline ─────────────────────────────────── */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-400 py-1.5 text-xs font-medium text-amber-900">
          <WifiOff className="h-3.5 w-3.5" />
          Sem conexão — você está offline
        </div>
      )}

      {/* ── Banner do admin ────────────────────────────────── */}
      {showAdminBanner && (
        <div
          className={cn(
            "fixed left-0 right-0 z-50 flex items-start gap-2 bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm",
            !isOnline ? "top-7" : "top-0"
          )}
        >
          <p className="flex-1 text-center leading-snug whitespace-pre-wrap break-words">
            {adminBanner.message}
          </p>
          <button
            type="button"
            onClick={handleHideBanner}
            className="shrink-0 rounded-md p-1 hover:bg-primary-foreground/15 active:scale-95"
            title="Esconder"
            aria-label="Esconder banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Header desktop (oculto durante chat em tela cheia) ── */}
      <header
        className={cn(
          "sticky z-40 items-center justify-between border-b border-primary/10 px-6 py-2.5 bg-background/90 backdrop-blur-xl",
          inChat ? "hidden" : "hidden md:flex",
          topOffsetClass
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
            <span className="text-sm font-bold text-primary-foreground">GF</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-foreground">Gente da Feira</h1>
            <p className="text-[10px] text-primary/40 leading-none">Feira de Santana · BA</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-primary/[0.04] rounded-full p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-full px-3 py-2 transition-all duration-200",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-primary/50 hover:text-foreground"
              )}
              title={t.label}
            >
              <t.icon className="h-4 w-4" />
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-[#2EC4B6]/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">
              {profile?.display_name?.charAt(0)?.toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-medium text-foreground">{profile?.display_name || ""}</span>
        </div>
      </header>

      {/* ── Main content com transição CSS (sem framer-motion) ── */}
      <main
        className={cn(
          "flex-1 min-h-0",
          inChat
            ? "flex flex-col pb-0 overflow-hidden"
            : "pb-20 md:pb-6",
          !inChat && mainOffsetClass
        )}
      >
        <div
          className={cn(
            inChat
              ? "flex flex-1 flex-col min-h-0 w-full max-w-none h-[100dvh]"
              : cn("mx-auto px-4 py-4 md:py-6 max-w-lg", mainOffsetClass && "")
          )}
        >
          <div
            key={transitionKey}
            className={cn("animate-tab-in", inChat && "flex flex-1 flex-col min-h-0 h-full")}
          >
            {tab === "feed"     && <FeedView    openUserProfile={openUserProfile} />}
            {tab === "rooms"    && <RoomsView   openUserProfile={openUserProfile} />}
            {tab === "dms"      && <DMsView     openUserProfile={openUserProfile} />}
            {tab === "discover" && <DiscoverView openUserProfile={openUserProfile} />}
            {tab === "profile"  && renderProfileContent()}
          </div>
        </div>
      </main>

      {/* ── PERF-002: Dialogs — renderizados condicionalmente,
           chunks baixados apenas quando o usuário abre o dialog ── */}
      {profileDialogOpen && (
        <UserProfileDialog userId={profileDialogUserId} open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />
      )}
      {postDetailOpen && (
        <PostDetailDialog post={postDetailPost} open={postDetailOpen} onOpenChange={setPostDetailOpen} />
      )}
      {reportTarget && <ReportDialog />}

      {/* ── Nav mobile (oculto durante chat em tela cheia) ── */}
      {!inChat && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
          <div className="mx-3 mb-3 flex items-center justify-around rounded-2xl border border-primary/10 bg-background/95 backdrop-blur-xl shadow-lg px-1 py-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabClick(t.id)}
                className={cn(
                  "flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-all duration-200",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-primary/40 active:scale-95"
                )}
              >
                <t.icon className={cn("h-5 w-5", tab === t.id && "stroke-[2.5px]")} />
                <span className="text-[10px] font-medium leading-none">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
