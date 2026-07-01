/**
 * SEC-005: Helper centralized para aplicar rate limiting em Route Handlers.
 *
 * Uso:
 *   import { rateLimitByRule } from "@/lib/apply-rate-limit";
 *
 *   export async function POST(req: NextRequest) {
 *     const blocked = await rateLimitByRule(req, "posts:create", userId);
 *     if (blocked) return blocked;
 *     // ... handler
 *   }
 *
 * O userId é opcional — se omitido, rate limita por IP.
 * Se userId é fornecido, rate limita por user_id.
 */

import { NextRequest } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { identifyRequest } from "@/lib/request-identity";
import { getRule } from "@/lib/rate-limit-config";

/**
 * Aplica rate limiting baseado em uma regra nomeada do config.
 *
 * @param req     - A requisição Next.js
 * @param ruleKey - Chave da regra em rate-limit-config.ts
 * @param userId  - ID do usuário autenticado (opcional)
 * @param extra   - Sufixo adicional para a chave (ex: targetId para per-target limits)
 * @returns Response 429 se bloqueado, ou null se permitido
 */
export async function rateLimitByRule(
  req: NextRequest,
  ruleKey: string,
  userId?: string | null,
  extra?: string
): Promise<Response | null> {
  const rule = getRule(ruleKey);
  if (!rule) return null; // Sem regra = sem limitação

  // Verificar se o method atual está na lista de methods da regra
  const method = req.method.toUpperCase();
  if (rule.methods.length > 0 && !rule.methods.includes(method)) {
    return null;
  }

  const suffix = extra ? `${rule.key}:${extra}` : rule.key;
  const identity = identifyRequest(req, rule.byUser ? userId : undefined, suffix);

  const result = await checkRateLimit(identity, rule.limit, rule.windowMs);

  if (!result.allowed) {
    return rateLimitResponse(result);
  }

  return null;
}

/**
 * Aplica rate limiting genérico (para rotas sem regra no config).
 *
 * @deprecated Prefira rateLimitByRule com regra nomeada.
 */
export async function applyRateLimit(
  req: NextRequest,
  limit = 20,
  windowMs = 60_000,
  userId?: string | null
): Promise<Response | null> {
  const identity = identifyRequest(req, userId, "generic");
  const result = await checkRateLimit(identity, limit, windowMs);

  if (!result.allowed) {
    return rateLimitResponse(result);
  }

  return null;
}