import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PWARegister } from "@/components/gdf/PWARegister";
import "./globals.css";

// Nunito carregada via CSS para evitar fetch em build
const nunito = { variable: "--font-nunito" };

export const metadata: Metadata = {
  title: "Gente da Feira",
  description: "A rede social do seu bairro em Feira de Santana. Converse, publique e conecte-se com vizinhos.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/icons/icon-maskable-192.png",
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
  themeColor: "#0A4D5C",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={nunito.variable}>
      <head>
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors />
          <PWARegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
