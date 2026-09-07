"use client";

// ═══════════════════════════════════════════════════════════
// ProfileHeroSlider
// Slideshow do hero: avatar + fotos do álbum.
// Em tela cheia, o próprio perfil pode definir a foto atual
// como avatar via onSetAsProfilePhoto.
// ═══════════════════════════════════════════════════════════

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { PhotoViewer } from "./PhotoViewer";

interface ProfileHeroSliderProps {
  user: { id: string; display_name: string; avatar_url?: string | null };
  /** URLs das fotos do álbum (sem incluir a foto de perfil). */
  photos: string[];
  className?: string;
  editable?: boolean;
  uploading?: boolean;
  /** Adiciona uma NOVA foto ao álbum (não substitui as anteriores). */
  onAddPhoto?: () => void;
  /** Define a URL atual como foto de perfil (avatar). */
  onSetAsProfilePhoto?: (url: string) => void;
  setAsProfileLoading?: boolean;
  overlay?: ReactNode;
}

export function ProfileHeroSlider({
  user,
  photos,
  className,
  editable,
  uploading,
  onAddPhoto,
  onSetAsProfilePhoto,
  setAsProfileLoading,
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

  const viewablePhotos = slides.map((s) => s.url).filter((u): u is string => !!u);
  const viewerIndex = current.url ? viewablePhotos.indexOf(current.url) : -1;

  return (
    <div className="shrink-0 inline-flex flex-col items-center">
      <div
        className={`relative rounded-xl ${current.url ? "cursor-pointer" : ""} ${className || ""}`}
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
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-black/[0.04]">
          {current.isAvatar ? (
            <UserAvatar user={user} className="h-full w-full" />
          ) : (
            <img
              src={current.url || ""}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
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
        </div>

        {overlay}

        {/* Câmera = ADICIONAR foto ao álbum (não substitui) */}
        {editable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddPhoto?.();
            }}
            disabled={uploading}
            title="Adicionar foto ao álbum"
            aria-label="Adicionar foto ao álbum"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A] text-white shadow-sm transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50 z-10"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {multi && (
        <div className="mt-2 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === clampedIndex ? "w-4 bg-[#1A1A1A]" : "w-1.5 bg-black/30"
              }`}
            />
          ))}
        </div>
      )}

      {editable && (
        <p className="mt-1.5 text-[10px] text-[#4A4A4A]/55 text-center max-w-[9rem] leading-tight">
          Toque na foto · use o botão amarelo para definir perfil
        </p>
      )}

      {viewerOpen && viewablePhotos.length > 0 && (
        <PhotoViewer
          photos={viewablePhotos}
          initialIndex={Math.max(viewerIndex, 0)}
          onClose={() => setViewerOpen(false)}
          onSetAsProfilePhoto={editable ? onSetAsProfilePhoto : undefined}
          setAsProfileLoading={setAsProfileLoading}
        />
      )}
    </div>
  );
}
