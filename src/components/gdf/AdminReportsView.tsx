"use client";

import { useEffect, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Flag, Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/gdf/UserAvatar";
import { timeAgo } from "@/lib/constants";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_TYPES,
  REPORT_TARGET_TYPE_LABELS,
  type ReportStatus,
} from "@/lib/report-constants";

interface AdminReport {
  id: string;
  target_type: string;
  target_id: string;
  category: string;
  description: string | null;
  status: ReportStatus;
  moderator_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reporter: { id: string; display_name: string; username: string; avatar_url: string | null } | null;
  target_owner: { id: string; display_name: string; username: string; avatar_url: string | null } | null;
  moderator: { id: string; display_name: string; username: string } | null;
}

const STATUS_BADGE_STYLE: Record<ReportStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  reviewing: "bg-blue-100 text-blue-800 border-blue-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  dismissed: "bg-muted text-muted-foreground border-border",
};

/**
 * UX-024: Painel administrativo de denúncias.
 *
 * Acessível apenas via SettingsView → "Painel de moderação", que só
 * aparece se profile.is_moderator === true. O backend (RLS + checagem
 * explícita de is_moderator na API) é a fonte real de verdade — esta
 * tela apenas evita mostrar um link morto a quem não tem acesso.
 */
export function AdminReportsView() {
  const { setProfileSubView } = useStore();

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>("all");

  const [selected, setSelected] = useState<AdminReport | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (targetTypeFilter !== "all") params.set("targetType", targetTypeFilter);

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setReports(data.reports || []);
        setCounts(data.counts || {});
      } else {
        toast.error(data.error || "Erro ao carregar denúncias");
      }
    } catch {
      toast.error("Erro de conexão ao carregar denúncias");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, targetTypeFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openDetail = (report: AdminReport) => {
    setSelected(report);
    setNotesDraft(report.moderator_notes || "");
  };

  const updateReport = async (id: string, updates: { status?: ReportStatus; moderatorNotes?: string }) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Denúncia atualizada");
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...data.report } : r))
        );
        setSelected((prev) => (prev && prev.id === id ? { ...prev, ...data.report } : prev));
        fetchReports();
      } else {
        toast.error(data.error || "Erro ao atualizar denúncia");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSavingId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar o painel de moderação.
        </p>
        <Button variant="outline" size="sm" onClick={() => setProfileSubView("profile")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setProfileSubView("profile")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Flag className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-semibold flex-1">Painel de moderação</h2>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={fetchReports} title="Atualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Badges de contagem por status */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? STATUS_BADGE_STYLE[s] : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {REPORT_STATUS_LABELS[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Filtros adicionais */}
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs" aria-label="Filtrar por categoria">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {REPORT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{REPORT_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={targetTypeFilter} onValueChange={setTargetTypeFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs" aria-label="Filtrar por tipo de conteúdo">
            <SelectValue placeholder="Tipo de conteúdo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {REPORT_TARGET_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{REPORT_TARGET_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de denúncias */}
      <div className="space-y-2 px-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma denúncia encontrada com esses filtros.
          </p>
        ) : (
          reports.map((report) => (
            <Card key={report.id} className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => openDetail(report)}>
              <CardContent className="flex items-start gap-3 py-3">
                <UserAvatar
                  user={{
                    id: report.reporter?.id || "",
                    display_name: report.reporter?.display_name || "?",
                    avatar_url: report.reporter?.avatar_url || null,
                  }}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{report.reporter?.display_name || "Usuário"}</span>
                    <span className="text-xs text-muted-foreground">denunciou</span>
                    <Badge variant="outline" className="text-[10px]">
                      {REPORT_TARGET_TYPE_LABELS[report.target_type as keyof typeof REPORT_TARGET_TYPE_LABELS] || report.target_type}
                    </Badge>
                    {report.target_owner && (
                      <span className="text-xs text-muted-foreground">de @{report.target_owner.username}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {REPORT_CATEGORY_LABELS[report.category as keyof typeof REPORT_CATEGORY_LABELS] || report.category}
                  </p>
                  {report.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{report.description}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(report.created_at)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_STYLE[report.status]}`}
                >
                  {REPORT_STATUS_LABELS[report.status]}
                </span>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog de detalhe / ação */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-red-500" />
                  Denúncia — {REPORT_TARGET_TYPE_LABELS[selected.target_type as keyof typeof REPORT_TARGET_TYPE_LABELS] || selected.target_type}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Denunciante</p>
                    <p className="font-medium">{selected.reporter?.display_name || "—"} (@{selected.reporter?.username})</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Autor do conteúdo</p>
                    <p className="font-medium">
                      {selected.target_owner ? `${selected.target_owner.display_name} (@${selected.target_owner.username})` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Categoria</p>
                    <p className="font-medium">{REPORT_CATEGORY_LABELS[selected.category as keyof typeof REPORT_CATEGORY_LABELS] || selected.category}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Criada em</p>
                    <p className="font-medium">{new Date(selected.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">ID do conteúdo</p>
                    <p className="font-mono text-[11px] break-all">{selected.target_id}</p>
                  </div>
                </div>

                {selected.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Descrição do denunciante</p>
                    <p className="rounded-lg bg-muted p-2.5 text-sm">{selected.description}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observações internas (visíveis só para moderadores)</p>
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value.slice(0, 2000))}
                    rows={3}
                    placeholder="Anotações sobre a análise, ação tomada, etc."
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {REPORT_STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selected.status === s ? "default" : "outline"}
                      disabled={savingId === selected.id}
                      onClick={() => updateReport(selected.id, { status: s, moderatorNotes: notesDraft })}
                    >
                      {REPORT_STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={savingId === selected.id}
                  onClick={() => updateReport(selected.id, { moderatorNotes: notesDraft })}
                >
                  {savingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar observações"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
