"use client";

// ═══════════════════════════════════════════════════════════
// ProfileHeroSlider
// ─────────────────────────────────────────────────────────
// Substitui o antigo avatar estático do hero do perfil por um
// pequeno slideshow: a foto de perfil sempre entra como o
// primeiro slide, seguida pelas fotos que o usuário already
// subiu para o álbum (extinta a aba "Fotografia" — as mídias
// agora vivem aqui, junto com a foto de perfil).
//
// Navegação por swipe (mobile) e setas (hover, desktop) +
// indicadores de posição (dots). Quando há apenas um slide
// (sem fotos no álbum), o componente se comporta exatamente
// como o avatar simples de antes.
// ═══════════════════════════════════════════════════════════

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { PhotoViewer } from "./PhotoViewer";

interface ProfileHeroSliderProps {
  user: { id: string; display_name: string; avatar_url?: string | null };
  /** URLs das fotos do álbum (sem incluir a foto de perfil, adicionada automaticamente). */
  photos: string[];
  /** Classes de tamanho/anel/sombra aplicadas ao círculo do slide (ex: "h-24 w-24 ring-[5px] ring-[#F9F8F6] shadow-md"). */
  className?: string;
  /** Mostra o botão de câmera para trocar a foto de perfil (só no próprio perfil). */
  editable?: boolean;
  uploading?: boolean;
  onEditAvatar?: () => void;
  /** Elemento extra sobreposto ao slide (ex: ícone de cadeado em perfil privado/bloqueado). */
  overlay?: ReactNode;
}

export function ProfileHeroSlider({
  user,
  photos,
  className,
  editable,
  uploading,
  onEditAvatar,
  overlay,
}: ProfileHeroSliderProps) {
  const slides = [
    { isAvatar: true as const, url: user.avatar_url || null },
    ...photos.filter(Boolean).map((url) => ({ isAvatar: false as const, url })),
  ];

  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const multi = slides.length > 1;
  const clampedIndex = Math.min(index, slides.length - 1);
  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + slides.length) % slides.length);
  const current = slides[clampedIndex];

  // Lista de fotos "abríveis" em tela cheia (avatar sem foto fica de fora).
  const viewablePhotos = slides.map((s) => s.url).filter((u): u is string => !!u);
  const viewerIndex = current.url ? viewablePhotos.indexOf(current.url) : -1;

  return (
    <div className="shrink-0 inline-flex flex-col items-center">
      <div
        className={`relative overflow-hidden rounded-xl bg-black/[0.04] ${current.url ? "cursor-pointer" : ""} ${className || ""}`}
        onClick={() => {
          if (current.url) setViewerOpen(true);
        }}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1);
          touchX.current = null;
        }}
      >
        {current.isAvatar ? (
          <UserAvatar user={user} className="h-full w-full" />
        ) : (
          <img src={current.url || ""} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        )}

        {multi && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Foto anterior"
              className="absolute left-0 top-0 h-full w-1/3 flex items-center justify-start pl-1.5 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4 text-white drop-shadow-md" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Próxima foto"
              className="absolute right-0 top-0 h-full w-1/3 flex items-center justify-end pr-1.5 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <ChevronRight className="h-4 w-4 text-white drop-shadow-md" />
            </button>
          </>
        )}

        {overlay}

        {editable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditAvatar?.();
            }}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A] text-white shadow-sm transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50 z-10"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {multi && (
        <div className="mt-1.5 flex items-center gap-1">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full transition-colors ${i === clampedIndex ? "bg-[#1A1A1A]" : "bg-black/20"}`}
            />
          ))}
        </div>
      )}

      {viewerOpen && viewablePhotos.length > 0 && (
        <PhotoViewer
          photos={viewablePhotos}
          initialIndex={Math.max(viewerIndex, 0)}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
