import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Legal",
  description: `Informações legais e documentação da ${SITE_NAME}.`,
  robots: { index: true, follow: true },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A]">
      <header className="border-b border-black/[0.06] bg-[#F9F8F6]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 sm:px-6 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2 min-w-0 hover:opacity-90 transition-opacity"
          >
            <img
              src="/brand/logo.png"
              alt={SITE_NAME}
              className="h-8 w-auto"
            />
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.14em] text-[#4A4A4A]/50">
              Legal
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2 text-xs font-semibold">
            <Link
              href="/legal/funcionalidades"
              className="rounded-full px-2.5 py-1.5 text-[#1A1A1A] hover:bg-black/[0.04] transition-colors"
            >
              Funcionalidades
            </Link>
            <Link
              href="/"
              className="rounded-full px-2.5 py-1.5 text-[#4A4A4A]/70 hover:bg-black/[0.04] transition-colors"
            >
              Voltar ao app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 pb-20">
        {children}
      </main>
      <footer className="border-t border-black/[0.06] py-6 text-center text-[11px] text-[#4A4A4A]/55">
        © {new Date().getFullYear()} {SITE_NAME} · Feira de Santana, BA
      </footer>
    </div>
  );
}
