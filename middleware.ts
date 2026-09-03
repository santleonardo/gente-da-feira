import { NextRequest, NextResponse } from "next/server";
import {
  generateNonce,
  getNonceHeaderName,
  getSecurityHeaders,
} from "@/lib/csp";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// CSP violation report endpoint (same origin)
const CSP_REPORT_URI = "/api/csp-report";

/** Remove cookies de sessão Supabase inválidos (refresh token morto). */
function clearSupabaseAuthCookies(req: NextRequest, res: NextResponse) {
  const all = req.cookies.getAll();
  for (const { name } of all) {
    // sb-<project-ref>-auth-token, chunks, code-verifier, etc.
    if (
      name.startsWith("sb-") ||
      name.includes("supabase") ||
      name.startsWith("supabase-")
    ) {
      res.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      try {
        req.cookies.set(name, "");
      } catch {
        /* ignore */
      }
    }
  }
}

function isStaleRefreshError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; status?: number };
  const code = String(e.code || "");
  const message = String(e.message || "");
  return (
    code === "refresh_token_not_found" ||
    code === "session_not_found" ||
    message.includes("Refresh Token Not Found") ||
    message.includes("Invalid Refresh Token")
  );
}

export async function middleware(req: NextRequest) {
  const nonce = generateNonce();
  const nonceHeaderName = getNonceHeaderName();

  // ── Propagate nonce to downstream server components via request header ──
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(nonceHeaderName, nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // ── Apply security headers to every response ──
  const securityHeaders = getSecurityHeaders(nonce);

  // Append report-uri to the CSP (both enforcing and report-only)
  const cspKey =
    "Content-Security-Policy" in securityHeaders
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";
  securityHeaders[cspKey] += `; report-uri ${CSP_REPORT_URI}`;

  for (const [key, value] of Object.entries(securityHeaders)) {
    res.headers.set(key, value);
  }

  // ── Supabase SSR auth ──
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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
      error: authError,
    } = await supabase.auth.getUser();

    // Sessão morta no cookie (refresh revogado/expirado) → limpa e segue como visitante
    if (authError && isStaleRefreshError(authError)) {
      clearSupabaseAuthCookies(req, res);
      // não logar como error — é esperado após logout em outro device / token antigo
    } else if (authError) {
      console.warn("[middleware] auth.getUser:", authError.message || authError);
    }

    // Protect all /api/* routes — return 401 if not authenticated
    // Exceptions:
    //   - /api/auth
    //   - /api/csp-report
    //   - /api/push/send — Bearer INTERNAL_API_SECRET
    //   - /api/account-cleanup — Bearer INTERNAL_API_SECRET
    //   - /api/cron/* e /api/internal/* — Vercel Cron / jobs internos
    const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
    const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
    const isCspReportRoute =
      req.nextUrl.pathname.startsWith("/api/csp-report");
    const isInternalRoute =
      req.nextUrl.pathname.startsWith("/api/push/send") ||
      req.nextUrl.pathname.startsWith("/api/account-cleanup") ||
      req.nextUrl.pathname.startsWith("/api/cron/") ||
      req.nextUrl.pathname.startsWith("/api/internal/");

    if (
      isApiRoute &&
      !isAuthRoute &&
      !isCspReportRoute &&
      !isInternalRoute &&
      !user
    ) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }
  } catch (error) {
    if (isStaleRefreshError(error)) {
      clearSupabaseAuthCookies(req, res);
    } else {
      console.error("[middleware] Supabase error:", error);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|icons|images|sw.js|workbox-*.js).*)",
  ],
};
