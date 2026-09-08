"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Trash2, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type DeletionStep = 1 | 2;

export function AccountSection() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionStep, setDeletionStep] = useState<DeletionStep>(1);
  const [confirmationText, setConfirmationText] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/users/me/export");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao exportar dados" }));
        throw new Error(err.error || "Erro ao exportar dados");
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-gente-da-feira-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Dados exportados com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao exportar dados");
    } finally {
      setExporting(false);
    }
  };

  const handleDeletionConfirm = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/users/me/request-deletion", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao solicitar exclusão" }));
        throw new Error(err.error || "Erro ao solicitar exclusão");
      }
      toast.success("Conta marcada para exclusão. Você será desconectado.");
      setTimeout(() => {
        useStore.getState().logout();
        const supabase = createClient();
        supabase.auth.signOut();
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Erro ao solicitar exclusão");
    } finally {
      setDeleting(false);
      setShowDeletionDialog(false);
    }
  };

  const resetDeletionDialog = () => {
    setDeletionStep(1);
    setConfirmationText("");
    setDeleting(false);
  };

  const isConfirmationValid = confirmationText.trim().toUpperCase() === "EXCLUIR";

  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createClient();
      try { await supabase.removeAllChannels(); } catch { /* ok */ }
      await supabase.auth.signOut();
      useStore.getState().logout();
    } catch {
      toast.error("Erro ao sair da conta");
      setLoggingOut(false);
    }
  };


  return (
    <>
      {/* CONTA */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="h-4 w-4 text-[#D96C4A]" />
            <h3 className="font-serif text-base font-medium text-[#1A1A1A]">Minha conta</h3>
          </div>

          <div className="space-y-4">
            {/* Sair da conta */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-black/[0.06]">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-[#1A1A1A]">Sessão</p>
                <p className="text-xs text-muted-foreground">
                  Encerra o acesso neste dispositivo
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={loggingOut}
                className="shrink-0 gap-1.5 rounded-full border-black/15 text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white"
              >
                {loggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sair da conta
              </Button>
            </div>

            {/* Exportar dados */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Exportar meus dados</p>
                <p className="text-xs text-muted-foreground">
                  Baixe uma cópia de todos os seus dados em formato JSON (LGPD)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="shrink-0"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Excluir conta */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Excluir minha conta</p>
                <p className="text-xs text-muted-foreground">
                  Ação permanente e irreversível após o período de carência
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetDeletionDialog();
                  setShowDeletionDialog(true);
                }}
                className="shrink-0 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-step deletion dialog */}
      <AlertDialog open={showDeletionDialog} onOpenChange={(open) => {
        if (!open) resetDeletionDialog();
        setShowDeletionDialog(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletionStep === 1
                ? "Excluir conta permanentemente?"
                : "Confirmação final"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {deletionStep === 1 ? (
                <div className="space-y-2">
                  <p>
                    Isso agendará sua conta para exclusão permanente. Você terá
                    7 dias para cancelar. Após esse prazo, <strong>TODOS</strong>{" "}
                    os seus dados serão permanentemente excluídos, incluindo:
                  </p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>Publicações</li>
                    <li>Comentários</li>
                    <li>Fotos e vídeos</li>
                    <li>Mensagens</li>
                    <li>Seguidores e seguidos</li>
                    <li>Todos os demais conteúdos</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>Para confirmar, digite EXCLUIR no campo abaixo:</p>
                  <Input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="Digite EXCLUIR"
                    className="mt-1"
                  />
                  <p className="text-xs text-destructive font-medium">
                    Isso não pode ser desfeito após o período de carência
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {deletionStep === 1 ? (
              <>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => setDeletionStep(2)}>
                  Continuar
                </AlertDialogAction>
              </>
            ) : (
              <>
                <AlertDialogCancel onClick={() => setDeletionStep(1)}>
                  Voltar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={!isConfirmationValid || deleting}
                  onClick={handleDeletionConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Excluindo...
                    </span>
                  ) : (
                    "Excluir conta"
                  )}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}