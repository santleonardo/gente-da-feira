"use client";

// ProfileHeroSlider — avatar + fotos do álbum no hero do perfil.
// Câmera = adicionar foto ao álbum (não substitui).
// Em tela cheia: onSetAsProfilePhoto define o avatar.

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { PhotoViewer } from "./PhotoViewer";
import { LazyImage } from "./LazyImage";

interface ProfileHeroSliderProps {
  user: { id: string; display_name: string; avatar_url?: string | null };
  /** URLs das fotos do álbum (sem a foto de perfil). */
  photos: string[];
  className?: string;
  editable?: boolean;
  uploading?: boolean;
  /** Abre o seletor para ADICIONAR foto ao álbum. */
  onAddPhoto?: () => void;
  /** @deprecated use onAddPhoto — mantido só para compat transitória */
  onEditAvatar?: () => void;
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
  onEditAvatar,
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

  const openPicker = onAddPhoto ?? onEditAvatar;

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
            <LazyImage
              src={current.url || ""}
              alt=""
              className="h-full w-full object-cover"
              wrapperClassName="h-full w-full"
              priority={clampedIndex === 0}
              skeleton={false}
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

        {editable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPicker?.();
            }}
            disabled={uploading}
            title="Adicionar foto ao álbum"
            aria-label="Adicionar foto ao álbum"
            className="absolute -bottom-1 -right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F9F8F6] bg-[#1A1A1A] text-white shadow-sm transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50"
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
        <p className="mt-1.5 max-w-[9rem] text-center text-[10px] leading-tight text-[#4A4A4A]/55">
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
