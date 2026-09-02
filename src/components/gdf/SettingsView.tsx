"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Shield,
  Lock,
  EyeOff,
  MapPin,
  UserCheck,
  UserX,
  Bell,
  Mic,
  Video,
  Users,
  Ban,
  Trash2,
  Loader2,
  Moon,
  Sun,
  Monitor,
  FileText,
  ChevronRight,
  Flag,
} from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { AccountSection } from "./AccountSection";
import { toast } from "sonner";

export function SettingsView({ embedded }: { embedded?: boolean }) {
  const { profile, updateProfile, setProfileSubView } = useStore();
  const { theme, setTheme } = useTheme();

  const [isPrivate, setIsPrivate] = useState(profile?.is_private || false);
  const [hideFollowing, setHideFollowing] = useState(profile?.hide_following || false);
  const [hideFollowers, setHideFollowers] = useState(profile?.hide_followers || false);
  const [hideNeighborhood, setHideNeighborhood] = useState(profile?.hide_neighborhood || false);
  const [approveFollowers, setApproveFollowers] = useState(profile?.approve_followers || false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [showFollowersDialog, setShowFollowersDialog] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [removingFollowerId, setRemovingFollowerId] = useState<string | null>(null);

  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showTermsDialog, setShowTermsDialog] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsPrivate(profile.is_private || false);
      setHideFollowing(profile.hide_following || false);
      setHideFollowers(profile.hide_followers || false);
      setHideNeighborhood(profile.hide_neighborhood || false);
      setApproveFollowers(profile.approve_followers || false);
    }
  }, [profile?.is_private, profile?.hide_following, profile?.hide_followers, profile?.hide_neighborhood, profile?.approve_followers]);

  useEffect(() => {
    if (!profile) return;
    const fetchRequests = () => {
      fetch("/api/follows/requests")
        .then((r) => r.json())
        .then((data) => { if (data.requests) setPendingRequests(data.requests); })
        .catch(() => {});
    };
    fetchRequests();
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => { if (data.notifications) setNotifications(data.notifications); })
      .catch(() => {});
  }, [profile]);

  const handlePrivacyChange = async (
    field: "is_private" | "hide_following" | "hide_followers" | "hide_neighborhood" | "approve_followers",
    value: boolean
  ) => {
    if (!profile) return;
    setPrivacyLoading(true);
    if (field === "is_private") setIsPrivate(value);
    if (field === "hide_following") setHideFollowing(value);
    if (field === "hide_followers") setHideFollowers(value);
    if (field === "hide_neighborhood") setHideNeighborhood(value);
    if (field === "approve_followers") setApproveFollowers(value);

    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.user) {
        updateProfile(data.user);
        const messages: Record<string, { on: string; off: string }> = {
          is_private:         { on: "Perfil agora é privado",                              off: "Perfil agora é público" },
          hide_following:     { on: "Lista de seguindo oculta",                            off: "Lista de seguindo visível" },
          hide_followers:     { on: "Lista de seguidores oculta",                          off: "Lista de seguidores visível" },
          hide_neighborhood:  { on: "Bairro oculto no perfil público",                     off: "Bairro visível no perfil público" },
          approve_followers:  { on: "Aprovação de seguidores ativada",                     off: "Solicitações pendentes foram aceitas automaticamente" },
        };
        const msg = messages[field];
        toast.success(value ? msg.on : msg.off);
        if (field === "approve_followers" && !value) setPendingRequests([]);
      } else {
        if (field === "is_private") setIsPrivate(!value);
        if (field === "hide_following") setHideFollowing(!value);
        if (field === "hide_followers") setHideFollowers(!value);
        if (field === "hide_neighborhood") setHideNeighborhood(!value);
        if (field === "approve_followers") setApproveFollowers(!value);
        toast.error("Erro ao atualizar privacidade");
      }
    } catch {
      if (field === "is_private") setIsPrivate(!value);
      if (field === "hide_following") setHideFollowing(!value);
      if (field === "hide_followers") setHideFollowers(!value);
      if (field === "hide_neighborhood") setHideNeighborhood(!value);
      if (field === "approve_followers") setApproveFollowers(!value);
      toast.error("Erro ao atualizar privacidade");
    }
    setPrivacyLoading(false);
  };

  const handleRequestAction = async (requestId: string, action: "accept" | "reject") => {
    setRequestsLoading(true);
    try {
      const res = await fetch("/api/follows/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await res.json();
      if (data.accepted) {
        setPendingRequests((prev) => prev.filter((r: any) => r.id !== requestId));
        toast.success("Solicitação aceita!");
      } else if (data.rejected) {
        setPendingRequests((prev) => prev.filter((r: any) => r.id !== requestId));
        toast.success("Solicitação rejeitada");
      } else {
        toast.error(data.error || "Erro ao processar solicitação");
      }
    } catch {
      toast.error("Erro ao processar solicitação");
    }
    setRequestsLoading(false);
  };

  const openFollowersDialog = async () => {
    if (!profile) return;
    setShowFollowersDialog(true);
    setFollowersLoading(true);
    try {
      const res = await fetch(`/api/follows?userId=${profile.id}`);
      const data = await res.json();
      if (data.followers) setFollowers(data.followers.map((f: any) => f.follower).filter(Boolean));
    } catch {
      setFollowers([]);
    }
    setFollowersLoading(false);
  };

  const handleRemoveFollower = async (followerId: string) => {
    setRemovingFollowerId(followerId);
    try {
      const res = await fetch(`/api/follows?followerId=${followerId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.removed) {
        setFollowers((prev) => prev.filter((f: any) => f.id !== followerId));
        toast.success("Seguidor removido");
      } else {
        toast.error(data.error || "Erro ao remover seguidor");
      }
    } catch {
      toast.error("Erro ao remover seguidor");
    }
    setRemovingFollowerId(null);
  };

  const openBlockedDialog = async () => {
    if (!profile) return;
    setShowBlockedDialog(true);
    setBlockedLoading(true);
    try {
      const res = await fetch("/api/blocks");
      const data = await res.json();
      if (data.blocks) {
        setBlockedUsers(data.blocks.map((b: any) => ({ ...b.blocked, blockId: b.id })).filter((u: any) => u.id));
      }
    } catch {
      setBlockedUsers([]);
    }
    setBlockedLoading(false);
  };

  const handleUnblock = async (targetId: string) => {
    setUnblockingId(targetId);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId }),
      });
      const data = await res.json();
      if (data.blocked === false) {
        setBlockedUsers((prev) => prev.filter((u: any) => u.id !== targetId));
        toast.success("Usuário desbloqueado");
      } else {
        toast.error(data.error || "Erro ao desbloquear");
      }
    } catch {
      toast.error("Erro ao desbloquear");
    }
    setUnblockingId(null);
  };

  const requestPermission = async (type: "notifications" | "microphone" | "camera") => {
    try {
      if (type === "notifications") {
        const result = await Notification.requestPermission();
        if (result === "granted") toast.success("Notificações ativadas!");
        else toast.error("Permissão de notificação negada");
      } else if (type === "microphone") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        toast.success("Microfone permitido!");
      } else if (type === "camera") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        toast.success("Câmera permitida!");
      }
    } catch {
      toast.error(`Permissão de ${type === "microphone" ? "microfone" : type === "camera" ? "câmera" : "notificação"} negada`);
    }
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setProfileSubView("profile")}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold">Configurações</h2>
        </div>
      )}

      {/* APARÊNCIA */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Sun className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Aparência</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  id: "light",
                  label: "Claro",
                  desc: "Dia na feira",
                  icon: Sun,
                  swatch: "bg-[#f7f9fa] border-[#c8dde3]",
                  dot: "bg-[#0A4D5C]",
                },
                {
                  id: "dark",
                  label: "Escuro",
                  desc: "Padrão noturno",
                  icon: Moon,
                  swatch: "bg-[#0a0f10] border-[#1e3338]",
                  dot: "bg-[#2EC4B6]",
                },
                {
                  id: "noite",
                  label: "Noite da Praça",
                  desc: "Teal neon + poste",
                  icon: MapPin,
                  swatch: "bg-[#0c1214] border-[#243338]",
                  dot: "bg-[#3dd9c6]",
                },
                {
                  id: "a11y",
                  label: "Alto contraste",
                  desc: "Preto no branco",
                  icon: Contrast,
                  swatch: "bg-white border-black",
                  dot: "bg-black",
                },
                {
                  id: "a11y-dark",
                  label: "Contraste escuro",
                  desc: "Branco no preto",
                  icon: Contrast,
                  swatch: "bg-black border-white",
                  dot: "bg-white",
                },
                {
                  id: "system",
                  label: "Sistema",
                  desc: "Segue o aparelho",
                  icon: Monitor,
                  swatch: "bg-gradient-to-br from-[#f7f9fa] to-[#0a0f10] border-border",
                  dot: "bg-primary",
                },
              ] as const
            ).map((opt) => {
              const active = theme === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                    active
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  <div
                    className={`relative h-10 w-full rounded-xl border ${opt.swatch}`}
                    aria-hidden
                  >
                    <span
                      className={`absolute bottom-1.5 right-1.5 h-3 w-3 rounded-full ${opt.dot} ring-2 ring-black/10`}
                    />
                  </div>
                  <div className="flex w-full items-center gap-1.5 min-w-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate">{opt.label}</span>
                    {active && (
                      <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 shrink-0">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* PRIVACIDADE */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Privacidade</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">Perfil privado</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Quem não te segue não verá seus posts e informações</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={(v) => handlePrivacyChange("is_private", v)} disabled={privacyLoading} />
            </div>
            <div className="border-t" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">Aprovar seguidores</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Quem quiser te seguir precisará da sua aprovação</p>
              </div>
              <Switch checked={approveFollowers} onCheckedChange={(v) => handlePrivacyChange("approve_followers", v)} disabled={privacyLoading} />
            </div>
            <div className="border-t" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">Esconder seguindo</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Ninguém verá quem você está seguindo</p>
              </div>
              <Switch checked={hideFollowing} onCheckedChange={(v) => handlePrivacyChange("hide_following", v)} disabled={privacyLoading} />
            </div>
            <div className="border-t" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">Esconder seguidores</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Ninguém verá sua lista de seguidores</p>
              </div>
              <Switch checked={hideFollowers} onCheckedChange={(v) => handlePrivacyChange("hide_followers", v)} disabled={privacyLoading} />
            </div>
            <div className="border-t" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">Esconder bairro</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Seu bairro não aparecerá no seu perfil público</p>
              </div>
              <Switch checked={hideNeighborhood} onCheckedChange={(v) => handlePrivacyChange("hide_neighborhood", v)} disabled={privacyLoading} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SOLICITAÇÕES PENDENTES */}
      {approveFollowers && pendingRequests.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Solicitações para seguir</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5">{pendingRequests.length}</Badge>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req: any) => (
                <div key={req.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <UserAvatar
                    user={{ id: req.follower?.id || req.follower_id, display_name: req.follower?.display_name || "?", avatar_url: req.follower?.avatar_url }}
                    className="h-10 w-10"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{req.follower?.display_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">@{req.follower?.username}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="default" onClick={() => handleRequestAction(req.id, "accept")} disabled={requestsLoading} className="h-7 px-2.5 gap-1 text-[11px]">
                      <UserCheck className="h-3 w-3" /> Aceitar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRequestAction(req.id, "reject")} disabled={requestsLoading} className="h-7 px-2.5 gap-1 text-[11px]">
                      <UserX className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GERENCIAR */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Gerenciar</h3>
          </div>
          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={openFollowersDialog} className="w-full justify-start gap-2">
              <UserX className="h-4 w-4" /> Remover seguidores
            </Button>
            <Button variant="outline" size="sm" onClick={openBlockedDialog} className="w-full justify-start gap-2">
              <Ban className="h-4 w-4" /> Usuários bloqueados
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NOTIFICAÇÕES RECENTES */}
      {notifications.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Notificações recentes</h3>
            </div>
            <div className="space-y-2">
              {notifications.slice(0, 5).map((notif: any) => {
                const notifText: Record<string, string> = {
                  follow:          "começou a te seguir",
                  follow_request:  "solicitou te seguir",
                  follow_accepted: "aceitou sua solicitação",
                  reaction:        "reagiu ao seu post",
                  comment:         "comentou no seu post",
                  report_new:      "enviou uma nova denúncia — abra o Painel de moderação",
                  moderation_suspend:   "sua conta foi suspensa pela moderação",
                  moderation_unsuspend: "sua suspensão foi encerrada",
                  moderation_ban:       "sua conta foi banida pela moderação",
                  moderation_unban:     "o banimento da sua conta foi removido",
                };
                return (
                  <div key={notif.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${!notif.is_read ? "bg-primary/5 border-primary/20" : ""}`}>
                    <UserAvatar
                      user={{ id: notif.actor?.id || "", display_name: notif.actor?.display_name || "?", avatar_url: notif.actor?.avatar }}
                      className="h-8 w-8"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{notif.actor?.display_name}</span>{" "}
                        <span className="text-muted-foreground">{notifText[notif.type] || notif.type}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(notif.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    {!notif.is_read && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PERMISSÕES DO DISPOSITIVO */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Permissões do dispositivo</h3>
          </div>
          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => requestPermission("notifications")} className="w-full justify-start gap-2">
              <Bell className="h-4 w-4" /> Notificações
            </Button>
            <Button variant="outline" size="sm" onClick={() => requestPermission("microphone")} className="w-full justify-start gap-2">
              <Mic className="h-4 w-4" /> Microfone
            </Button>
            <Button variant="outline" size="sm" onClick={() => requestPermission("camera")} className="w-full justify-start gap-2">
              <Video className="h-4 w-4" /> Câmera
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PAINEL DE MODERAÇÃO — apenas para moderadores (UX-024) */}
      {profile?.is_moderator && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold">Moderação</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProfileSubView("moderation")}
              className="w-full justify-start gap-2"
            >
              <Flag className="h-4 w-4" /> Painel de denúncias
            </Button>
          </CardContent>
        </Card>
      )}

      {/* CONTA */}
      <AccountSection />

      {/* TERMOS DE USO */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Legal</h3>
          </div>
          <button
            onClick={() => setShowTermsDialog(true)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Termos de Uso</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      {/* DIALOG: TERMOS DE USO */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Termos de Uso
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 text-sm text-muted-foreground space-y-4 leading-relaxed">
            <p className="text-xs text-muted-foreground italic">Versão 1.0 — 16 de junho de 2026</p>

            <section>
              <h4 className="font-semibold text-foreground mb-1">1. Sobre estes Termos</h4>
              <p>Estes Termos regulam o uso da rede social <strong className="text-foreground">Gente da Feira</strong>, voltada à conexão entre moradores dos bairros de Feira de Santana (BA). Ao criar uma conta, você declara que leu e concorda com estes Termos. Caso não concorde, não se cadastre nem utilize a plataforma.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">2. Quem pode usar</h4>
              <p>A Gente da Feira é destinada exclusivamente a pessoas com <strong className="text-foreground">18 anos completos ou mais</strong>. Ao se cadastrar, você declara, sob as penas da lei, que possui 18 anos e que suas informações são verdadeiras. Contas de menores de idade serão suspensas e excluídas.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">3. Cadastro e conta</h4>
              <p>Você é responsável por manter a confidencialidade da sua senha e por todas as atividades realizadas na sua conta. É proibido criar contas falsas, em nome de terceiros ou para fins fraudulentos. Cada pessoa pode manter apenas uma conta pessoal.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">4. Regras de conduta</h4>
              <p>É proibido: criar perfis falsos; publicar conteúdo discriminatório, racista ou que incite violência; assediar ou ameaçar outros usuários; publicar qualquer conteúdo sexual envolvendo menores; compartilhar imagens íntimas de terceiros sem consentimento; caluniar, difamar ou injuriar; enviar spam ou golpes; acessar indevidamente dados de terceiros; usar automações para manipular métricas.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">5. Conteúdo publicado</h4>
              <p>Você é o único responsável pelo conteúdo que publica, incluindo sua legalidade e os direitos de terceiros envolvidos. Ao publicar, você concede à plataforma licença limitada para hospedar e exibir esse conteúdo dentro do serviço. Metadados de geolocalização de imagens são removidos automaticamente.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">6. Crimes e responsabilidade</h4>
              <p>A plataforma não tolera condutas criminosas, incluindo: crimes contra a honra (calúnia, difamação, injúria), injúria racial equiparada a racismo (Lei nº 14.532/2023), invasão de dispositivo informático (art. 154-A do CP), extorsão e estelionato. A responsabilidade por esses atos é de quem os praticou.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">7. Moderação e denúncias</h4>
              <p>Você pode denunciar posts, comentários, mensagens e perfis diretamente pelo aplicativo, tocando em "Denunciar" no menu do conteúdo. Conteúdo íntimo não consensual pode ser removido mediante notificação direta, sem necessidade de ordem judicial — nesse caso, use o e-mail oficial. A plataforma pode remover conteúdo em casos de violação grave sem aviso prévio.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">8. Privacidade e dados (LGPD)</h4>
              <p>Coletamos apenas os dados necessários para o funcionamento do serviço (nome, e-mail, bairro, registros de acesso). Seus dados não são vendidos a terceiros nem usados para publicidade direcionada sem consentimento. Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento pelo canal de contato.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">9. Suspensão e cancelamento</h4>
              <p>Contas que violem estes Termos podem ser suspensas ou excluídas, de forma preventiva ou definitiva. Você pode excluir sua conta a qualquer momento nas configurações ou pelo canal de contato.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">10. Legislação e foro</h4>
              <p>Estes Termos são regidos pela legislação brasileira, em especial o Marco Civil da Internet (Lei nº 12.965/2014), a LGPD (Lei nº 13.709/2018) e o ECA Digital (Lei nº 15.211/2025). Fica eleito o foro da comarca de <strong className="text-foreground">Feira de Santana, BA</strong>.</p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-1">11. Contato</h4>
              <p>Dúvidas, solicitações sobre dados pessoais (LGPD) ou denúncias podem ser enviadas para: <strong className="text-foreground">privacidade@gentedafeira.app</strong></p>
            </section>

            <p className="text-[11px] text-muted-foreground/60 border-t pt-3 mt-2">
              Documento elaborado com base no Marco Civil da Internet (Lei nº 12.965/2014), na LGPD (Lei nº 13.709/2018), no ECA Digital (Lei nº 15.211/2025) e no Código Penal brasileiro.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG: REMOVER SEGUIDORES */}
      <Dialog open={showFollowersDialog} onOpenChange={setShowFollowersDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="h-4 w-4" /> Remover seguidores
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {followersLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="h-3 w-24 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : followers.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhum seguidor</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {followers.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-8 w-8" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.display_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">@{u.username}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveFollower(u.id)} disabled={removingFollowerId === u.id} className="h-7 px-2 text-muted-foreground hover:text-destructive">
                      {removingFollowerId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG: USUÁRIOS BLOQUEADOS */}
      <Dialog open={showBlockedDialog} onOpenChange={setShowBlockedDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4" /> Usuários bloqueados
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {blockedLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="h-3 w-24 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : blockedUsers.length === 0 ? (
              <div className="py-8 text-center">
                <Ban className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhum usuário bloqueado</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {blockedUsers.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <UserAvatar user={{ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} className="h-8 w-8" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.display_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">@{u.username}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleUnblock(u.id)} disabled={unblockingId === u.id} className="h-7 px-2.5 text-[11px]">
                      {unblockingId === u.id ? <Loader2 className="h-3 w-3.5 animate-spin" /> : "Desbloquear"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
