"use client";

import { useState, useEffect, useRef } from "react";
import { X, User } from "lucide-react";

// ── Fullscreen API (com fallbacks de prefixo) ──
// Em iOS Safari a API não existe pra elementos comuns — o request falha
// e o viewer segue como overlay cobrindo 100% da tela.
function requestElementFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as any;
  const fn: (() => Promise<void>) | undefined =
    el.requestFullscreen?.bind(el) ||
    anyEl.webkitRequestFullscreen?.bind(anyEl) ||
    anyEl.msRequestFullscreen?.bind(anyEl);
  return fn ? fn() : Promise.reject(new Error("Fullscreen API indisponível"));
}

function exitDocumentFullscreen(): Promise<void> {
  const anyDoc = document as any;
  const fullscreenEl =
    document.fullscreenElement ||
    anyDoc.webkitFullscreenElement ||
    anyDoc.msFullscreenElement;
  if (!fullscreenEl) return Promise.resolve();
  const fn: (() => Promise<void>) | undefined =
    document.exitFullscreen?.bind(document) ||
    anyDoc.webkitExitFullscreen?.bind(anyDoc) ||
    anyDoc.msExitFullscreen?.bind(anyDoc);
  return fn ? fn() : Promise.resolve();
}

function isDocumentFullscreen(): boolean {
  const anyDoc = document as any;
  return !!(
    document.fullscreenElement ||
    anyDoc.webkitFullscreenElement ||
    anyDoc.msFullscreenElement
  );
}

/**
 * Visualizador de fotos (lightbox) compartilhado.
 * Quando `onSetAsProfilePhoto` é passado (álbum do próprio usuário),
 * o CTA "Usar como foto de perfil" fica no rodapé (largura total).
 */
export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
  onSetAsProfilePhoto,
  setAsProfileLoading = false,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
  onSetAsProfilePhoto?: (url: string) => void;
  setAsProfileLoading?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const enteredFullscreen = useRef(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (el) {
      requestElementFullscreen(el)
        .then(() => {
          if (cancelled) {
            exitDocumentFullscreen().catch(() => {});
            return;
          }
          enteredFullscreen.current = true;
        })
        .catch(() => {
          /* sem suporte — overlay normal */
        });
    }
    return () => {
      cancelled = true;
      exitDocumentFullscreen().catch(() => {});
    };
  }, []);

  // Só fecha o viewer se nós tivermos entrado em fullscreen e o usuário saiu
  // pelo controle nativo. Evita fechar logo ao abrir quando o browser recusa FS.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (enteredFullscreen.current && !isDocumentFullscreen()) {
        onClose();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, photos.length]);

  const go = (dir: -1 | 1) => {
    setCurrentIndex((i) => {
      const next = i + dir;
      if (next < 0) return photos.length - 1;
      if (next >= photos.length) return 0;
      return next;
    });
  };

  const handleSetProfile = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSetAsProfilePhoto || setAsProfileLoading) return;
    onSetAsProfilePhoto(photos[currentIndex]);
  };

  const showProfileCta = typeof onSetAsProfilePhoto === "function";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos"
      onClick={onClose}
    >
      {/* Foto */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          // Reserva espaço para barra superior + CTA inferior
          paddingTop: 48,
          paddingBottom: showProfileCta ? 96 : 56,
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null || photos.length < 2) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) < 50) return;
          go(dx > 0 ? -1 : 1);
        }}
      >
        <img
          key={photos[currentIndex]}
          src={photos[currentIndex]}
          alt={`Foto ${currentIndex + 1} de ${photos.length}`}
          className="max-h-full max-w-full object-contain select-none"
          style={{ maxHeight: "100%", maxWidth: "100%", width: "auto", height: "auto" }}
          draggable={false}
        />
      </div>

      {/* ── Barra superior: contador + fechar ── */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold tabular-nums text-white/95 backdrop-blur-sm">
          {photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : "Foto"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors shadow-lg"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>


      {/* Setas */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white text-2xl hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors"
            aria-label="Foto anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white text-2xl hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors"
            aria-label="Próxima foto"
          >
            ›
          </button>
        </>
      )}

      {/* Pontinhos — acima do CTA inferior */}
      {photos.length > 1 && photos.length <= 12 && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center gap-1.5"
          style={{
            bottom: showProfileCta
              ? "max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))"
              : "max(1.5rem, env(safe-area-inset-bottom))",
          }}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para foto ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(i);
              }}
              className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                i === currentIndex ? "w-5 bg-[#f7f75e]" : "w-1.5 bg-white/35"
              }`}
            />
          ))}
        </div>
      )}

      {/* ── CTA inferior (largura total, difícil de não ver) ── */}
      {showProfileCta && (
        <div
          className="absolute inset-x-0 z-30 px-4"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={setAsProfileLoading}
            onClick={handleSetProfile}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#f7f75e] px-4 py-3.5 text-base font-bold text-[#1A1A1A] shadow-[0_8px_28px_rgba(0,0,0,0.55)] ring-2 ring-white/40 active:scale-[0.98] transition disabled:opacity-70"
            aria-label="Usar como foto de perfil"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10">
              <User className="h-5 w-5" strokeWidth={2.5} />
            </span>
            {setAsProfileLoading
              ? "Definindo foto de perfil…"
              : "Usar como foto de perfil"}
          </button>
        </div>
      )}
    </div>
  );
}
