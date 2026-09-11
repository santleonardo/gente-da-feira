"use client";

import { useState, useEffect, useRef } from "react";
import { X, User } from "lucide-react";
import { LazyImage } from "./LazyImage";
import {
  requestElementFullscreen,
  exitDocumentFullscreen,
  isDocumentFullscreen,
} from "@/lib/fullscreen";

/** Botão circular translúcido (setas / fechar) */
const iconBtn =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
  "bg-black/55 text-white backdrop-blur-sm shadow-lg " +
  "transition-colors hover:bg-[#f7f75e] hover:text-[#1A1A1A] " +
  "active:scale-95";

const navBtn =
  "absolute top-1/2 z-20 -translate-y-1/2 " +
  "flex h-11 w-11 items-center justify-center rounded-full " +
  "bg-white/15 text-2xl text-white " +
  "transition-colors hover:bg-[#f7f75e] hover:text-[#1A1A1A]";

/**
 * Visualizador de fotos (lightbox).
 * CTA "Usar como foto de perfil" no rodapé quando `onSetAsProfilePhoto` é passado.
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

  const showProfileCta = typeof onSetAsProfilePhoto === "function";
  const multi = photos.length > 1;

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
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      exitDocumentFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (enteredFullscreen.current && !isDocumentFullscreen()) onClose();
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
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
      const n = i + dir;
      if (n < 0) return photos.length - 1;
      if (n >= photos.length) return 0;
      return n;
    });
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleSetProfile = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSetAsProfilePhoto || setAsProfileLoading) return;
    onSetAsProfilePhoto(photos[currentIndex]);
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black"
    >
      {/* Imagem central */}
      <div
        className={
          "absolute inset-0 flex items-center justify-center " +
          (showProfileCta ? "pt-12 pb-24" : "pt-12 pb-14")
        }
        onClick={stop}
        onTouchStart={(e) => {
          touchStartX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null || !multi) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) < 50) return;
          go(dx > 0 ? -1 : 1);
        }}
      >
        <LazyImage
          key={photos[currentIndex]}
          src={photos[currentIndex]}
          alt={`Foto ${currentIndex + 1} de ${photos.length}`}
          draggable={false}
          priority
          skeleton={false}
          className="max-h-full max-w-full select-none object-contain"
        />
        {/* Pré-carrega anterior/próxima em background */}
        {multi &&
          [1, -1].map((dir) => {
            const i = (currentIndex + dir + photos.length) % photos.length;
            if (i === currentIndex) return null;
            return (
              <img
                key={`preload-${i}`}
                src={photos[i]}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="pointer-events-none absolute h-0 w-0 opacity-0"
              />
            );
          })}
      </div>

      {/* Barra superior */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        onClick={stop}
      >
        <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold tabular-nums text-white/95 backdrop-blur-sm">
          {multi ? `${currentIndex + 1} / ${photos.length}` : "Foto"}
        </span>
        <button type="button" onClick={onClose} className={iconBtn} aria-label="Fechar">
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Setas */}
      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              go(-1);
            }}
            className={`${navBtn} left-2`}
            aria-label="Foto anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              go(1);
            }}
            className={`${navBtn} right-2`}
            aria-label="Próxima foto"
          >
            ›
          </button>
        </>
      )}

      {/* Indicadores */}
      {multi && photos.length <= 12 && (
        <div
          className={
            "pointer-events-none absolute inset-x-0 z-20 flex justify-center gap-1.5 " +
            (showProfileCta
              ? "bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))]"
              : "bottom-[max(1.5rem,env(safe-area-inset-bottom))]")
          }
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para foto ${i + 1}`}
              onClick={(e) => {
                stop(e);
                setCurrentIndex(i);
              }}
              className={
                "pointer-events-auto h-1.5 rounded-full transition-all " +
                (i === currentIndex ? "w-5 bg-[#f7f75e]" : "w-1.5 bg-white/35")
              }
            />
          ))}
        </div>
      )}

      {/* CTA — foto de perfil */}
      {showProfileCta && (
        <div
          className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 px-4"
          onClick={stop}
        >
          <button
            type="button"
            disabled={setAsProfileLoading}
            onClick={handleSetProfile}
            onPointerDown={stop}
            aria-label="Usar como foto de perfil"
            className={
              "flex w-full items-center justify-center gap-2.5 rounded-2xl " +
              "bg-[#f7f75e] px-4 py-3.5 text-base font-bold text-[#1A1A1A] " +
              "shadow-lg ring-2 ring-white/40 " +
              "transition active:scale-[0.98] " +
              "disabled:pointer-events-none disabled:opacity-70"
            }
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
