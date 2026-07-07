"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Flag, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  REPORT_TARGET_TYPE_LABELS,
  REPORT_CATEGORIES_REQUIRING_DESCRIPTION,
  MAX_REPORT_DESCRIPTION_LENGTH,
  type ReportCategory,
} from "@/lib/report-constants";

/**
 * UX-024: Dialog global de denúncia.
 *
 * Renderizado UMA vez em AppShell e controlado inteiramente pelo
 * estado global (useStore().reportTarget) — nenhuma view precisa
 * renderizar sua própria cópia do dialog, evitando a duplicação de
 * código já sinalizada em UX-020.
 *
 * Para abrir: useStore.getState().openReportDialog({ targetType, targetId })
 */
export function ReportDialog() {
  const { reportTarget, closeReportDialog } = useStore();

  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const open = !!reportTarget;

  // Reseta o formulário sempre que um novo alvo é aberto
  useEffect(() => {
    if (open) {
      setCategory("");
      setDescription("");
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [reportTarget?.targetId, reportTarget?.targetType, open]);

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) closeReportDialog();
  };

  const requiresDescription =
    category !== "" && REPORT_CATEGORIES_REQUIRING_DESCRIPTION.has(category);

  const canSubmit =
    !!category && (!requiresDescription || description.trim().length > 0) && !submitting;

  const handleSubmit = async () => {
    if (!reportTarget || !category) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: reportTarget.targetType,
          targetId: reportTarget.targetId,
          category,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSubmitted(true);
      } else if (res.status === 409) {
        toast.info(data.error || "Você já denunciou este conteúdo.");
        closeReportDialog();
      } else {
        toast.error(data.error || "Não foi possível enviar a denúncia. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const targetLabel = reportTarget
    ? reportTarget.label || REPORT_TARGET_TYPE_LABELS[reportTarget.targetType]
    : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h3 className="text-base font-semibold">Denúncia enviada</h3>
            <p className="text-sm text-muted-foreground">
              Obrigado por ajudar a manter a comunidade segura. Nossa equipe vai analisar
              o conteúdo denunciado.
            </p>
            <Button onClick={closeReportDialog} className="mt-2 w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-red-500" />
                Denunciar {targetLabel.toLowerCase()}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="report-category" className="text-sm font-medium">
                  Motivo da denúncia
                </label>
                <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
                  <SelectTrigger id="report-category" aria-label="Motivo da denúncia">
                    <SelectValue placeholder="Selecione um motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {REPORT_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="report-description" className="text-sm font-medium">
                  Descrição {requiresDescription ? "" : "(opcional)"}
                </label>
                <Textarea
                  id="report-description"
                  placeholder="Conte mais detalhes sobre o que aconteceu..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_REPORT_DESCRIPTION_LENGTH))}
                  rows={4}
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {description.length}/{MAX_REPORT_DESCRIPTION_LENGTH}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Denúncias falsas ou feitas de má-fé podem resultar em restrições na sua conta.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={closeReportDialog}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Denunciar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
