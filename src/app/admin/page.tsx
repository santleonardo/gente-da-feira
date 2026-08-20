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

  useEffect(() => {
    if (authState === "ready") fetchReports();
  }, [authState, fetchReports]);

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
