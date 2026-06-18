import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Rotas internas que usam Bearer token (INTERNAL_API_SECRET) em vez de
// cookies de sessão do Supabase. Não devem passar pela autenticação cookie.
const INTERNAL_BEARER_ROUTES = ["/api/push/send"];

function isInternalBearerRoute(pathname: string): boolean {
  return INTERNAL_BEARER_ROUTES.some((r) => pathname === r);
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

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