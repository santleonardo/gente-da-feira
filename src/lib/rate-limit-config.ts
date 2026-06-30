/**
 * SEC-005: Configuração centralizada de rate limiting por rota.
 *
 * Cada entrada define:
 *   key:       Identificador único da rota
 *   limit:     Máximo de requisições no window
 *   windowMs:  Janela de tempo em milissegundos
 *   methods:   Quais HTTP methods são limitados (vazio = todos)
 *   byUser:    true = rate limit por user_id; false = por IP
 *   scope:     "global" = todos compartilham o mesmo contador; "per-target" = por alvo (ex: por post_id)
 *
 * Ordem de prioridade: rota mais específica primeiro.
 */

export interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
  methods: string[];
  byUser: boolean;
}

const rules: RateLimitRule[] = [
  // ── Auth (CRITICAL) ────────────────────────────────────────────────
  { key: "auth:get",       limit: 30,  windowMs: 60_000,    methods: ["GET"],    byUser: true  },
  { key: "auth:delete",    limit: 5,   windowMs: 60_000,    methods: ["DELETE"], byUser: true  },
  // UX-001: Forgot password — 3 por hora por IP (anti-abuso + anti-enumeration)
  { key: "auth:forgot",    limit: 3,   windowMs: 3_600_000, methods: ["POST"],   byUser: false },

  // ── Posts (HIGH) ───────────────────────────────────────────────────
  { key: "posts:create",   limit: 10,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "posts:list",     limit: 60,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "posts:delete",   limit: 20,  windowMs: 60_000,  methods: ["DELETE"], byUser: true  },

  // ── Comments (HIGH) ───────────────────────────────────────────────
  { key: "comments:create",  limit: 20,  windowMs: 60_000, methods: ["POST"],   byUser: true  },
  { key: "comments:delete",  limit: 20,  windowMs: 60_000, methods: ["DELETE"], byUser: true  },

  // ── Reactions (MEDIUM) ────────────────────────────────────────────
  { key: "reactions:post",     limit: 30,  windowMs: 60_000, methods: ["POST"], byUser: true  },
  { key: "reactions:comment",  limit: 30,  windowMs: 60_000, methods: ["POST"], byUser: true  },
  { key: "reactions:photo",    limit: 30,  windowMs: 60_000, methods: ["POST"], byUser: true  },
  { key: "reactions:video",    limit: 30,  windowMs: 60_000, methods: ["POST"], byUser: true  },

  // ── DMs (HIGH) ────────────────────────────────────────────────────
  { key: "dm:list",         limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "dm:create",       limit: 10,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "dm:messages:send", limit: 30,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "dm:messages:list", limit: 60,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "dm:message:delete", limit: 20, windowMs: 60_000,  methods: ["DELETE"], byUser: true  },

  // ── Rooms (HIGH) ──────────────────────────────────────────────────
  { key: "rooms:create",     limit: 5,   windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:list",       limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "rooms:delete",     limit: 5,   windowMs: 60_000,  methods: ["DELETE"], byUser: true  },
  { key: "rooms:join",       limit: 10,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:leave",      limit: 10,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:msg:send",   limit: 30,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:msg:list",   limit: 60,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "rooms:members",    limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "rooms:invite",     limit: 15,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:kick",       limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:ban",        limit: 20,  windowMs: 60_000,  methods: ["POST","DELETE"], byUser: true },
  { key: "rooms:promote",    limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "rooms:toggle",     limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },

  // ── Follows (HIGH) ────────────────────────────────────────────────
  { key: "follows:list",     limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "follows:toggle",   limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "follows:remove",   limit: 20,  windowMs: 60_000,  methods: ["DELETE"], byUser: true  },
  { key: "follows:requests", limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "follows:accept",   limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },

  // ── Users / Search (MEDIUM) ───────────────────────────────────────
  { key: "users:search",     limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "users:profile",    limit: 60,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "users:update",     limit: 10,  windowMs: 60_000,  methods: ["PUT"],    byUser: true  },
  { key: "users:posts",      limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "users:avatar",     limit: 5,   windowMs: 60_000,  methods: ["POST"],   byUser: true  },

  // ── Uploads (CRITICAL) ────────────────────────────────────────────
  { key: "upload:image",     limit: 30,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "upload:image:del", limit: 20,  windowMs: 60_000,  methods: ["DELETE"], byUser: true  },
  { key: "upload:audio",     limit: 15,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "upload:video",     limit: 10,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },
  { key: "upload:postimg",   limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },

  // ── Notifications (LOW) ──────────────────────────────────────────
  { key: "notifications:list",  limit: 30, windowMs: 60_000, methods: ["GET"],  byUser: true },
  { key: "notifications:read",  limit: 30, windowMs: 60_000, methods: ["PUT"],  byUser: true },

  // ── Blocks (MEDIUM) ──────────────────────────────────────────────
  { key: "blocks:list",     limit: 30,  windowMs: 60_000,  methods: ["GET"],    byUser: true  },
  { key: "blocks:toggle",   limit: 20,  windowMs: 60_000,  methods: ["POST"],   byUser: true  },

  // ── Push (MEDIUM) ────────────────────────────────────────────────
  { key: "push:subscribe",  limit: 10,  windowMs: 60_000,  methods: ["POST","DELETE"], byUser: true  },

  // ── Profile Photos/Videos (MEDIUM) ───────────────────────────────
  { key: "photos:list",     limit: 30, windowMs: 60_000, methods: ["GET"],    byUser: true },
  { key: "photos:create",   limit: 10, windowMs: 60_000, methods: ["POST"],   byUser: true },
  { key: "photos:delete",   limit: 10, windowMs: 60_000, methods: ["DELETE"], byUser: true },
  { key: "photos:react",    limit: 30, windowMs: 60_000, methods: ["POST"],   byUser: true },
  { key: "photos:comment",  limit: 20, windowMs: 60_000, methods: ["POST"],   byUser: true },
  { key: "videos:list",     limit: 30, windowMs: 60_000, methods: ["GET"],    byUser: true },
  { key: "videos:create",   limit: 5,  windowMs: 60_000, methods: ["POST"],   byUser: true },
  { key: "videos:delete",   limit: 5,  windowMs: 60_000, methods: ["DELETE"], byUser: true },
  { key: "videos:react",    limit: 30, windowMs: 60_000, methods: ["POST"],   byUser: true },
  { key: "videos:comment",  limit: 20, windowMs: 60_000, methods: ["POST"],   byUser: true },

  // ── Post detail/edit (MEDIUM) ────────────────────────────────────
  { key: "post:detail",     limit: 60, windowMs: 60_000, methods: ["GET"],    byUser: true },
  { key: "post:edit",       limit: 10, windowMs: 60_000, methods: ["PATCH"],  byUser: true },

  // ── Account management / LGPD (CRITICAL — low limits) ─────────────
  { key: "account:request-deletion",  limit: 2,   windowMs: 3_600_000, methods: ["POST"],   byUser: true },
  { key: "account:cancel-deletion",   limit: 5,   windowMs: 3_600_000, methods: ["POST"],   byUser: true },
  { key: "account:export",           limit: 3,   windowMs: 3_600_000, methods: ["GET"],    byUser: true },
];

/**
 * Busca a regra de rate limit para uma chave.
 */
export function getRule(key: string): RateLimitRule | undefined {
  return rules.find((r) => r.key === key);
}

/**
 * Retorna todas as regras (para debug/logging).
 */
export function getAllRules(): RateLimitRule[] {
  return [...rules];
}