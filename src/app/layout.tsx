import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gente da Feira — Cadastro",
  description:
    "A rede social do seu bairro em Feira de Santana. Crie sua conta e conecte-se com a sua vizinhança.",
  keywords: [
    "Gente da Feira",
    "Feira de Santana",
    "rede social",
    "bairro",
    "vizinhança",
    "cadastro",
  ],
  authors: [{ name: "Gente da Feira" }],
  openGraph: {
    title: "Gente da Feira — Cadastro",
    description:
      "A rede social do seu bairro em Feira de Santana.",
    siteName: "Gente da Feira",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gente da Feira — Cadastro",
    description: "A rede social do seu bairro em Feira de Santana.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
