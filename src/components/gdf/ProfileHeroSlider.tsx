"use client";

// ProfileHeroSlider — carrossel de fotos do álbum (aba Sobre).
// Foto de perfil no hero é estática (UserAvatar); o slide fica em "Sobre".
// Em tela cheia: onSetAsProfilePhoto define o avatar (quando editable).

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Camera, Loader2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { PhotoViewer } from "./PhotoViewer";
import { LazyImage } from "./LazyImage";

interface ProfileHeroSliderProps {
  user: { id: string; display_name: string; avatar_url?: string | null };
  /** URLs das fotos do álbum. */
  photos: string[];
  className?: string;
  editable?: boolean;
  uploading?: boolean;
  /** Se true, inclui a foto de perfil como primeiro slide (legado). Padrão: false. */
  includeAvatar?: boolean;
  /** Borda decorativa mais marcante (aba Sobre). */
  framed?: boolean;
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
  includeAvatar = false,
  framed = false,
  onAddPhoto,
  onEditAvatar,
  onSetAsProfilePhoto,
  setAsProfileLoading,
  overlay,
}: ProfileHeroSliderProps) {
  const slides = [
    ...(includeAvatar ? [{ isAvatar: true as const, url: user.avatar_url || null }] : []),
    ...photos.filter(Boolean).map((url) => ({ isAvatar: false as const, url })),
  ];

  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const multi = slides.length > 1;
  const clampedIndex = slides.length === 0 ? 0 : Math.min(index, slides.length - 1);
  const go = (dir: 1 | -1) => {
    if (slides.length === 0) return;
    setIndex((i) => (i + dir + slides.length) % slides.length);
  };
  const current = slides[clampedIndex];

  const viewablePhotos = slides.map((s) => s.url).filter((u): u is string => !!u);
  const viewerIndex = current?.url ? viewablePhotos.indexOf(current.url) : -1;

  const openPicker = onAddPhoto ?? onEditAvatar;

  const frameClass = framed
    ? "rounded-2xl border-[3px] border-[#1A1A1A]/90 shadow-[0_8px_28px_rgba(26,26,26,0.12),0_0_0_6px_rgba(249,248,246,1),0_0_0_7px_rgba(26,26,26,0.08)]"
    : "rounded-xl";

  if (slides.length === 0) {
    return (
      <div className="shrink-0 inline-flex flex-col items-center w-full">
        <div
          className={`relative overflow-hidden bg-gradient-to-br from-[#0A4D5C]/10 to-[#D96C4A]/10 ${frameClass} ${className || ""}`}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <UserAvatar user={user} className="h-24 w-24 sm:h-28 sm:w-28 opacity-80" />
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
              className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#1A1A1A] text-white shadow-md transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {editable && (
          <p className="mt-3 max-w-xs text-center text-[11px] leading-tight text-[#4A4A4A]/55">
            Adicione fotos ao álbum. Depois, abra em tela cheia para usar como foto de perfil.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="shrink-0 inline-flex flex-col items-center w-full">
      <div
        className={`relative ${current?.url ? "cursor-pointer" : ""} ${frameClass} ${className || ""}`}
        onClick={() => {
          if (current?.url) setViewerOpen(true);
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
        <div className={`absolute inset-0 overflow-hidden bg-black/[0.04] ${framed ? "rounded-[13px]" : "rounded-xl"}`}>
          {current?.isAvatar ? (
            <UserAvatar user={user} className="h-full w-full" />
          ) : (
            <LazyImage
              src={current?.url || ""}
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
                className="absolute left-0 top-0 h-full w-1/3 flex items-center justify-start pl-2 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <ChevronLeft className="h-4 w-4 text-white drop-shadow-md" />
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Próxima foto"
                className="absolute right-0 top-0 h-full w-1/3 flex items-center justify-end pr-2 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                  <ChevronRight className="h-4 w-4 text-white drop-shadow-md" />
                </span>
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
            className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#1A1A1A] text-white shadow-md transition-colors hover:bg-[#1A1A1A]/90 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {multi && (
        <div className="mt-3 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Foto ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === clampedIndex ? "w-5 bg-[#1A1A1A]" : "w-1.5 bg-black/25 hover:bg-black/40"
              }`}
            />
          ))}
        </div>
      )}

      {editable && (
        <p className="mt-2.5 max-w-xs text-center text-[11px] leading-tight text-[#4A4A4A]/55">
          Toque na foto para tela cheia · use &quot;Usar como foto de perfil&quot; no visualizador
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
