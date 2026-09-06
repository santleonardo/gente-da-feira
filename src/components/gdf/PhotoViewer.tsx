"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Visualizador de fotos (lightbox) compartilhado.
 *
 * Antes esse componente estava duplicado em 4 arquivos diferentes
 * (FeedView, ProfileView, PostDetailDialog, UserProfileDialog), cada
 * cópia com um bug diferente:
 *  - ProfileView: não tinha botões de próxima/anterior foto quando
 *    havia mais de 12 fotos (só existiam os "pontinhos").
 *  - FeedView: os botões de próxima/anterior só apareciam em telas
 *    "sm" pra cima (`hidden sm:flex`), então em celular sumiam.
 *  - UserProfileDialog: como o viewer abre dentro de um <Dialog>,
 *    o botão de fechar padrão do DialogContent (canto superior
 *    direito) ficava renderizado por baixo, sobreposto ao botão de
 *    fechar do próprio viewer.
 *
 * Esta versão única corrige os três problemas: setas sempre visíveis
 * (em qualquer tamanho de tela), um único botão de fechar, navegação
 * por teclado e swipe.
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
  const touchStartX = useRef<number | null>(null);

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

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a]/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos"
      onClick={onClose}
    >
      {/* Barra superior */}
      <div
        className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/80 tabular-nums font-medium px-1">
          {photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : "Foto"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Palco da imagem */}
      <div
        className="relative flex-1 flex items-center justify-center min-h-0 px-2 pb-4"
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
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-2 sm:left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors text-2xl"
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
              className="absolute right-2 sm:right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors text-2xl"
              aria-label="Próxima foto"
            >
              ›
            </button>
          </>
        )}
        <img
          key={photos[currentIndex]}
          src={photos[currentIndex]}
          alt={`Foto ${currentIndex + 1} de ${photos.length}`}
          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none"
          draggable={false}
        />
      </div>

      {/* Pontinhos */}
      {photos.length > 1 && photos.length <= 12 && (
        <div
          className="flex justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para foto ${i + 1}`}
              onClick={() => setCurrentIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === currentIndex ? "w-5 bg-[#f7f75e]" : "w-1.5 bg-white/35 hover:bg-white/55"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
