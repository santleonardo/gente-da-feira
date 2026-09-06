"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Visualizador de fotos (lightbox) compartilhado.
 *
 * Renderiza via portal em document.body para garantir tela cheia de verdade
 * no mobile. Sem portal, o `position: fixed` fica relativo a ancestrais com
 * transform (ex.: .animate-tab-in) ou overflow/max-width do shell, e a
 * "caixinha preta" aparece desalinhada / não ocupa a tela inteira.
 */
export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[200] bg-black"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        zIndex: 200,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos"
      onClick={onClose}
    >
      {/* Foto em tela inteira */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
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
          style={{
            maxHeight: "100%",
            maxWidth: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
          draggable={false}
        />
      </div>

      {/* Contador */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="rounded-full bg-black/40 px-3 py-1 text-sm text-white/90 tabular-nums font-medium backdrop-blur-sm">
          {photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : "Foto"}
        </span>
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
            className="absolute left-2 top-1/2 -translate-y-1/2 sm:left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors text-2xl"
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
            className="absolute right-2 top-1/2 -translate-y-1/2 sm:right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors text-2xl"
            aria-label="Próxima foto"
          >
            ›
          </button>
        </>
      )}

      {/* Pontinhos */}
      {photos.length > 1 && photos.length <= 12 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
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
                i === currentIndex ? "w-5 bg-[#f7f75e]" : "w-1.5 bg-white/35 hover:bg-white/55"
              }`}
            />
          ))}
        </div>
      )}

      {/* Fechar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors shadow-lg"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  return createPortal(content, document.body);
}
