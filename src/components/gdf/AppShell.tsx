"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import { AuthForm } from "@/components/gdf/AuthForm";
import { FeedView } from "@/components/gdf/FeedView";
import { DeletionPendingView } from "@/components/gdf/DeletionPendingView";
import { createClient } from "@/lib/supabase/client";
import { Home, Users, MessageSquare, Compass, User, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

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
const PROFILE_SAFE_SELECT = "id,username,display_name,avatar_url,bio,neighborhood,theme,is_private,hide_following,hide_followers,hide_neighborhood,approve_followers,created_at,updated_at,deletion_requested_at,deletion_scheduled_at,is_moderator";

export function AppShell() {
  const { profile, tab, setTab, profileSubView, selectedRoom, selectedDM, setSelectedRoom, setSelectedDM, setProfile, logout, setDeletionPending, reportTarget } = useStore();
  const [checkedAuth, setCheckedAuth] = useState(false);
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

  if (!profile) return <AuthForm />;

  // SEC-013: Conta com exclusão pendente — mostrar tela de recuperação
  if (profile.deletion_requested_at) {
    return <DeletionPendingView />;
  }

  const inChat = (tab === "rooms" && selectedRoom) || (tab === "dms" && selectedDM);

  const renderProfileContent = () => {
    if (profileSubView === "settings") return <SettingsView />;
    if (profileSubView === "album") return <AlbumView />;
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

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Banner offline ─────────────────────────────────── */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-400 py-1.5 text-xs font-medium text-amber-900">
          <WifiOff className="h-3.5 w-3.5" />
          Sem conexão — você está offline
        </div>
      )}

      {/* ── Header desktop ─────────────────────────────────── */}
      <header
        className={cn(
          "sticky z-40 hidden md:flex items-center justify-between border-b border-primary/10 px-6 py-2.5 bg-background/90 backdrop-blur-xl",
          !isOnline ? "top-7" : "top-0"
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
      <main className={cn("flex-1 pb-20 md:pb-6", !isOnline && "mt-7 md:mt-0")}>
        <div className={cn("mx-auto px-4 py-4 md:py-6", inChat ? "max-w-2xl" : "max-w-lg")}>
          <div
            key={transitionKey}
            className="animate-tab-in"
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

      {/* ── Nav mobile ─────────────────────────────────────── */}
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
    </div>
  );
}
