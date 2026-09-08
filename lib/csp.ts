// SEC-012 fix: o middleware.ts roda no Edge Runtime, que não suporta o
// módulo "crypto" do Node (import crypto from "crypto"). Usamos a Web
// Crypto API (globalThis.crypto), que é padrão web e funciona tanto no
// Edge Runtime quanto no Node 20+ e no navegador.

/**
 * SEC-012: Content Security Policy — Nonce-based CSP utility.
 *
 * Generates a cryptographically secure nonce per request and builds
 * a restrictive CSP policy that eliminates 'unsafe-inline' and
 * 'unsafe-eval' from script-src.
 *
 * NOTE on style-src 'unsafe-inline':
 * React's style={{}} prop generates inline style="" HTML attributes.
 * These are required by 50+ component instances across the app and
 * CANNOT receive nonce/hash attributes. Removing 'unsafe-inline' from
 * style-src would break all dynamic progress bars, color pickers,
 * font selectors, and layout components.
 *
 * CSS injection via style="" attributes is NOT a script execution
 * vector — it cannot run JavaScript. The critical security fix is
 * eliminating 'unsafe-inline'/'unsafe-eval' from script-src, which
 * fully prevents XSS via script injection.
 */

const NONCE_HEADER = "x-nonce";

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  // Converte os bytes aleatórios para base64 sem depender de Buffer (Node-only)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getNonceHeaderName(): string {
  return NONCE_HEADER;
}

export function buildCSP(nonce: string): string {
  const directives = [
    // Fallback for any resource type not explicitly listed
    "default-src 'self'",

    // SCRIPT: nonce-based — NO unsafe-inline, NO unsafe-eval
    "script-src 'self' 'nonce-" + nonce + "'",

    // STYLE: 'self' for app CSS, 'unsafe-inline' for React style={{}} props,
    // Google Fonts CSS for dynamically loaded editor fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // IMAGES: self, data URIs (avatars/fallbacks), blob (local previews),
    // Supabase Storage for user-uploaded content
    "img-src 'self' data: blob: https://*.supabase.co",

    // FONTS: self, data URIs, Google Fonts static files (woff2/woff/ttf)
    "font-src 'self' data: https://fonts.gstatic.com",

    // CONNECT: fetch/XHR/WebSocket — self (API routes), Supabase REST/Realtime
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",

    // MEDIA: audio/video — self, blob (local recordings/previews),
    // Supabase Storage for uploaded media
    "media-src 'self' blob: https://*.supabase.co",

    // WORKER: Service Worker and dedicated workers from self + blob
    "worker-src 'self' blob:",

    // MANIFEST: PWA manifest from self
    "manifest-src 'self'",

    // BLOCK: plugins, Flash, Java applets
    "object-src 'none'",

    // BLOCK: <base> tag injection
    "base-uri 'self'",

    // RESTRICT: form submissions to same origin
    "form-action 'self'",

    // BLOCK: framing — prevent clickjacking
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}

/**
 * Builds the CSP-Report-Only variant (same policy, non-enforcing).
 * Useful for staging/validation before switching to enforce mode.
 */
export function buildCSPReportOnly(nonce: string): string {
  return buildCSP(nonce);
}

/**
 * Additional security headers applied to every response.
 */
export function getSecurityHeaders(
  nonce: string,
  isReportOnly: boolean = false
): Record<string, string> {
  const cspValue = isReportOnly ? buildCSPReportOnly(nonce) : buildCSP(nonce);
  const cspHeaderName = isReportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  return {
    // Content Security Policy (nonce-based, no unsafe-inline/eval in script-src)
    [cspHeaderName]: cspValue,

    // Prevent MIME type sniffing
    "X-Content-Type-Options": "nosniff",

    // Prevent clickjacking (defense-in-depth with frame-ancestors)
    "X-Frame-Options": "DENY",

    // Control referrer information leakage
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Restrict browser features (only camera/mic for self, no geolocation)
    "Permissions-Policy":
      "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",

    // Cross-origin isolation headers (when compatible)
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",

    // HSTS — only in production HTTPS environments
    // Vercel handles HTTPS termination, so we set this unconditionally
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  };
}
