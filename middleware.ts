import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Rotas internas que usam Bearer token (INTERNAL_API_SECRET) em vez de
// cookies de sessão do Supabase. Não devem passar pela autenticação cookie.
const INTERNAL_BEARER_ROUTES = ["/api/push/send", "/api/account-cleanup"];

// Rotas permitidas para contas com exclusão pendente (LGPD)
const DELETION_ALLOWED_ROUTES = [
  "/api/auth",
  "/api/users/me/cancel-deletion",
  "/api/users/me/export",
];

function isInternalBearerRoute(pathname: string): boolean {
  return INTERNAL_BEARER_ROUTES.some((r) => pathname === r);
}

// ── SEC-005: Global rate limit no middleware ─────────────────────────────
// Limite global por IP: 200 req/min para qualquer origem.
// Isso protege contra DDoS básico e força bruta em todas as rotas.
const globalCounter = new Map<string, { count: number; resetAt: number }>();

function checkGlobalRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = globalCounter.get(ip);

  if (!entry || entry.resetAt < now) {
    globalCounter.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 200) return false;

  entry.count++;
  return true;
}

// Limpeza periódica
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of globalCounter.entries()) {
      if (entry.resetAt < now) globalCounter.delete(key);
    }
  }, 60_000);
}

// ── SEC-005: IP extraction (middleware-safe, sem deps externas) ────────
function getClientIP(req: NextRequest): string {
  const cfIP = req.headers.get("cf-connecting-ip");
  if (cfIP && /^\d{1,3}(\.\d{1,3}){3}$/.test(cfIP)) return cfIP;

  const realIP = req.headers.get("x-real-ip");
  if (realIP && /^\d{1,3}(\.\d{1,3}){3}$/.test(realIP)) return realIP;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && /^\d{1,3}(\.\d{1,3}){3}$/.test(first)) return first;
  }

  return "unknown";
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  // ── SEC-005: Global rate limit (todas as rotas API) ────────────────
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const ip = getClientIP(req);
    if (!checkGlobalRateLimit(ip)) {
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em breve." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Scope": "global",
          },
        }
      );
    }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res;
  }

  // Rotas internas com Bearer token pulam a auth por cookie —
  // elas próprias validam o INTERNAL_API_SECRET (fail-closed).
  if (isInternalBearerRoute(req.nextUrl.pathname)) {
    return res;
  }

  try {
    const { createServerClient } = await import("@supabase/ssr");

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Proteger todas as rotas /api/* — retornar 401 se não autenticado
    // Exceção: /api/auth (login/callback do Supabase)
    const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
    const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

    if (isApiRoute && !isAuthRoute && !user) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }

    // SEC-013: Bloquear contas marcadas para exclusão (LGPD)
    // Verifica app_metadata.deletion_requested_at definido pelo endpoint de exclusão.
    // Rotas permitidas: auth, cancelar exclusão, exportar dados.
    if (user && isApiRoute && !isAuthRoute && user.app_metadata?.deletion_requested_at) {
      const isAllowed = DELETION_ALLOWED_ROUTES.some((r) => req.nextUrl.pathname.startsWith(r));
      if (!isAllowed) {
        return NextResponse.json(
          { error: "Conta marcada para exclusão", deletionPending: true },
          { status: 403 }
        );
      }
    }
  } catch (error) {
    console.error("[middleware] Supabase error:", error);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|icons|images|sw.js|workbox-*.js).*)",
  ],
};