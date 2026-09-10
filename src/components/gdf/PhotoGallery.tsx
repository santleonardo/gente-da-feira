"use client";

/**
 * Galeria de fotos responsiva — otimizada para desempenho.
 *
 * - Memoização (React.memo + useCallback)
 * - Lazy load nativo (só as 2 primeiras eager)
 * - content-visibility para células fora da viewport
 * - PhotoViewer carregado sob demanda (dynamic import)
 * - Shadows/hover leves; will-change só no hover
 * - decoding="async" + fetchPriority controlado
 */

import {
  memo,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from "react";
import dynamic from "next/dynamic";
import { Camera, ImagePlus, Loader2 } from "lucide-react";

const PhotoViewer = dynamic(
  () => import("./PhotoViewer").then((m) => m.PhotoViewer),
  { ssr: false }
);

export interface PhotoGalleryProps {
  photos: string[];
  title?: string;
  className?: string;
  editable?: boolean;
  uploading?: boolean;
  onAddPhoto?: () => void;
  onSetAsProfilePhoto?: (url: string) => void;
  setAsProfileLoading?: boolean;
  emptyLabel?: string;
}

const ASPECTS = [
  "aspect-[3/4]",
  "aspect-square",
  "aspect-[4/5]",
  "aspect-[5/6]",
  "aspect-[3/4]",
  "aspect-square",
] as const;

/** Limite de imagens com carregamento prioritário (above the fold). */
const EAGER_COUNT = 2;

const cellContainStyle: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "180px 220px",
  contain: "layout style paint",
};

type GalleryCellProps = {
  url: string;
  index: number;
  editable?: boolean;
  onOpen: (index: number) => void;
};

const GalleryCell = memo(function GalleryCell({
  url,
  index,
  editable,
  onOpen,
}: GalleryCellProps) {
  const aspect = ASPECTS[index % ASPECTS.length];
  const isHero = index === 0;
  const eager = index < EAGER_COUNT;

  const span = isHero
    ? "col-span-2 row-span-1 sm:col-span-2 sm:row-span-2"
    : "";

  const handleClick = useCallback(() => {
    onOpen(index);
  }, [onOpen, index]);

  return (
    <button
      type="button"
      onClick={handleClick}
      style={cellContainStyle}
      className={`
        group relative overflow-hidden bg-black/[0.04] text-left
        rounded-xl sm:rounded-2xl
        border-[2.5px] border-[#1A1A1A]/85
        shadow-sm sm:shadow-[0_4px_14px_rgba(26,26,26,0.07)]
        transition-[transform,box-shadow] duration-200 ease-out
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D96C4A]/50
        ${span}
        ${isHero ? "aspect-[4/3] sm:aspect-auto sm:min-h-[220px]" : aspect}
      `}
    >
      <img
        src={url}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        {...({
          fetchPriority: eager ? "high" : "low",
        } as ImgHTMLAttributes<HTMLImageElement>)}
        width={isHero ? 640 : 320}
        height={isHero ? 480 : 400}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
      />
      {/* Overlay só em pointer fino (desktop) — evita paint extra no mobile */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/30 via-transparent to-transparent opacity-0 motion-safe:group-hover:opacity-100 transition-opacity duration-200 max-sm:hidden"
        aria-hidden
      />
      {editable && (
        <span className="pointer-events-none absolute bottom-2 left-2 right-2 text-[10px] font-medium text-white/95 drop-shadow-md opacity-0 motion-safe:group-hover:opacity-100 transition-opacity duration-200 max-sm:hidden">
          Ampliar · usar como perfil
        </span>
      )}
    </button>
  );
});

function PhotoGalleryInner({
  photos,
  title = "Fotos",
  className,
  editable,
  uploading,
  onAddPhoto,
  onSetAsProfilePhoto,
  setAsProfileLoading,
  emptyLabel = "Nenhuma foto no álbum",
}: PhotoGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openAt = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const countLabel = useMemo(() => {
    if (photos.length === 0) return null;
    return `${photos.length} foto${photos.length !== 1 ? "s" : ""}${
      editable ? " · toque para ampliar" : ""
    }`;
  }, [photos.length, editable]);

  return (
    <section className={`w-full min-w-0 ${className || ""}`}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg sm:text-xl font-medium tracking-tight text-[#1A1A1A]">
            {title}
          </h3>
          {countLabel && (
            <p className="text-[11px] text-[#4A4A4A]/55 mt-0.5">{countLabel}</p>
          )}
        </div>
        {editable && onAddPhoto && (
          <button
            type="button"
            onClick={onAddPhoto}
            disabled={uploading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-[#1A1A1A] hover:bg-black/[0.04] transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Adicionar
          </button>
        )}
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={editable ? onAddPhoto : undefined}
          disabled={!editable || uploading}
          className={`w-full rounded-2xl border-[3px] border-dashed border-[#1A1A1A]/15 bg-gradient-to-br from-[#0A4D5C]/[0.04] to-[#D96C4A]/[0.04] py-14 sm:py-16 text-center transition-colors ${
            editable ? "hover:border-[#1A1A1A]/30 cursor-pointer" : "cursor-default"
          } disabled:opacity-50`}
        >
          <Camera className="h-9 w-9 text-[#4A4A4A]/25 mx-auto mb-2" />
          <p className="font-serif text-base text-[#4A4A4A]/50">{emptyLabel}</p>
          {editable && (
            <p className="mt-1 text-xs text-[#4A4A4A]/40">
              Toque para adicionar fotos ao álbum
            </p>
          )}
        </button>
      ) : (
        <div
          className="
            grid gap-2.5 sm:gap-3
            grid-cols-2
            sm:grid-cols-3
            lg:grid-cols-4
          "
        >
          {photos.map((url, idx) => (
            <GalleryCell
              key={url}
              url={url}
              index={idx}
              editable={editable}
              onOpen={openAt}
            />
          ))}

          {editable && onAddPhoto && (
            <button
              type="button"
              onClick={onAddPhoto}
              disabled={uploading}
              className="
                flex flex-col items-center justify-center gap-2
                rounded-xl sm:rounded-2xl
                border-[2.5px] border-dashed border-[#1A1A1A]/20
                bg-white/50 text-[#4A4A4A]/60
                hover:border-[#1A1A1A]/40 hover:text-[#1A1A1A] hover:bg-white/80
                transition-colors disabled:opacity-50
                aspect-square
              "
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6" />
              )}
              <span className="text-[11px] font-medium">Adicionar</span>
            </button>
          )}
        </div>
      )}

      {editable && photos.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-[#4A4A4A]/45">
          Abra uma foto em tela cheia para usar como foto de perfil
        </p>
      )}

      {/* Monta o lightbox só quando aberto — evita custo no primeiro paint */}
      {viewerOpen && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          onClose={closeViewer}
          onSetAsProfilePhoto={editable ? onSetAsProfilePhoto : undefined}
          setAsProfileLoading={setAsProfileLoading}
        />
      )}
    </section>
  );
}

export const PhotoGallery = memo(PhotoGalleryInner);
export default PhotoGallery;
