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
    } = await supabase.auth.getUser();

    // Protect all /api/* routes — return 401 if not authenticated
    // Exceptions:
    //   - /api/auth (Supabase login/callback) — no session yet
    //   - /api/csp-report — browser-sent, no session
    //   - /api/push/send — internal server-to-server call (push-dispatch.ts),
    //     authenticated via Authorization: Bearer <INTERNAL_API_SECRET>, never
    //     carries a Supabase session cookie. validateInternalAuth() inside the
    //     route is the real (fail-closed) gate for this one.
    //   - /api/account-cleanup — internal call from Postgres (pg_net.http_post,
    //     see sec013_schedule_http_cleanup), same story: no cookies, secured by
    //     validateInternalAuth() inside the route.
    // Without these exceptions this middleware 401s both routes before they
    // ever run, which silently breaks push notifications and the LGPD account
    // deletion storage/auth cleanup — the session check simply isn't the right
    // gate for machine-to-machine calls that use their own secret.
    const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
    const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
    const isCspReportRoute =
      req.nextUrl.pathname.startsWith("/api/csp-report");
    const isInternalRoute =
      req.nextUrl.pathname.startsWith("/api/push/send") ||
      req.nextUrl.pathname.startsWith("/api/account-cleanup");

    if (isApiRoute && !isAuthRoute && !isCspReportRoute && !isInternalRoute && !user) {
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