import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PWARegisterLoader } from "@/components/gdf/PWARegisterLoader";
import { SiteJsonLd } from "@/components/gdf/SiteJsonLd";
import { getNonceHeaderName } from "@/lib/csp";
import {
  getSiteUrl,
  SITE_DESCRIPTION_SHORT,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";
import "./globals.css";

// Nunito carregada via CSS para evitar fetch em build
const nunito = { variable: "--font-nunito" };

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} — Rede social de Feira de Santana`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  keywords: [
    "Gente da Feira",
    "Feira de Santana",
    "rede social",
    "bairro",
    "Bahia",
    "vizinhos",
    "salas de conversa",
    "rede social local",
  ],
  authors: [{ name: SITE_NAME, url: siteUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "social",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
    shortcut: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION_SHORT,
    url: siteUrl,
    siteName: SITE_NAME,
    locale: "pt_BR",
    type: "website",
    // Substitua por /og.png 1200×630 quando tiver arte dedicada
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION_SHORT,
    images: ["/icon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1A1A1A",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read nonce set by middleware — Next.js uses this to automatically
  // add nonce attributes to all framework-injected <script> tags
  const headersList = await headers();
  const nonce = headersList.get(getNonceHeaderName()) || "";

  return (
    <html lang="pt-BR" suppressHydrationWarning className={nunito.variable}>
      <head>
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body className="antialiased">
        <SiteJsonLd />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          themes={["light"]}
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster position="top-center" richColors />
          <PWARegisterLoader />
        </ThemeProvider>
      </body>
    </html>
  );
}
