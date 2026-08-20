// ─── Internal API Authentication (SEC-001) ──────────────────────────────────
// Validação centralizada e fail-closed do INTERNAL_API_SECRET.
// Nenhum endpoint interno deve aceitar requisições sem esse segredo válido.
//
// Segurança:
//   - Se INTERNAL_API_SECRET não estiver configurado → BLOQUEIA tudo (fail-closed).
//   - Se o header Authorization estiver ausente ou incorreto → 401.
//   - Se o header não começar com "Bearer " → 401.
//   - Constant-time comparison via timingSafeEqual para prevenir timing attacks.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const _cachedSecret: { value: string; checked: boolean } = { value: "", checked: false };

function getSecretOrThrow(): string {
  if (_cachedSecret.checked) return _cachedSecret.value;

  const secret = process.env.INTERNAL_API_SECRET;

  if (!secret || secret.length < 32) {
    const reason = !secret
      ? "INTERNAL_API_SECRET nao definida"
      : `INTERNAL_API_SECRET muito curta (${secret.length} chars, minimo 32)`;
    console.error(`[SEC-001] BLOQUEADO: ${reason}. Defina INTERNAL_API_SECRET no ambiente com pelo menos 32 caracteres.`);
    _cachedSecret.checked = true;
    _cachedSecret.value = "";
    return "";
  }

  _cachedSecret.checked = true;
  _cachedSecret.value = secret;
  return secret;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Valida o header Authorization de uma requisição interna.
 * Retorna `null` se válido, ou uma Response 401/500 se inválido.
 *
 * Uso no Route Handler:
 *   const blocked = validateInternalAuth(req);
 *   if (blocked) return blocked;
 */
export function validateInternalAuth(req: NextRequest): NextResponse | null {
  const secret = getSecretOrThrow();

  // Fail-closed: secret ausente ou muito curta
  if (!secret) {
    console.error("[SEC-001] Requisição interna rejeitada: INTERNAL_API_SECRET não configurada ou inválida");
    return NextResponse.json(
      { error: "Serviço de notificação indisponível" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Não autorizado" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  if (!token || !safeEqual(token, secret)) {
    console.warn("[SEC-001] Token interno inválido — requisição rejeitada");
    return NextResponse.json(
      { error: "Não autorizado" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Retorna o INTERNAL_API_SECRET válido, ou null se não configurado.
 * Usado pelo push-dispatch para montar o header.
 */
export function getInternalSecret(): string | null {
  const secret = getSecretOrThrow();
  return secret || null;
}

/**
 * Verifica se o INTERNAL_API_SECRET está configurado e é válido.
 * Pode ser usado em inicialização para logar avisos.
 */
export function isInternalAuthConfigured(): boolean {
  return !!getSecretOrThrow();
}