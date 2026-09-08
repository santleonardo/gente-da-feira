// ─── Web Push helper (VAPID) ──────────────────────────────────────────────────
// Usado internamente pelas rotas de API para disparar push notifications.
// Requer as variáveis de ambiente:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   — chave pública VAPID
//   VAPID_PRIVATE_KEY              — chave privada VAPID
//   VAPID_MAILTO                   — e-mail do responsável (ex: mailto:admin@seuapp.com)
//
// Para gerar o par de chaves rode:
//   npx web-push generate-vapid-keys

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

// Inicializa as chaves VAPID uma única vez por processo
const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const mailto     = process.env.VAPID_MAILTO ?? "mailto:admin@gentedafeira.app";

if (publicKey && privateKey) {
  webpush.setVapidDetails(mailto, publicKey, privateKey);
} else if (process.env.NODE_ENV === "production") {
  console.error("[SEC-001] VAPID keys não configuradas — push notifications DESABILITADAS em produção");
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Rate limit in-memory por usuário (máx 10 pushes/minuto/usuário)
const pushRateLimits = new Map<string, { count: number; resetAt: number }>();

// Limpeza periódica
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pushRateLimits.entries()) {
      if (entry.resetAt < now) pushRateLimits.delete(key);
    }
  }, 60_000);
}

function checkPushRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = pushRateLimits.get(userId);

  if (!entry || entry.resetAt < now) {
    pushRateLimits.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 10) return false;

  entry.count++;
  return true;
}

// Validação básica do subscription object
function isValidSubscription(sub: any): boolean {
  return (
    sub &&
    typeof sub === "object" &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.keys &&
    typeof sub.keys === "object" &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

// Limitar tamanho do payload (Web Push tem limite de ~4KB)
const MAX_PAYLOAD_SIZE = 3072;

// Envia push para todas as subscriptions ativas de um usuário.
// Subscriptions inválidas (410 Gone) são removidas automaticamente.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  // Validação de input
  if (!userId || typeof userId !== "string") {
    console.warn("[SEC-001] sendPushToUser chamado sem userId válido");
    return;
  }

  if (!payload?.title || !payload?.body) {
    console.warn("[SEC-001] sendPushToUser chamado sem payload válido");
    return;
  }

  if (!publicKey || !privateKey) {
    return; // Push desabilitado — não logar em cada chamada
  }

  // Rate limit por usuário
  if (!checkPushRateLimit(userId)) {
    console.warn(`[SEC-001] Rate limit de push atingido para usuário ${userId.slice(0, 8)}...`);
    return;
  }

  // Limitar tamanho do payload
  const message = JSON.stringify({
    title: payload.title.slice(0, 100),
    body: payload.body.slice(0, 200),
    url: payload.url?.slice(0, 500) || "/",
    tag: payload.tag?.slice(0, 50) || "gdf-notification",
  });

  if (message.length > MAX_PAYLOAD_SIZE) {
    console.warn(`[SEC-001] Payload muito grande (${message.length} bytes) — truncado`);
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("id, subscription, user_id")
    .eq("user_id", userId)
    .limit(20); // Limitar para prevenir abusos

  if (error || !rows || rows.length === 0) return;

  const staleIds: string[] = [];
  const mismatchedIds: string[] = []; // Subscriptions pertencentes a outro usuário

  await Promise.allSettled(
    rows.map(async (row) => {
      // Verificar que a subscription pertence ao usuário correto
      if (row.user_id !== userId) {
        mismatchedIds.push(row.id);
        return;
      }

      let sub: webpush.PushSubscription;
      try {
        const parsed = JSON.parse(row.subscription);
        if (!isValidSubscription(parsed)) {
          staleIds.push(row.id);
          return;
        }
        sub = parsed;
      } catch {
        staleIds.push(row.id);
        return;
      }

      try {
        await webpush.sendNotification(sub, message);
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(row.id);
        } else {
          console.error("[push] Falha ao enviar:", err?.statusCode, err?.message ?? err);
        }
      }
    })
  );

  // Remove subscriptions inválidas
  if (staleIds.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in("id", staleIds);
  }

  // Remove subscriptions com user_id incorreto (segurança)
  if (mismatchedIds.length > 0) {
    console.warn(`[SEC-001] Removidas ${mismatchedIds.length} subscriptions com user_id incorreto`);
    await admin
      .from("push_subscriptions")
      .delete()
      .in("id", mismatchedIds);
  }
}