import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PWARegisterLoader } from "@/components/gdf/PWARegisterLoader";
import { getNonceHeaderName } from "@/lib/csp";
import "./globals.css";

// Nunito carregada via CSS para evitar fetch em build
const nunito = { variable: "--font-nunito" };

export const metadata: Metadata = {
  title: "Gente da Feira",
  description: "A rede social do seu bairro em Feira de Santana. Converse, publique e conecte-se com vizinhos.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Gente da Feira",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Gente da Feira",
    description: "A rede social do seu bairro em Feira de Santana",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Gente da Feira",
    description: "A rede social do seu bairro em Feira de Santana",
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
