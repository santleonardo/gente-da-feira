"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DeletionPendingView() {
  const { profile } = useStore();
  const [canceling, setCanceling] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { daysRemaining, scheduledDateFormatted, countdownText } = useMemo(() => {
    if (!profile?.deletion_scheduled_at) {
      return { daysRemaining: 0, scheduledDateFormatted: "", countdownText: "" };
    }

    const scheduled = new Date(profile.deletion_scheduled_at);
    const now = new Date();
    const diffMs = scheduled.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const scheduledDateFormatted = scheduled.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    let countdownText: string;
    if (daysRemaining <= 0) {
      countdownText = "Exclusão hoje";
    } else if (daysRemaining === 1) {
      countdownText = "Último dia";
    } else {
      countdownText = `${daysRemaining} dias restantes`;
    }

    return { daysRemaining, scheduledDateFormatted, countdownText };
  }, [profile?.deletion_scheduled_at]);

  const handleCancelDeletion = async () => {
    setCanceling(true);
    try {
      const res = await fetch("/api/users/me/cancel-deletion", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao cancelar exclusão" }));
        throw new Error(err.error || "Erro ao cancelar exclusão");
      }
      toast.success("Exclusão cancelada com sucesso!");
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar exclusão");
    } finally {
      setCanceling(false);
    }
  };

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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-md">
            <span className="text-xl font-bold text-primary-foreground">GF</span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Conta marcada para exclusão</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sua conta foi marcada para exclusão permanente. Após o período de
            carência, todos os seus dados serão removidos permanentemente.
          </p>
        </div>

        {/* Countdown */}
        <div className="rounded-xl border bg-muted/40 px-4 py-3 space-y-1">
          <p className="text-2xl font-bold text-destructive">{countdownText}</p>
          <p className="text-xs text-muted-foreground">
            Agendado para {scheduledDateFormatted}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={handleCancelDeletion}
            disabled={canceling}
          >
            {canceling ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelando...
              </span>
            ) : (
              "Cancelar exclusão"
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Exportando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Exportar meus dados
              </span>
            )}
          </Button>
        </div>

        {/* Footer text */}
        <p className="text-xs text-muted-foreground">
          Se você não cancelar, a exclusão será automática.
        </p>
      </div>
    </div>
  );
}