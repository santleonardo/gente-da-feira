"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { TERMS_OF_USE, TERMS_VERSION, TERMS_DATE } from "@/lib/constants";

type TermsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept?: () => void;
  /** Ao abrir, rola direto até a seção de Privacidade (LGPD) em vez do topo. */
  initialSection?: "privacy";
};

// PERF-001: react-markdown (~80kB) + remark-gfm carregados sob demanda
// apenas quando o dialog de termos é aberto. No caminho normal de
// cadastro, esse chunk só é baixado após o primeiro render.
const TermsContent = React.lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);
  return {
    default: function TermsContentInner() {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {TERMS_OF_USE}
        </ReactMarkdown>
      );
    },
  };
});

/**
 * Diálogo de leitura dos Termos de Uso da Gente da Feira.
 * Renderiza o documento em markdown (com suporte a tabelas via remark-gfm)
 * dentro de uma área rolável, com cabeçalho e rodapé fixos.
 */
export function TermsDialog({ open, onOpenChange, onAccept, initialSection }: TermsDialogProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Ao (re)abrir o diálogo: volta ao topo, ou pula direto para a seção de
  // Privacidade quando aberto a partir do link "Política de Privacidade".
  React.useEffect(() => {
    if (!open || !scrollRef.current) return;
    if (initialSection === "privacy") {
      // Aguarda o chunk de markdown (lazy) renderizar antes de procurar o heading.
      const el = scrollRef.current;
      let cancelled = false;
      const tryScroll = (attempt = 0) => {
        if (cancelled) return;
        const heading = Array.from(el.querySelectorAll("h2")).find((h) =>
          h.textContent?.includes("Privacidade")
        );
        if (heading) {
          heading.scrollIntoView({ block: "start" });
        } else if (attempt < 20) {
          setTimeout(() => tryScroll(attempt + 1), 100);
        }
      };
      tryScroll();
      return () => {
        cancelled = true;
      };
    }
    scrollRef.current.scrollTo({ top: 0 });
  }, [open, initialSection]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby="terms-desc"
      >
        <DialogHeader className="space-y-1.5 border-b border-border/70 bg-primary/5 px-6 py-5 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight">
                {initialSection === "privacy"
                  ? "Política de Privacidade — Gente da Feira"
                  : "Termos de Uso — Gente da Feira"}
              </DialogTitle>
              <DialogDescription id="terms-desc" className="text-xs">
                {initialSection === "privacy"
                  ? "Parte dos Termos de Uso (Seção 10 — LGPD) · "
                  : ""}
                Versão {TERMS_VERSION} · Elaborada em {TERMS_DATE}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--ring)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ring/40 [&::-webkit-scrollbar-thumb:hover]:bg-ring [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <article>
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Carregando termos...
                </div>
              }
            >
              <TermsContent />
            </React.Suspense>
          </article>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/70 bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          {onAccept && (
            <Button
              type="button"
              onClick={() => {
                onAccept();
                onOpenChange(false);
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              Li e aceito os Termos
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mapeamento de elementos markdown -> classes Tailwind.
 * Mantém uma tipografia jurídica legível e consistente com o tema teal.
 * ────────────────────────────────────────────────────────────────────────── */
const mdComponents = {
  h1: ({ node, ...props }: any) => (
    <h1
      className="mb-3 mt-1 text-2xl font-bold tracking-tight text-foreground"
      {...props}
    />
  ),
  h2: ({ node, ...props }: any) => (
    <h2
      className="mb-2 mt-7 border-b border-border/60 pb-1 text-lg font-semibold text-foreground"
      {...props}
    />
  ),
  h3: ({ node, ...props }: any) => (
    <h3
      className="mb-1.5 mt-4 text-base font-semibold text-foreground"
      {...props}
    />
  ),
  p: ({ node, ...props }: any) => (
    <p className="mb-3 leading-relaxed text-sm text-foreground/90" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul
      className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-foreground/90 marker:text-primary"
      {...props}
    />
  ),
  ol: ({ node, ...props }: any) => (
    <ol
      className="mb-3 ml-5 list-decimal space-y-1.5 text-sm text-foreground/90 marker:font-semibold marker:text-primary"
      {...props}
    />
  ),
  li: ({ node, ...props }: any) => (
    <li className="leading-relaxed pl-1" {...props} />
  ),
  strong: ({ node, ...props }: any) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: ({ node, ...props }: any) => (
    <em className="italic text-muted-foreground" {...props} />
  ),
  a: ({ node, ...props }: any) => (
    <a
      className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  hr: () => <hr className="my-5 border-border/60" />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote
      className="my-4 rounded-r-md border-l-4 border-primary/60 bg-primary/5 px-4 py-2.5 text-sm text-foreground/90"
      {...props}
    />
  ),
  table: ({ node, ...props }: any) => (
    <div className="my-4 overflow-x-auto rounded-md border border-border/70">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: any) => (
    <thead className="bg-muted/60" {...props} />
  ),
  th: ({ node, ...props }: any) => (
    <th
      className="border-b border-border/70 px-3 py-2 text-left font-semibold text-foreground"
      {...props}
    />
  ),
  td: ({ node, ...props }: any) => (
    <td
      className="border-b border-border/40 px-3 py-2 align-top text-foreground/90"
      {...props}
    />
  ),
  code: ({ node, ...props }: any) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground"
      {...props}
    />
  ),
} as const;