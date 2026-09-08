/**
 * REL-006: Idempotência para operações de escrita.
 *
 * Previne duplicação de recursos (mensagens, posts, reações, salas, etc.)
 * quando o cliente reenvia a mesma requisição — por retry de rede,
 * duplo-tap, ou timeout do lado do cliente enquanto o servidor já
 * processou a primeira tentativa.
 *
 * Depende das RPCs Postgres definidas em REL-006_idempotency.sql:
 *   - rpc_idempotency_check(p_key, p_user_id)
 *   - rpc_idempotency_complete(p_key, p_response)
 *   - rpc_idempotency_fail(p_key)
 *
 * Uso em uma Route Handler:
 *
 *   import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
 *
 *   export async function POST(req: NextRequest) {
 *     try {
 *       const idemBlock = await idempotencyGate(req, user.id);
 *       if (idemBlock) return idemBlock;
 *
 *       // ... lógica da rota ...
 *
 *       await idempotencyStore(req, responseData);
 *       return NextResponse.json(responseData);
 *     } catch (error) {
 *       await idempotencyFail(req);
 *       // ... tratamento de erro ...
 *     }
 *   }
 *
 * O cliente deve enviar um header `Idempotency-Key` (ex.: um
 * crypto.randomUUID() gerado uma vez por ação lógica do usuário, e
 * reaproveitado em retries dessa mesma ação). Requisições sem o
 * header não são bloqueadas — a idempotência aqui é opt-in por
 * design, para não quebrar clientes que ainda não enviam a chave.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const MAX_KEY_LENGTH = 128;

type IdempotencyCheckResult =
  | { claimed: true; re_claimed?: boolean }
  | { claimed: false; status: "completed"; response: unknown }
  | { claimed: false; status: "processing" }
  | { claimed: false; status: "unknown" };

function getKey(req: NextRequest): string | null {
  const raw = req.headers.get(IDEMPOTENCY_HEADER);
  if (!raw) return null;

  const key = raw.trim();
  if (!key || key.length > MAX_KEY_LENGTH) return null;

  return key;
}

/**
 * Verifica e "reivindica" uma chave de idempotência antes de processar
 * a requisição.
 *
 * @returns `null` se a requisição deve prosseguir normalmente (sem
 *   header presente, ou chave reivindicada com sucesso). Retorna uma
 *   `NextResponse` que o handler deve devolver imediatamente quando a
 *   chave já tem uma resposta em cache (replay idempotente) ou está
 *   em processamento concorrente por outra requisição.
 */
export async function idempotencyGate(
  req: NextRequest,
  userId: string
): Promise<NextResponse | null> {
  const key = getKey(req);
  if (!key) return null; // Sem header — segue sem idempotência (opt-in)

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .rpc("rpc_idempotency_check", { p_key: key, p_user_id: userId })
      .maybeSingle();

    if (error) {
      // Falha na infraestrutura de idempotência nunca deve derrubar a
      // requisição principal — fail-open aqui é aceitável (pior caso:
      // uma duplicata rara), diferente de auth/autorização que devem
      // fail-closed.
      console.error("[idempotency] rpc_idempotency_check falhou:", error.message);
      return null;
    }

    const result = data as IdempotencyCheckResult | null;
    if (!result || result.claimed) {
      return null; // Chave nova, ou stale re-reivindicada — segue normalmente.
    }

    if (result.status === "completed") {
      // Replay idempotente: devolve a resposta original já processada.
      return NextResponse.json(result.response ?? {}, { status: 200 });
    }

    // status "processing" (ou "unknown"): outra requisição idêntica
    // ainda está em voo dentro da janela de 30s. Rejeita para o
    // cliente não gerar uma segunda escrita duplicada.
    return NextResponse.json(
      { error: "Requisição idêntica já está sendo processada." },
      { status: 409 }
    );
  } catch (err) {
    console.error("[idempotency] gate falhou:", err);
    return null; // Nunca bloquear o fluxo principal por falha aqui.
  }
}

/**
 * Marca a chave de idempotência da requisição (se presente) como
 * concluída, armazenando a resposta para replay em duplicatas futuras.
 */
export async function idempotencyStore(
  req: NextRequest,
  response: unknown
): Promise<void> {
  const key = getKey(req);
  if (!key) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("rpc_idempotency_complete", {
      p_key: key,
      p_response: response as any,
    });
    if (error) {
      console.error("[idempotency] rpc_idempotency_complete falhou:", error.message);
    }
  } catch (err) {
    console.error("[idempotency] store falhou:", err);
  }
}

/**
 * Marca a chave de idempotência da requisição (se presente) como
 * falha, permitindo que o cliente tente novamente com a mesma chave
 * após a janela de stale recovery (30s) em vez de esperar o TTL
 * completo de 24h.
 */
export async function idempotencyFail(req: NextRequest): Promise<void> {
  const key = getKey(req);
  if (!key) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("rpc_idempotency_fail", { p_key: key });
    if (error) {
      console.error("[idempotency] rpc_idempotency_fail falhou:", error.message);
    }
  } catch (err) {
    console.error("[idempotency] fail-mark falhou:", err);
  }
}
