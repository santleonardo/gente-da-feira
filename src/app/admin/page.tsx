"use client";

/**
 * Painel de moderação INDEPENDENTE do AppShell.
 * URL: /admin
 *
 * Acesso: login Supabase + profiles.is_moderator === true
 * Admin oficial: gentedafeira@gmail.com (promovido via SET_OFFICIAL_ADMIN.sql)
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  REPORT_CATEGORY_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPE_LABELS,
  type ReportStatus,
} from "@/lib/report-constants";
import { CITY_CATEGORIES, type CityCategory } from "@/lib/city-monitoring";

const CITY_CATEGORY_LABELS: Record<CityCategory, string> = {
  geral: "Geral",
  eventos: "Eventos",
  emprego: "Emprego",
  transito: "Trânsito",
  seguranca: "Segurança",
  clima: "Clima",
  economia: "Economia",
  cultura: "Cultura",
  esporte: "Esporte",
  politica: "Política",
  saude: "Saúde",
  educacao: "Educação",
  entretenimento: "Entretenimento",
};

interface AdminCityUpdate {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  category: string;
  platform: string;
  neighborhood: string | null;
  relevance_score: number;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

const OFFICIAL_ADMIN_EMAIL = "gentedafeira@gmail.com";

interface AdminReport {
  id: string;
  target_type: string;
  target_id: string;
  category: string;
  description: string | null;
  status: ReportStatus;
  moderator_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  reporter: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  target_owner: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  moderator: { id: string; display_name: string; username: string } | null;
}

type AuthState = "loading" | "login" | "forbidden" | "ready";

export default function AdminPanelPage() {
  const supabase = createClient();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [userLabel, setUserLabel] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingReports, setLoadingReports] = useState(false);
  const [selected, setSelected] = useState<AdminReport | null>(null);
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  type Section = "reports" | "rooms" | "banners" | "users" | "city";
  const [section, setSection] = useState<Section>("reports");
  const [officialRooms, setOfficialRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomActionId, setRoomActionId] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [rulesDraft, setRulesDraft] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  // Gestão de membros (salas oficiais)
  const [membersRoom, setMembersRoom] = useState<any | null>(null);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [roomBanned, setRoomBanned] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState("");
  const [membersTab, setMembersTab] = useState<"active" | "banned">("active");
  const [banDays, setBanDays] = useState<string>(""); // vazio = permanente

  // Banners (mensagens para todos os usuários)
  const [banners, setBanners] = useState<
    { id: string; message: string; created_at: string; is_active: boolean }[]
  >([]);
  const [loadingBanners, setLoadingBanners] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [sendingBanner, setSendingBanner] = useState(false);
  const [bannerActionId, setBannerActionId] = useState<string | null>(null);

  // "Na cidade" — cards editoriais manuais
  const [cityUpdates, setCityUpdates] = useState<AdminCityUpdate[]>([]);
  const [loadingCityUpdates, setLoadingCityUpdates] = useState(false);
  const [cityFilter, setCityFilter] = useState<"all" | "published" | "draft">(
    "all"
  );
  const [cityTitle, setCityTitle] = useState("");
  const [citySummary, setCitySummary] = useState("");
  const [cityUrl, setCityUrl] = useState("");
  const [cityCategory, setCityCategory] = useState<CityCategory>("geral");
  const [cityNeighborhood, setCityNeighborhood] = useState("");
  const [cityPublishNow, setCityPublishNow] = useState(true);
  const [creatingCityUpdate, setCreatingCityUpdate] = useState(false);
  const [cityActionId, setCityActionId] = useState<string | null>(null);

  // Membros do app
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersFilter, setUsersFilter] = useState("all");
  const [usersQuery, setUsersQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [suspendDays, setSuspendDays] = useState("7");
  const [modReason, setModReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const checkSession = useCallback(async () => {
    setAuthState("loading");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthState("login");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_moderator, display_name, username")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_moderator) {
      setAuthState("forbidden");
      setUserLabel(user.email || "");
      return;
    }
    setUserLabel(
      profile.display_name || profile.username || user.email || "Moderador"
    );
    setAuthState("ready");
  }, [supabase]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setLoginError(error.message || "Falha no login");
        return;
      }
      await checkSession();
    } catch {
      setLoginError("Erro inesperado ao entrar");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthState("login");
    setReports([]);
    setSelected(null);
    setOfficialRooms([]);
    setEditingRoom(null);
  };

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar denúncias");
      const data = await res.json();
      setReports(data.reports || []);
      setCounts(data.counts || {});
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, [statusFilter]);

  const fetchOfficialRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch("/api/admin/rooms?official=1");
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar salas");
      const data = await res.json();
      setOfficialRooms(data.rooms || []);
    } catch {
      setOfficialRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const fetchBanners = useCallback(async () => {
    setLoadingBanners(true);
    try {
      const res = await fetch("/api/admin/banners");
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar banners");
      const data = await res.json();
      setBanners(data.banners || []);
    } catch {
      setBanners([]);
    } finally {
      setLoadingBanners(false);
    }
  }, []);

  useEffect(() => {
    if (authState === "ready" && section === "reports") fetchReports();
  }, [authState, section, fetchReports]);

  useEffect(() => {
    if (authState === "ready" && section === "rooms") fetchOfficialRooms();
  }, [authState, section, fetchOfficialRooms]);

  useEffect(() => {
    if (authState === "ready" && section === "banners") fetchBanners();
  }, [authState, section, fetchBanners]);

  const fetchCityUpdates = useCallback(async () => {
    setLoadingCityUpdates(true);
    try {
      const params = new URLSearchParams();
      if (cityFilter === "published") params.set("published", "1");
      if (cityFilter === "draft") params.set("published", "0");
      const res = await fetch(`/api/admin/city-updates?${params.toString()}`);
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar cards");
      const data = await res.json();
      setCityUpdates(data.updates || []);
    } catch {
      setCityUpdates([]);
    } finally {
      setLoadingCityUpdates(false);
    }
  }, [cityFilter]);

  useEffect(() => {
    if (authState === "ready" && section === "city") fetchCityUpdates();
  }, [authState, section, fetchCityUpdates]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(usersPage));
      params.set("limit", "30");
      if (usersFilter !== "all") params.set("filter", usersFilter);
      if (usersQuery.trim()) params.set("q", usersQuery.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar usuários");
      const data = await res.json();
      setAppUsers(data.users || []);
      setUsersTotal(data.total || 0);
    } catch {
      setAppUsers([]);
      setUsersTotal(0);
    } finally {
      setLoadingUsers(false);
    }
  }, [usersPage, usersFilter, usersQuery]);

  useEffect(() => {
    if (authState === "ready" && section === "users") fetchUsers();
  }, [authState, section, fetchUsers]);

  const userModAction = async (
    action: "ban" | "unban" | "suspend" | "unsuspend" | "delete" | "message",
    userId: string,
    extra: { reason?: string; days?: number } = {}
  ) => {
    setUserActionId(userId + action);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          user_id: userId,
          reason: extra.reason || modReason || undefined,
          days: extra.days,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Falha na operação");
        return;
      }
      if (action === "message") {
        alert(
          data.chat_id
            ? "Conversa DM criada/aberta. Entre no app em Mensagens para falar com o usuário."
            : "Pedido de mensagem processado. Abra o app em Mensagens."
        );
        return;
      }
      if (action === "delete") {
        setAppUsers((prev) => prev.filter((u) => u.id !== userId));
        setUsersTotal((t) => Math.max(0, t - 1));
        setSelectedUser(null);
        return;
      }
      await fetchUsers();
      setSelectedUser(null);
    } catch {
      alert("Erro de rede");
    } finally {
      setUserActionId(null);
    }
  };

  const sendBanner = async () => {
    const msg = bannerMessage.trim();
    if (!msg) {
      alert("Digite a mensagem do banner");
      return;
    }
    if (msg.length > 500) {
      alert("Mensagem muito longa (máx. 500 caracteres)");
      return;
    }
    setSendingBanner(true);
    try {
      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, deactivate_others: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao enviar banner");
        return;
      }
      setBannerMessage("");
      await fetchBanners();
    } catch {
      alert("Erro de rede");
    } finally {
      setSendingBanner(false);
    }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm("Apagar este banner? Ele sumirá para todos os usuários.")) return;
    setBannerActionId(id);
    try {
      const res = await fetch(`/api/admin/banners?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao apagar banner");
        return;
      }
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } catch {
      alert("Erro de rede");
    } finally {
      setBannerActionId(null);
    }
  };

  const createCityUpdate = async () => {
    const title = cityTitle.trim();
    if (!title || title.length < 3) {
      alert("Título obrigatório (mín. 3 caracteres)");
      return;
    }
    setCreatingCityUpdate(true);
    try {
      const res = await fetch("/api/admin/city-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary: citySummary.trim() || null,
          url: cityUrl.trim() || null,
          category: cityCategory,
          platform: "manual",
          neighborhood: cityNeighborhood.trim() || null,
          publish: cityPublishNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao criar card");
        return;
      }
      setCityTitle("");
      setCitySummary("");
      setCityUrl("");
      setCityCategory("geral");
      setCityNeighborhood("");
      setCityPublishNow(true);
      await fetchCityUpdates();
    } catch {
      alert("Erro de rede");
    } finally {
      setCreatingCityUpdate(false);
    }
  };

  const toggleCityPublished = async (update: AdminCityUpdate) => {
    setCityActionId(update.id);
    try {
      const res = await fetch("/api/admin/city-updates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: update.id,
          is_published: !update.is_published,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao alterar publicação");
        return;
      }
      setCityUpdates((prev) =>
        prev.map((u) => (u.id === update.id ? { ...u, ...data.update } : u))
      );
    } catch {
      alert("Erro de rede");
    } finally {
      setCityActionId(null);
    }
  };

  const deleteCityUpdate = async (id: string) => {
    if (!confirm("Apagar este card? Ele sumirá do feed imediatamente.")) return;
    setCityActionId(id);
    try {
      const res = await fetch(
        `/api/admin/city-updates?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao apagar card");
        return;
      }
      setCityUpdates((prev) => prev.filter((u) => u.id !== id));
    } catch {
      alert("Erro de rede");
    } finally {
      setCityActionId(null);
    }
  };

  const toggleRoomOpen = async (room: any) => {
    setRoomActionId(room.id);
    try {
      const res = await fetch(`/api/rooms/${room.id}/toggle-open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_open: !room.is_open }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao alterar status");
        return;
      }
      setOfficialRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, is_open: data.is_open } : r))
      );
    } catch {
      alert("Erro de rede");
    } finally {
      setRoomActionId(null);
    }
  };

  const openEditRules = (room: any) => {
    setEditingRoom(room);
    setRulesDraft(room.rules || "");
  };

  const openMembers = async (room: any) => {
    setMembersRoom(room);
    setMembersTab("active");
    setInviteUsername("");
    setBanDays("");
    setLoadingMembers(true);
    setRoomMembers([]);
    setRoomBanned([]);
    try {
      const res = await fetch(`/api/admin/rooms/${room.id}/members`);
      if (res.status === 403) {
        setAuthState("forbidden");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Falha ao carregar membros");
        setMembersRoom(null);
        return;
      }
      const data = await res.json();
      setRoomMembers(data.members || []);
      setRoomBanned(data.banned || []);
    } catch {
      alert("Erro de rede");
      setMembersRoom(null);
    } finally {
      setLoadingMembers(false);
    }
  };

  const refreshMembers = async () => {
    if (!membersRoom) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/admin/rooms/${membersRoom.id}/members`);
      if (!res.ok) return;
      const data = await res.json();
      setRoomMembers(data.members || []);
      setRoomBanned(data.banned || []);
    } catch {
      /* silent */
    } finally {
      setLoadingMembers(false);
    }
  };

  const memberAction = async (
    action: "invite" | "kick" | "ban" | "unban",
    opts: { user_id?: string; username?: string; duration_days?: number | null } = {}
  ) => {
    if (!membersRoom) return;
    const key = opts.user_id || opts.username || "invite";
    setMemberActionId(key);
    try {
      const body: Record<string, unknown> = { action };
      if (opts.user_id) body.user_id = opts.user_id;
      if (opts.username) body.username = opts.username;
      if (action === "ban" && opts.duration_days != null) {
        body.duration_days = opts.duration_days;
      }
      const res = await fetch(`/api/admin/rooms/${membersRoom.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Falha na operação");
        return;
      }
      if (action === "invite") setInviteUsername("");
      await refreshMembers();
      // Atualiza contagem na lista de salas
      fetchOfficialRooms();
    } catch {
      alert("Erro de rede");
    } finally {
      setMemberActionId(null);
    }
  };

  const handleInvite = () => {
    const u = inviteUsername.trim().replace(/^@/, "");
    if (!u) {
      alert("Digite o username do usuário");
      return;
    }
    memberAction("invite", { username: u });
  };

  const saveRoomRules = async () => {
    if (!editingRoom) return;
    setSavingRules(true);
    try {
      const res = await fetch(`/api/rooms/${editingRoom.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rulesDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao salvar regras");
        return;
      }
      setOfficialRooms((prev) =>
        prev.map((r) =>
          r.id === editingRoom.id
            ? { ...r, rules: data.room?.rules ?? rulesDraft.trim() }
            : r
        )
      );
      setEditingRoom(null);
    } catch {
      alert("Erro de rede");
    } finally {
      setSavingRules(false);
    }
  };

  const updateReport = async (id: string, status: ReportStatus) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, moderatorNotes: notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao atualizar");
        return;
      }
      setSelected(null);
      setNotes("");
      await fetchReports();
    } catch {
      alert("Erro de rede");
    } finally {
      setUpdating(false);
    }
  };

  // ── Login ──────────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div style={styles.center}>
        <p style={{ color: "#666" }}>Carregando painel…</p>
      </div>
    );
  }

  if (authState === "login") {
    return (
      <div style={styles.loginScreen}>
        <form style={styles.loginCard} onSubmit={handleLogin}>
          <div style={styles.brandRow}>
            <div style={styles.brandIcon}>🛡️</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                Gente da Feira
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#666" }}>
                Painel de moderação
              </p>
            </div>
          </div>
          {loginError && <div style={styles.errorBox}>{loginError}</div>}
          <label style={styles.label}>E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            placeholder="gentedafeira@gmail.com"
            autoComplete="username"
          />
          <label style={styles.label}>Senha</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
          />
          <button type="submit" disabled={loginLoading} style={styles.btnPrimary}>
            {loginLoading ? "Entrando…" : "Entrar no painel"}
          </button>
          <p style={styles.hint}>
            Acesso restrito a contas com <code>is_moderator</code>. Admin
            oficial: <strong>{OFFICIAL_ADMIN_EMAIL}</strong>
          </p>
        </form>
      </div>
    );
  }

  if (authState === "forbidden") {
    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <h2 style={{ marginTop: 0 }}>Acesso negado</h2>
          <p style={{ color: "#666", fontSize: 14, lineHeight: 1.5 }}>
            A conta <strong>{userLabel || "atual"}</strong> não tem
            permissão de moderador.
          </p>
          <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
            No Supabase, rode o arquivo{" "}
            <code>SET_OFFICIAL_ADMIN.sql</code> para promover{" "}
            <strong>{OFFICIAL_ADMIN_EMAIL}</strong>, depois entre de novo.
          </p>
          <button type="button" onClick={handleLogout} style={styles.btnSecondary}>
            Sair e trocar de conta
          </button>
        </div>
      </div>
    );
  }

  // ── Painel ─────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brandRow}>
            <div
              style={{
                ...styles.brandIcon,
                background: "rgba(255,255,255,.2)",
              }}
            >
              🛡️
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#fff" }}>
                Painel de Moderação
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,.9)" }}>
                Gente da Feira · denúncias e ações
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {userLabel}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={styles.headerBtn}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* Navegação de seções */}
        <div style={styles.sectionSwitch}>
          <button
            type="button"
            onClick={() => setSection("reports")}
            style={section === "reports" ? styles.sectionTabActive : styles.sectionTab}
          >
            Denúncias
          </button>
          <button
            type="button"
            onClick={() => setSection("rooms")}
            style={section === "rooms" ? styles.sectionTabActive : styles.sectionTab}
          >
            Salas oficiais
          </button>
          <button
            type="button"
            onClick={() => setSection("banners")}
            style={section === "banners" ? styles.sectionTabActive : styles.sectionTab}
          >
            Banner
          </button>
          <button
            type="button"
            onClick={() => setSection("users")}
            style={section === "users" ? styles.sectionTabActive : styles.sectionTab}
          >
            Membros
          </button>
          <button
            type="button"
            onClick={() => setSection("city")}
            style={section === "city" ? styles.sectionTabActive : styles.sectionTab}
          >
            Na cidade
          </button>
        </div>

        {section === "banners" && (
          <>
            <div style={styles.sectionHead}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Banner para todos os usuários
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Envie uma mensagem que aparece no topo do app para todos. O
                usuário só pode esconder localmente; quem apaga é o admin aqui no
                painel.
              </p>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(26,27,37,.09)",
                borderRadius: 16,
                padding: "18px 20px",
                marginBottom: 20,
                boxShadow: "0 1px 2px rgba(20,20,40,.04)",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "rgba(26,27,37,.7)",
                }}
              >
                Nova mensagem
              </label>
              <textarea
                value={bannerMessage}
                onChange={(e) => setBannerMessage(e.target.value)}
                placeholder="Ex.: Manutenção programada hoje às 22h. O app pode ficar instável por alguns minutos."
                maxLength={500}
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(26,27,37,.14)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 10,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(26,27,37,.4)" }}>
                  {bannerMessage.trim().length}/500
                </span>
                <button
                  type="button"
                  onClick={sendBanner}
                  disabled={sendingBanner || !bannerMessage.trim()}
                  style={{
                    ...styles.btnSecondary,
                    background: "#1A1B25",
                    color: "#fff",
                    border: "none",
                    opacity: sendingBanner || !bannerMessage.trim() ? 0.6 : 1,
                  }}
                >
                  {sendingBanner ? "Enviando…" : "Enviar banner"}
                </button>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#888" }}>
                Ao enviar, o banner anterior ativo é desativado automaticamente.
              </p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <button type="button" onClick={() => fetchBanners()} style={styles.tab}>
                ↻ Atualizar
              </button>
            </div>

            {loadingBanners ? (
              <div style={styles.empty}>Carregando banners…</div>
            ) : banners.length === 0 ? (
              <div style={styles.empty}>
                Nenhum banner cadastrado ainda. Envie a primeira mensagem acima.
              </div>
            ) : (
              banners.map((b) => (
                <article key={b.id} style={{ ...styles.card, cursor: "default" }}>
                  <div style={styles.cardTop}>
                    <span
                      style={{
                        ...styles.badgePurple,
                        background: b.is_active
                          ? "rgba(46,204,113,.15)"
                          : "rgba(26,27,37,.08)",
                        color: b.is_active ? "#1a9c56" : "rgba(26,27,37,.45)",
                      }}
                    >
                      {b.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <span style={styles.date}>
                      {new Date(b.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p style={{ ...styles.desc, marginBottom: 12, whiteSpace: "pre-wrap" }}>
                    {b.message}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={bannerActionId === b.id}
                      onClick={() => deleteBanner(b.id)}
                      style={{
                        ...styles.btnSecondary,
                        color: "#E84393",
                        borderColor: "rgba(232,67,147,.35)",
                      }}
                    >
                      {bannerActionId === b.id ? "…" : "Apagar"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}

        {section === "city" && (
          <>
            <div style={styles.sectionHead}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Na cidade — cards editoriais
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Crie manualmente os cards que aparecem no bloco &quot;Na
                cidade&quot; do feed. Ainda não há ingestão automática de
                notícias/RSS — este painel é a forma de alimentar o bloco
                enquanto isso.
              </p>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid rgba(26,27,37,.09)",
                borderRadius: 16,
                padding: "18px 20px",
                marginBottom: 20,
                boxShadow: "0 1px 2px rgba(20,20,40,.04)",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "rgba(26,27,37,.7)",
                }}
              >
                Título *
              </label>
              <input
                type="text"
                value={cityTitle}
                onChange={(e) => setCityTitle(e.target.value)}
                placeholder="Ex.: Feira Livre do Centro muda de local neste sábado"
                maxLength={300}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(26,27,37,.14)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />

              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "rgba(26,27,37,.7)",
                }}
              >
                Resumo
              </label>
              <textarea
                value={citySummary}
                onChange={(e) => setCitySummary(e.target.value)}
                placeholder="Um ou dois parágrafos curtos sobre o que está acontecendo."
                maxLength={2000}
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(26,27,37,.14)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  resize: "vertical",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 8,
                      color: "rgba(26,27,37,.7)",
                    }}
                  >
                    Categoria
                  </label>
                  <select
                    value={cityCategory}
                    onChange={(e) =>
                      setCityCategory(e.target.value as CityCategory)
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid rgba(26,27,37,.14)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                      fontFamily: "inherit",
                      background: "#fff",
                    }}
                  >
                    {CITY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CITY_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 8,
                      color: "rgba(26,27,37,.7)",
                    }}
                  >
                    Bairro (opcional)
                  </label>
                  <input
                    type="text"
                    value={cityNeighborhood}
                    onChange={(e) => setCityNeighborhood(e.target.value)}
                    placeholder="Ex.: Centro"
                    maxLength={80}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid rgba(26,27,37,.14)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: "rgba(26,27,37,.7)",
                }}
              >
                Link (opcional)
              </label>
              <input
                type="text"
                value={cityUrl}
                onChange={(e) => setCityUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(26,27,37,.14)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  marginBottom: 14,
                }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "rgba(26,27,37,.7)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cityPublishNow}
                    onChange={(e) => setCityPublishNow(e.target.checked)}
                  />
                  Publicar imediatamente
                </label>
                <button
                  type="button"
                  onClick={createCityUpdate}
                  disabled={creatingCityUpdate || !cityTitle.trim()}
                  style={{
                    ...styles.btnSecondary,
                    background: "#1A1B25",
                    color: "#fff",
                    border: "none",
                    opacity:
                      creatingCityUpdate || !cityTitle.trim() ? 0.6 : 1,
                  }}
                >
                  {creatingCityUpdate ? "Criando…" : "Criar card"}
                </button>
              </div>
            </div>

            <div style={styles.tabs}>
              <button
                type="button"
                onClick={() => setCityFilter("all")}
                style={cityFilter === "all" ? styles.tabActive : styles.tab}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setCityFilter("published")}
                style={
                  cityFilter === "published" ? styles.tabActive : styles.tab
                }
              >
                Publicados
              </button>
              <button
                type="button"
                onClick={() => setCityFilter("draft")}
                style={cityFilter === "draft" ? styles.tabActive : styles.tab}
              >
                Rascunhos
              </button>
              <button
                type="button"
                onClick={() => fetchCityUpdates()}
                style={styles.tab}
              >
                ↻ Atualizar
              </button>
            </div>

            {loadingCityUpdates ? (
              <div style={styles.empty}>Carregando cards…</div>
            ) : cityUpdates.length === 0 ? (
              <div style={styles.empty}>
                Nenhum card por aqui ainda. Crie o primeiro acima — ele
                aparece no bloco &quot;Na cidade&quot; do feed assim que
                publicado.
              </div>
            ) : (
              cityUpdates.map((u) => (
                <article key={u.id} style={{ ...styles.card, cursor: "default" }}>
                  <div style={styles.cardTop}>
                    <span
                      style={{
                        ...styles.badgePurple,
                        background: u.is_published
                          ? "rgba(46,204,113,.15)"
                          : "rgba(26,27,37,.08)",
                        color: u.is_published ? "#1a9c56" : "rgba(26,27,37,.45)",
                      }}
                    >
                      {u.is_published ? "Publicado" : "Rascunho"}
                    </span>
                    <span style={styles.date}>
                      {new Date(u.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p style={styles.motivo}>{u.title}</p>
                  {u.summary && <p style={styles.desc}>{u.summary}</p>}
                  <div style={styles.meta}>
                    <span>
                      {CITY_CATEGORY_LABELS[u.category as CityCategory] ||
                        u.category}
                    </span>
                    {u.neighborhood && <span>📍 {u.neighborhood}</span>}
                    <span>Score {u.relevance_score}</span>
                    {u.url && (
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#6C5CE7", fontWeight: 700 }}
                      >
                        Ver link ↗
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={cityActionId === u.id}
                      onClick={() => toggleCityPublished(u)}
                      style={styles.btnSecondary}
                    >
                      {cityActionId === u.id
                        ? "…"
                        : u.is_published
                        ? "Despublicar"
                        : "Publicar"}
                    </button>
                    <button
                      type="button"
                      disabled={cityActionId === u.id}
                      onClick={() => deleteCityUpdate(u.id)}
                      style={{
                        ...styles.btnSecondary,
                        color: "#E84393",
                        borderColor: "rgba(232,67,147,.35)",
                      }}
                    >
                      {cityActionId === u.id ? "…" : "Apagar"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}

        {section === "users" && (
          <>
            <div style={styles.sectionHead}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Membros do app
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Liste usuários, banir, suspender, excluir conta ou abrir conversa
                (DM) com o membro.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <input
                type="search"
                value={usersQuery}
                onChange={(e) => {
                  setUsersQuery(e.target.value);
                  setUsersPage(1);
                }}
                placeholder="Buscar nome ou @username"
                style={{ ...styles.input, margin: 0, maxWidth: 260 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchUsers();
                }}
              />
              <button type="button" onClick={() => fetchUsers()} style={styles.tab}>
                Buscar
              </button>
              {(
                [
                  ["all", "Todos"],
                  ["banned", "Banidos"],
                  ["suspended", "Suspensos"],
                  ["moderators", "Mods"],
                  ["deletion", "Exclusão pendente"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setUsersFilter(key);
                    setUsersPage(1);
                  }}
                  style={
                    usersFilter === key ? styles.tabActive : styles.tab
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <label style={{ fontSize: 12, color: "#666" }}>
                Motivo (ban/suspensão):
              </label>
              <input
                type="text"
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="Opcional"
                style={{ ...styles.input, margin: 0, maxWidth: 280 }}
              />
              <label style={{ fontSize: 12, color: "#666" }}>
                Dias suspensão:
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
                style={{ ...styles.input, margin: 0, width: 80 }}
              />
            </div>

            <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
              {usersTotal} usuário{usersTotal !== 1 ? "s" : ""} · página{" "}
              {usersPage}
            </p>

            {loadingUsers ? (
              <div style={styles.empty}>Carregando membros…</div>
            ) : appUsers.length === 0 ? (
              <div style={styles.empty}>Nenhum usuário encontrado.</div>
            ) : (
              appUsers.map((u) => {
                const name = u.display_name || u.username || u.id.slice(0, 8);
                const busy = !!userActionId && userActionId.startsWith(u.id);
                return (
                  <article
                    key={u.id}
                    style={{ ...styles.card, cursor: "default" }}
                  >
                    <div style={styles.cardTop}>
                      <div>
                        <h3 style={{ ...styles.motivo, margin: 0 }}>{name}</h3>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          @{u.username}
                          {u.is_moderator ? " · moderador" : ""}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {u.is_banned && (
                          <span
                            style={{
                              ...styles.badgePurple,
                              background: "rgba(232,67,147,.12)",
                              color: "#E84393",
                            }}
                          >
                            Banido
                          </span>
                        )}
                        {u.is_suspended && (
                          <span
                            style={{
                              ...styles.badgePurple,
                              background: "rgba(255,140,66,.15)",
                              color: "#cc6a1f",
                            }}
                          >
                            Suspenso
                          </span>
                        )}
                        {u.deletion_requested_at && (
                          <span
                            style={{
                              ...styles.badgePurple,
                              background: "rgba(26,27,37,.08)",
                              color: "rgba(26,27,37,.55)",
                            }}
                          >
                            Exclusão pendente
                          </span>
                        )}
                      </div>
                    </div>
                    {(u.banned_reason || u.suspend_reason) && (
                      <p style={styles.desc}>
                        {u.banned_reason
                          ? `Ban: ${u.banned_reason}`
                          : `Suspensão: ${u.suspend_reason}`}
                        {u.suspended_until
                          ? ` · até ${new Date(u.suspended_until).toLocaleString("pt-BR")}`
                          : ""}
                      </p>
                    )}
                    <div style={styles.meta}>
                      <span>
                        <b>Desde:</b>{" "}
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      {u.neighborhood && (
                        <span>
                          <b>Bairro:</b> {u.neighborhood}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => userModAction("message", u.id)}
                        style={styles.btnSecondary}
                      >
                        Mensagem
                      </button>
                      {u.is_banned ? (
                        <button
                          type="button"
                          disabled={busy || u.is_moderator}
                          onClick={() => userModAction("unban", u.id)}
                          style={styles.btnSecondary}
                        >
                          Desbanir
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || u.is_moderator}
                          onClick={() => {
                            if (
                              !confirm(
                                `Banir ${name} permanentemente do app?`
                              )
                            )
                              return;
                            userModAction("ban", u.id, {
                              reason: modReason || undefined,
                            });
                          }}
                          style={{
                            ...styles.btnSecondary,
                            color: "#E84393",
                            borderColor: "rgba(232,67,147,.35)",
                          }}
                        >
                          Banir
                        </button>
                      )}
                      {u.is_suspended ? (
                        <button
                          type="button"
                          disabled={busy || u.is_moderator}
                          onClick={() => userModAction("unsuspend", u.id)}
                          style={styles.btnSecondary}
                        >
                          Tirar suspensão
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || u.is_moderator}
                          onClick={() => {
                            const d = parseInt(suspendDays, 10) || 7;
                            if (
                              !confirm(
                                `Suspender ${name} por ${d} dia(s)?`
                              )
                            )
                              return;
                            userModAction("suspend", u.id, {
                              reason: modReason || undefined,
                              days: d,
                            });
                          }}
                          style={styles.btnSecondary}
                        >
                          Suspender
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || u.is_moderator}
                        onClick={() => {
                          if (
                            !confirm(
                              `EXCLUIR permanentemente a conta de ${name}? Esta ação não pode ser desfeita.`
                            )
                          )
                            return;
                          if (
                            !confirm(
                              "Confirma exclusão definitiva? Dados e arquivos serão removidos."
                            )
                          )
                            return;
                          userModAction("delete", u.id);
                        }}
                        style={{
                          ...styles.btnSecondary,
                          color: "#fff",
                          background: "#E84393",
                          borderColor: "#E84393",
                        }}
                      >
                        Excluir conta
                      </button>
                    </div>
                  </article>
                );
              })
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <button
                type="button"
                disabled={usersPage <= 1}
                onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                style={styles.tab}
              >
                ← Anterior
              </button>
              <button
                type="button"
                disabled={usersPage * 30 >= usersTotal}
                onClick={() => setUsersPage((p) => p + 1)}
                style={styles.tab}
              >
                Próxima →
              </button>
            </div>
          </>
        )}

        {section === "rooms" && (
          <>
            <div style={styles.sectionHead}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Salas oficiais
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Salas oficiais: abrir/fechar, editar regras e gerenciar membros
                (convidar, expulsar, banir/desbanir) direto pelo painel.
              </p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <button type="button" onClick={() => fetchOfficialRooms()} style={styles.tab}>
                ↻ Atualizar
              </button>
            </div>
            {loadingRooms ? (
              <div style={styles.empty}>Carregando salas…</div>
            ) : officialRooms.length === 0 ? (
              <div style={styles.empty}>
                Nenhuma sala oficial encontrada. Confira o seed do SQL e o script
                SET_OFFICIAL_ROOMS_OWNER.sql.
              </div>
            ) : (
              officialRooms.map((room) => (
                <article key={room.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{room.icon || "💬"}</span>
                      <div>
                        <h3 style={{ ...styles.motivo, margin: 0 }}>{room.name}</h3>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>
                          /{room.slug}
                          {room.is_creator ? " · você é criador" : room.my_role ? ` · ${room.my_role}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      style={{
                        ...styles.badgePurple,
                        background: room.is_open
                          ? "rgba(46,204,113,.15)"
                          : "rgba(232,67,147,.12)",
                        color: room.is_open ? "#1a9c56" : "#E84393",
                      }}
                    >
                      {room.is_open ? "Aberta" : "Fechada"}
                    </span>
                  </div>
                  {room.description && (
                    <p style={styles.desc}>{room.description}</p>
                  )}
                  <div style={styles.meta}>
                    <span>
                      <b>Membros:</b> {room.member_count ?? 0}
                      {room.max_members ? ` / ${room.max_members}` : ""}
                    </span>
                    <span>
                      <b>Banidos:</b> {room.banned_count ?? 0}
                    </span>
                    <span>
                      <b>Senha:</b> {room.has_password ? "Sim" : "Não"}
                    </span>
                  </div>
                  {room.rules ? (
                    <div style={styles.snapshot}>
                      <div style={styles.snapshotWho}>Regras</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{room.rules}</div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: "#999", margin: "0 0 12px" }}>
                      Sem regras definidas
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      disabled={roomActionId === room.id}
                      onClick={() => toggleRoomOpen(room)}
                      style={styles.btnSecondary}
                    >
                      {roomActionId === room.id
                        ? "…"
                        : room.is_open
                          ? "Fechar sala"
                          : "Abrir sala"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditRules(room)}
                      style={styles.btnSecondary}
                    >
                      Editar regras
                    </button>
                    <button
                      type="button"
                      onClick={() => openMembers(room)}
                      style={styles.btnSecondary}
                    >
                      Membros
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}

        {section === "reports" && (
          <>
        <div style={styles.sectionHead}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Denúncias</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            Analise e atualize o status das denúncias da comunidade.
          </p>
        </div>

        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            style={statusFilter === "all" ? styles.tabActive : styles.tab}
          >
            Todas
          </button>
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={statusFilter === s ? styles.tabActive : styles.tab}
            >
              {REPORT_STATUS_LABELS[s]}
              {counts[s] != null && (
                <span style={styles.count}> {counts[s]}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => fetchReports()}
            style={styles.tab}
            title="Atualizar"
          >
            ↻
          </button>
        </div>

        {loadingReports ? (
          <div style={styles.empty}>Carregando denúncias…</div>
        ) : reports.length === 0 ? (
          <div style={styles.empty}>Nenhuma denúncia neste filtro.</div>
        ) : (
          reports.map((r) => (
            <article
              key={r.id}
              style={styles.card}
              onClick={() => {
                setSelected(r);
                setNotes(r.moderator_notes || "");
              }}
            >
              <div style={styles.cardTop}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={styles.badgePurple}>
                    {REPORT_TARGET_TYPE_LABELS[
                      r.target_type as keyof typeof REPORT_TARGET_TYPE_LABELS
                    ] || r.target_type}
                  </span>
                  <span style={statusBadgeStyle(r.status)}>
                    {REPORT_STATUS_LABELS[r.status]}
                  </span>
                </div>
                <span style={styles.date}>
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <h3 style={styles.motivo}>
                {REPORT_CATEGORY_LABELS[
                  r.category as keyof typeof REPORT_CATEGORY_LABELS
                ] || r.category}
              </h3>
              {r.description && (
                <p style={styles.desc}>{r.description}</p>
              )}
              <div style={styles.meta}>
                <span>
                  <b>Denunciante:</b>{" "}
                  {r.reporter?.display_name || r.reporter?.username || "—"}
                </span>
                <span>
                  <b>Alvo:</b>{" "}
                  {r.target_owner?.display_name ||
                    r.target_owner?.username ||
                    r.target_id.slice(0, 8)}
                </span>
              </div>
            </article>
          ))
        )}
        </>
        )}
      </main>

      {selected && (
        <div style={styles.overlay} onClick={() => setSelected(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {REPORT_CATEGORY_LABELS[
                selected.category as keyof typeof REPORT_CATEGORY_LABELS
              ] || selected.category}
            </h3>
            <p style={{ fontSize: 13, color: "#666" }}>
              {REPORT_TARGET_TYPE_LABELS[
                selected.target_type as keyof typeof REPORT_TARGET_TYPE_LABELS
              ] || selected.target_type}{" "}
              · {selected.target_id}
            </p>
            {selected.description && (
              <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
                {selected.description}
              </p>
            )}
            <label style={styles.label}>Nota do moderador</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...styles.input, resize: "vertical" as const }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {REPORT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={updating || selected.status === s}
                  onClick={() => updateReport(selected.id, s)}
                  style={
                    selected.status === s ? styles.btnPrimary : styles.btnSecondary
                  }
                >
                  {REPORT_STATUS_LABELS[s]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={styles.btnSecondary}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}


      {editingRoom && (
        <div style={styles.overlay} onClick={() => setEditingRoom(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              Regras — {editingRoom.icon} {editingRoom.name}
            </h3>
            <label style={styles.label}>Texto das regras</label>
            <textarea
              value={rulesDraft}
              onChange={(e) => setRulesDraft(e.target.value.slice(0, 500))}
              rows={5}
              style={{ ...styles.input, resize: "vertical" as const }}
              placeholder="Regras da sala..."
            />
            <p style={{ fontSize: 11, color: "#999" }}>{rulesDraft.length}/500</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={savingRules}
                onClick={saveRoomRules}
                style={styles.btnPrimary}
              >
                {savingRules ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                style={styles.btnSecondary}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {membersRoom && (
        <div style={styles.overlay} onClick={() => setMembersRoom(null)}>
          <div
            style={{ ...styles.modal, maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>
                Membros — {membersRoom.icon || "💬"} {membersRoom.name}
              </h3>
              <button
                type="button"
                onClick={() => setMembersRoom(null)}
                style={styles.btnSecondary}
              >
                Fechar
              </button>
            </div>

            {/* Convidar */}
            <div
              style={{
                background: "#FAFAFD",
                border: "1px solid rgba(26,27,37,.09)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <label style={{ ...styles.label, marginBottom: 6 }}>
                Convidar por username
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="@username"
                  style={{ ...styles.input, flex: 1, minWidth: 140, margin: 0 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInvite();
                  }}
                />
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={
                    !!memberActionId &&
                    memberActionId ===
                      (inviteUsername.trim().replace(/^@/, "") || "invite")
                  }
                  style={styles.btnPrimary}
                >
                  {memberActionId &&
                  memberActionId ===
                    (inviteUsername.trim().replace(/^@/, "") || "invite")
                    ? "…"
                    : "Convidar"}
                </button>
              </div>
            </div>

            {/* Tabs ativos / banidos */}
            <div style={{ ...styles.tabs, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setMembersTab("active")}
                style={
                  membersTab === "active" ? styles.tabActive : styles.tab
                }
              >
                Ativos ({roomMembers.length})
              </button>
              <button
                type="button"
                onClick={() => setMembersTab("banned")}
                style={
                  membersTab === "banned" ? styles.tabActive : styles.tab
                }
              >
                Banidos ({roomBanned.length})
              </button>
              <button
                type="button"
                onClick={() => refreshMembers()}
                style={styles.tab}
              >
                ↻
              </button>
            </div>

            {loadingMembers ? (
              <div style={{ ...styles.empty, padding: "24px 12px" }}>
                Carregando…
              </div>
            ) : membersTab === "active" ? (
              roomMembers.length === 0 ? (
                <div style={{ ...styles.empty, padding: "24px 12px" }}>
                  Nenhum membro ativo
                </div>
              ) : (
                <div style={{ maxHeight: 340, overflow: "auto" }}>
                  {roomMembers.map((m) => {
                    const name =
                      m.profile?.display_name ||
                      m.profile?.username ||
                      m.user_id.slice(0, 8);
                    const uname = m.profile?.username
                      ? `@${m.profile.username}`
                      : "";
                    const isCreator = m.role === "creator";
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 4px",
                          borderBottom: "1px solid rgba(26,27,37,.06)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {name}{" "}
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "rgba(26,27,37,.4)",
                                textTransform: "uppercase",
                              }}
                            >
                              {m.role}
                            </span>
                          </div>
                          {uname && (
                            <div style={{ fontSize: 12, color: "#888" }}>
                              {uname}
                            </div>
                          )}
                        </div>
                        {!isCreator && (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              disabled={memberActionId === m.user_id}
                              onClick={() => {
                                if (
                                  !confirm(
                                    `Expulsar ${name} da sala? Ele poderá entrar de novo se a sala estiver aberta.`
                                  )
                                )
                                  return;
                                memberAction("kick", { user_id: m.user_id });
                              }}
                              style={{
                                ...styles.btnSecondary,
                                fontSize: 12,
                                padding: "6px 10px",
                              }}
                            >
                              {memberActionId === m.user_id ? "…" : "Expulsar"}
                            </button>
                            <button
                              type="button"
                              disabled={memberActionId === m.user_id}
                              onClick={() => {
                                const daysStr = banDays.trim();
                                const days = daysStr
                                  ? parseInt(daysStr, 10)
                                  : null;
                                const label =
                                  days && days > 0
                                    ? `${days} dia(s)`
                                    : "permanente";
                                if (
                                  !confirm(
                                    `Banir ${name} (${label})?`
                                  )
                                )
                                  return;
                                memberAction("ban", {
                                  user_id: m.user_id,
                                  duration_days:
                                    days && days > 0 ? days : null,
                                });
                              }}
                              style={{
                                ...styles.btnSecondary,
                                fontSize: 12,
                                padding: "6px 10px",
                                color: "#E84393",
                                borderColor: "rgba(232,67,147,.35)",
                              }}
                            >
                              Banir
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : roomBanned.length === 0 ? (
              <div style={{ ...styles.empty, padding: "24px 12px" }}>
                Nenhum usuário banido
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflow: "auto" }}>
                {roomBanned.map((m) => {
                  const name =
                    m.profile?.display_name ||
                    m.profile?.username ||
                    m.user_id.slice(0, 8);
                  const until = m.banned_until
                    ? new Date(m.banned_until).toLocaleString("pt-BR")
                    : "Permanente";
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 4px",
                        borderBottom: "1px solid rgba(26,27,37,.06)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {name}
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          Até: {until}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={memberActionId === m.user_id}
                        onClick={() => {
                          if (!confirm(`Desbanir ${name}?`)) return;
                          memberAction("unban", { user_id: m.user_id });
                        }}
                        style={{
                          ...styles.btnSecondary,
                          fontSize: 12,
                          padding: "6px 10px",
                        }}
                      >
                        {memberActionId === m.user_id ? "…" : "Desbanir"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label style={{ ...styles.label, marginBottom: 4 }}>
                Duração do ban (dias) — vazio = permanente
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={banDays}
                onChange={(e) => setBanDays(e.target.value)}
                placeholder="Ex.: 7"
                style={{ ...styles.input, width: 120, margin: 0 }}
              />
            </div>
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        Painel independente · Admin oficial {OFFICIAL_ADMIN_EMAIL} · /admin
      </footer>
    </div>
  );
}

function statusBadgeStyle(status: ReportStatus): CSSProperties {
  const map: Record<ReportStatus, CSSProperties> = {
    pending: {
      background: "rgba(255,140,66,.15)",
      color: "#cc6a1f",
      fontSize: 10.5,
      fontWeight: 800,
      textTransform: "uppercase",
      padding: "4px 9px",
      borderRadius: 999,
    },
    reviewing: {
      background: "rgba(108,92,231,.15)",
      color: "#6C5CE7",
      fontSize: 10.5,
      fontWeight: 800,
      textTransform: "uppercase",
      padding: "4px 9px",
      borderRadius: 999,
    },
    resolved: {
      background: "rgba(46,204,113,.15)",
      color: "#1a9c56",
      fontSize: 10.5,
      fontWeight: 800,
      textTransform: "uppercase",
      padding: "4px 9px",
      borderRadius: 999,
    },
    dismissed: {
      background: "rgba(26,27,37,.08)",
      color: "#666",
      fontSize: 10.5,
      fontWeight: 800,
      textTransform: "uppercase",
      padding: "4px 9px",
      borderRadius: 999,
    },
  };
  return map[status];
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F2F3F9",
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "#F2F3F9",
    fontFamily: "Inter, sans-serif",
  },
  loginScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "radial-gradient(900px 420px at 8% -6%, rgba(255,140,66,.16), transparent 60%), radial-gradient(900px 420px at 100% 0%, rgba(108,92,231,.16), transparent 60%), #F2F3F9",
    fontFamily: "Inter, sans-serif",
  },
  loginCard: {
    width: "100%",
    maxWidth: 400,
    background: "#fff",
    border: "1px solid rgba(26,27,37,.09)",
    borderRadius: 16,
    boxShadow: "0 16px 40px -12px rgba(30,20,60,.22)",
    padding: "28px 26px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    background: "linear-gradient(90deg, #FF8C42, #E84393, #6C5CE7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  label: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "rgba(26,27,37,.55)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  input: {
    width: "100%",
    padding: "10px 13px",
    borderRadius: 8,
    border: "1.5px solid rgba(26,27,37,.09)",
    background: "#FAFAFD",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  btnPrimary: {
    marginTop: 6,
    padding: "11px 16px",
    border: "none",
    borderRadius: 8,
    background: "linear-gradient(90deg, #FF8C42, #E84393)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13.5,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "10px 14px",
    border: "none",
    borderRadius: 8,
    background: "rgba(26,27,37,.06)",
    color: "#1A1B25",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  errorBox: {
    background: "rgba(232,67,147,.1)",
    border: "1px solid rgba(232,67,147,.28)",
    color: "#b0245e",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 8,
    padding: "9px 12px",
  },
  hint: {
    margin: "12px 0 0",
    fontSize: 11.5,
    color: "rgba(26,27,37,.34)",
    textAlign: "center",
    lineHeight: 1.5,
  },
  header: {
    background: "linear-gradient(90deg, #FF8C42, #E84393, #6C5CE7)",
    padding: "18px 24px",
    boxShadow: "0 8px 24px -8px rgba(30,20,60,.14)",
    position: "sticky",
    top: 0,
    zIndex: 30,
  },
  headerInner: {
    maxWidth: 1080,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  headerBtn: {
    background: "rgba(255,255,255,.16)",
    border: "1px solid rgba(255,255,255,.28)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
  main: { maxWidth: 1080, margin: "0 auto", padding: "22px 24px 60px" },
  sectionHead: { marginBottom: 16 },
  sectionSwitch: {
    display: "flex",
    gap: 6,
    marginBottom: 22,
    padding: 6,
    background: "#fff",
    border: "1px solid rgba(26,27,37,.09)",
    borderRadius: 999,
    boxShadow: "0 1px 2px rgba(20,20,40,.04)",
  },
  sectionTab: {
    flex: 1,
    textAlign: "center",
    fontSize: 13.5,
    padding: "10px 16px",
    borderRadius: 999,
    background: "transparent",
    color: "rgba(26,27,37,.55)",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  sectionTabActive: {
    flex: 1,
    textAlign: "center",
    fontSize: 13.5,
    padding: "10px 16px",
    borderRadius: 999,
    background: "#1A1B25",
    color: "#fff",
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  snapshot: {
    background: "#FAFAFD",
    border: "1px solid rgba(26,27,37,.09)",
    borderLeft: "3px solid #6C5CE7",
    borderRadius: 8,
    padding: "10px 13px",
    fontSize: 13,
    marginBottom: 12,
  },
  snapshotWho: {
    fontWeight: 800,
    fontSize: 11.5,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    color: "rgba(26,27,37,.55)",
  },
  tabs: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  tab: {
    padding: "8px 14px",
    borderRadius: 999,
    background: "#fff",
    border: "1px solid rgba(26,27,37,.09)",
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(26,27,37,.55)",
    cursor: "pointer",
  },
  tabActive: {
    padding: "8px 14px",
    borderRadius: 999,
    background: "#1A1B25",
    border: "1px solid #1A1B25",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
  count: { fontSize: 11, opacity: 0.75 },
  empty: {
    textAlign: "center",
    color: "rgba(26,27,37,.34)",
    padding: "46px 20px",
    background: "#fff",
    border: "1px dashed rgba(26,27,37,.14)",
    borderRadius: 16,
  },
  card: {
    background: "#fff",
    border: "1px solid rgba(26,27,37,.09)",
    borderRadius: 16,
    boxShadow: "0 1px 2px rgba(20,20,40,.04)",
    padding: "18px 20px",
    marginBottom: 14,
    cursor: "pointer",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  badgePurple: {
    background: "rgba(108,92,231,.12)",
    color: "#6C5CE7",
    fontSize: 10.5,
    fontWeight: 800,
    textTransform: "uppercase",
    padding: "4px 9px",
    borderRadius: 999,
  },
  date: { fontSize: 11, color: "rgba(26,27,37,.34)", whiteSpace: "nowrap" },
  motivo: {
    fontSize: 15,
    fontWeight: 800,
    margin: "0 0 5px",
  },
  desc: {
    fontSize: 13.5,
    color: "rgba(26,27,37,.55)",
    margin: "0 0 12px",
    whiteSpace: "pre-wrap",
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 18px",
    fontSize: 12,
    color: "rgba(26,27,37,.34)",
    paddingTop: 10,
    borderTop: "1px solid rgba(26,27,37,.09)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20,20,40,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    maxWidth: 480,
    width: "100%",
    padding: 24,
    maxHeight: "90vh",
    overflow: "auto",
  },
  footer: {
    textAlign: "center",
    padding: "24px",
    fontSize: 12,
    color: "rgba(26,27,37,.34)",
  },
};
