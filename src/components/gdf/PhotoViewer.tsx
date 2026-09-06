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
 *  - UserProfileDialog: o viewer era renderizado como irmão do
 *    DialogContent do Radix Dialog, então cliques nos seus botões
 *    contavam como "clique fora do modal" e fechavam o perfil
 *    inteiro antes do próprio clique ser processado.
 *
 * Esta versão única corrige os problemas: foto ocupa a tela inteira
 * (sem barras reservando espaço), controles flutuam por cima em
 * overlay, botão de fechar isolado no canto inferior (longe do botão
 * de fechar do perfil, que fica no canto superior), setas sempre
 * visíveis (em qualquer tamanho de tela), navegação por teclado e
 * swipe.
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
      className="fixed inset-0 z-[100] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos"
      onClick={onClose}
    >
      {/* Foto em tela inteira — sem barras reservando espaço, controles flutuam por cima */}
      <div
        className="absolute inset-0 flex items-center justify-center"
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
          className="h-full w-full object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Contador — sobreposto no topo, não ocupa espaço da foto */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="rounded-full bg-black/40 px-3 py-1 text-sm text-white/90 tabular-nums font-medium backdrop-blur-sm">
          {photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : "Foto"}
        </span>
      </div>

      {/* Setas de navegação */}
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

      {/* Pontinhos — sobrepostos no rodapé, centralizados */}
      {photos.length > 1 && photos.length <= 12 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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

      {/* Fechar — canto inferior, longe do botão de fechar do perfil (que fica no topo) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-[#f7f75e] hover:text-[#1A1A1A] transition-colors shadow-lg"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
