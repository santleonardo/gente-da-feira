/**
 * SEC-005: Identificação segura da origem da requisição.
 *
 * Para usuários autenticados: rate limit por user_id.
 * Para visitantes: rate limit por IP (com sanitização).
 *
 * Não confia exclusivamente em X-Forwarded-For (pode ser spoofado pelo cliente).
 * Usa múltiplas fontes com prioridade.
 */

import { NextRequest } from "next/server";

/**
 * Extrai um IP confiável da requisição.
 * Prioridade: CF-Connecting-IP (Cloudflare) > X-Real-IP > X-Forwarded-For (primeiro) > conexao remota
 */
export function getClientIP(req: NextRequest): string {
  // req.ip — detectado pela própria infraestrutura da Vercel na conexão
  // TCP. É a ÚNICA fonte que o cliente não pode forjar via headers, por
  // isso vem primeiro. Sem isso, "cf-connecting-ip" (útil só se houver
  // Cloudflare na frente, o que não é o caso deste deploy em vercel.app)
  // podia ser mandado pelo próprio atacante e furar o rate limit por IP.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vercelIP = (req as any)?.ip;
  if (vercelIP && typeof vercelIP === "string" && isValidIP(vercelIP)) return vercelIP;

  // Cloudflare — só é confiável se o app estiver de fato atrás do Cloudflare.
  const cfIP = req.headers.get("cf-connecting-ip");
  if (cfIP && isValidIP(cfIP)) return cfIP;

  // X-Real-IP — geralmente setado pelo reverse proxy
  const realIP = req.headers.get("x-real-ip");
  if (realIP && isValidIP(realIP)) return realIP;

  // X-Forwarded-For — pegar apenas o PRIMEIRO IP (mais próximo do proxy de borda)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIP = forwarded.split(",")[0]?.trim();
    if (firstIP && isValidIP(firstIP)) return firstIP;
  }

  return "unknown";
}

function isValidIP(ip: string): boolean {
  if (ip.length > 45 || ip.length < 7) return false;
  // Rejeitar IPs com caracteres suspeitos (injection)
  if (/[;'"\s\\]/.test(ip)) return false;
  // Formato IPv4 básico
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  // Formato IPv6 básico
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) return true;
  return false;
}

/**
 * Extrai o identificador do Supabase session token se disponível.
 * Não valida — apenas extrai para usar como parte da chave de rate limit.
 */
export function getSessionHint(req: NextRequest): string {
  // O token do Supabase está no cookie
  const cookies = req.cookies.getAll();
  for (const cookie of cookies) {
    if (cookie.name.includes("sb-") && cookie.name.endsWith("-auth-token")) {
      // Hash os primeiros 16 chars do token para usar como hint
      const val = cookie.value.slice(0, 16);
      // Simple hash
      let hash = 0;
      for (let i = 0; i < val.length; i++) {
        hash = ((hash << 5) - hash + val.charCodeAt(i)) | 0;
      }
      return `sess:${Math.abs(hash).toString(36)}`;
    }
  }
  return "";
}

/**
 * Identifica a requisição para rate limiting.
 * Retorna uma chave única para a origem.
 *
 * @param req - A requisição Next.js
 * @param userId - Se disponível (após auth check), usa user_id
 * @param suffix - Sufixo adicional para diferenciar ações (ex: "post", "comment")
 */
export function identifyRequest(
  req: NextRequest,
  userId?: string | null,
  suffix?: string
): string {
  const parts: string[] = [];

  if (userId) {
    parts.push(`u:${userId}`);
  } else {
    const ip = getClientIP(req);
    const sessionHint = getSessionHint(req);
    if (sessionHint) {
      parts.push(sessionHint);
    } else {
      parts.push(`ip:${ip}`);
    }
  }

  if (suffix) parts.push(suffix);

  return parts.join(":");
}