import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  // All security headers (CSP, HSTS, X-Content-Type-Options, etc.) are
  // now applied dynamically per-request in middleware.ts with nonce-based CSP.
  // Static headers in next.config.ts cannot use nonces — middleware is required.
};

export default nextConfig;