/**
 * Rate Limiting — SEC-005 Hardened
 *
 * Arquitetura:
 *   - Upstash Redis (sliding window) em produção — principal
 *   - In-memory fallback em dev — MAIS RESTRITIVO (fail-closed)
 *   - Se Redis falhar em produção → fallback in-memory com limites 50% menores
 *
 * SETUP (uma vez só):
 *   1. Crie conta em https://upstash.com (free tier: 10k req/dia)
 *   2. Crie um banco Redis e copie as credenciais
 *   3. npm install @upstash/ratelimit @upstash/redis
 *   4. Adicione ao .env.local:
 *        UPSTASH_REDIS_REST_URL=https://...upstash.io
 *        UPSTASH_REDIS_REST_TOKEN=...
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // timestamp Unix em ms
  limit: number;
}

// ─── Fallback in-memory ─────────────────────────────────────────────────────

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) memoryStore.delete(key);
    }
  }, 60_000);
}

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, limit };
}

// ─── Upstash Redis ──────────────────────────────────────────────────────────

type UpstashLimiter = {
  limit: (key: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

let redisLimiterCache = new Map<string, UpstashLimiter | null>();
let redisInitError = false;
let _warnedNoRedisConfig = false;

async function getRedisLimiter(limit: number, windowMs: number): Promise<UpstashLimiter | null> {
  const cacheKey = `${limit}:${windowMs}`;
  if (redisLimiterCache.has(cacheKey)) return redisLimiterCache.get(cacheKey) ?? null;
  if (redisInitError) return null;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis }     = await import("@upstash/redis");

    const redis = new Redis({ url, token });

    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
      analytics: false,
      prefix: "gdf_rl",
    });

    redisLimiterCache.set(cacheKey, limiter);
    return limiter;
  } catch (err) {
    console.error("[rate-limit] Falha ao inicializar Upstash Redis:", err);
    redisInitError = true;
    return null;
  }
}

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * Verifica rate limit para uma chave.
 * Usa Redis em produção (quando as env vars existem), in-memory em dev.
 *
 * SEC-005: Em produção, se o Redis estiver configurado mas falhar,
 * retorna allow=false após 2 tentativas (fail-closed).
 */
export async function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === "production";
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Se as vars estão configuradas, tenta Redis
  if (url && token) {
    const limiter = await getRedisLimiter(limit, windowMs);

    if (limiter) {
      try {
        const result = await limiter.limit(key);
        return {
          allowed: result.success,
          remaining: result.remaining,
          resetAt: result.reset,
          limit,
        };
      } catch (err) {
        console.error("[rate-limit] Redis error:", err);
        // Fail-closed em produção: Redis configurado mas com falha → bloquear
        if (isProduction) {
          return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs, limit };
        }
      }
    } else if (isProduction) {
      // Redis configurado mas falhou na inicialização → bloquear
      return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs, limit };
    }
  } else if (isProduction && !_warnedNoRedisConfig) {
    // SEC-005: Redis NUNCA foi configurado em produção. Isso não é "falha"
    // (não há fail-closed pra isso acima), então cai silenciosamente pro
    // fallback in-memory — que em serverless (Vercel) é por instância e
    // na prática não limita quase nada entre invocações diferentes.
    // Avisa uma vez por processo pra não passar despercebido.
    console.error(
      "[rate-limit] AVISO: rodando em produção sem UPSTASH_REDIS_REST_URL/TOKEN configurados. " +
      "O rate limiting está usando o fallback in-memory, que é POR INSTÂNCIA em ambientes " +
      "serverless e NÃO protege de forma confiável contra abuso. Configure o Upstash Redis."
    );
    _warnedNoRedisConfig = true;
  }

  // Fallback in-memory (dev ou quando Redis não está configurado)
  return checkInMemory(key, limit, windowMs);
}

/**
 * Resposta HTTP 429 padronizada com cabeçalhos informativos.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  message = "Muitas requisições. Tente novamente em breve."
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
    },
  });
}