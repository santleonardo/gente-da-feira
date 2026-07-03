// Helper para disparar push de forma fire-and-forget a partir de rotas de API.
// Chama /api/push/send internamente usando a URL base do servidor.
//
// SEC-001: INTERNAL_API_SECRET é OBRIGATÓRIO. Se não estiver configurada,
// o dispatch é silenciosamente abortado — nunca envia sem autenticação.

import { getInternalSecret } from "@/lib/internal-auth";

// Flag para logar aviso apenas uma vez por processo
let _warnedMissing = false;

export async function dispatchPushForNotification(notificationId: string): Promise<void> {
  try {
    // Validação básica do ID
    if (!notificationId || typeof notificationId !== "string") return;

    const secret = getInternalSecret();
    if (!secret) {
      if (!_warnedMissing) {
        console.error("[SEC-001] dispatchPushForNotification abortado: INTERNAL_API_SECRET não configurada. Push notifications estão DESABILITADAS.");
        _warnedMissing = true;
      }
      return;
    }

    // Monta URL base — nunca usar localhost em produção
    let base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base && process.env.VERCEL_URL) {
      base = `https://${process.env.VERCEL_URL}`;
    }
    if (!base) {
      if (!_warnedMissing) {
        console.warn("[SEC-001] dispatchPushForNotification abortado: NEXT_PUBLIC_APP_URL e VERCEL_URL não definidas");
        _warnedMissing = true;
      }
      return;
    }

    // Remove trailing slash
    base = base.replace(/\/+$/, "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${base}/api/push/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify({ notificationId }),
        signal: controller.signal,
      });

      if (!res.ok && res.status !== 429) {
        console.warn(`[SEC-001] push/send respondeu com ${res.status} para notificação ${notificationId}`);
      }
    } catch (fetchErr: any) {
      if (fetchErr?.name === "AbortError") {
        console.warn(`[SEC-001] push/send timeout para notificação ${notificationId}`);
      }
      // Silencioso para outros erros de rede — push é best-effort
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Fire-and-forget — nunca deve quebrar a rota chamadora
  }
}
