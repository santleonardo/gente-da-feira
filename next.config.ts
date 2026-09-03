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
  // Tree-shaking / bundle: transforma imports de barrel em imports por módulo.
  // lucide-react e Radix deixam de puxar o pacote inteiro no client bundle.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-label",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "sonner",
      "clsx",
      "class-variance-authority",
    ],
  },
  // All security headers (CSP, HSTS, X-Content-Type-Options, etc.) are
  // now applied dynamically per-request in middleware.ts with nonce-based CSP.
};

export default nextConfig;
