"use client";

import {
  useState,
  useRef,
  useEffect,
  type ImgHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * LazyImage — FeedView (skeleton), DMsView (wrapperClassName), hero (priority),
 * fallback visual quando a imagem quebra ou src está vazio.
 */
export interface LazyImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  /** LCP / acima da dobra: eager + fetchPriority high (sem fade/skeleton) */
  priority?: boolean;
  /** Classe do placeholder de erro / fundo do skeleton */
  placeholderClassName?: string;
  /** Fade-in ao carregar (desligado se priority) */
  fadeIn?: boolean;
  /** Wrapper em volta da img — DMsView: wrapperClassName="max-w-full block" */
  wrapperClassName?: string;
  /**
   * Skeleton animado até a imagem carregar.
   * FeedView: skeleton={false}
   * Default: true quando não é priority
   */
  skeleton?: boolean;
  /**
   * URL alternativa se a imagem principal falhar (ex.: CDN mirror).
   * Tenta uma vez; se também falhar, mostra o fallback visual.
   */
  fallbackSrc?: string | null;
  /** Conteúdo customizado no lugar do ícone de imagem quebrada */
  fallback?: ReactNode;
  /** Texto acessível do estado quebrado (default: alt ou "Imagem indisponível") */
  fallbackLabel?: string;
}

/** Ícone minimalista de imagem quebrada (sem dependência externa). */
function BrokenImageIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 20" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function LazyImage({
  src,
  alt = "",
  className,
  priority = false,
  placeholderClassName,
  fadeIn = true,
  wrapperClassName,
  skeleton,
  fallbackSrc,
  fallback,
  fallbackLabel,
  onLoad,
  onError,
  width,
  height,
  sizes,
  ...rest
}: LazyImageProps): ReactElement {
  const showSkeleton = skeleton !== undefined ? skeleton : !priority;
  const useFade = fadeIn && !priority;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(
    src ? String(src) : null
  );
  const ref = useRef<HTMLImageElement>(null);

  // Reset quando a src original muda
  useEffect(() => {
    setLoaded(false);
    setError(false);
    setTriedFallback(false);
    setCurrentSrc(src ? String(src) : null);
  }, [src]);

  // Imagem já em cache
  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [currentSrc]);

  const wrap = (node: ReactElement): ReactElement => {
    if (!wrapperClassName) return node;
    return <span className={wrapperClassName}>{node}</span>;
  };

  const label = fallbackLabel || alt || "Imagem indisponível";

  // Fallback visual: src vazio ou falha definitiva
  if (!currentSrc || error) {
    return wrap(
      <div
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          "bg-black/[0.04] flex flex-col items-center justify-center gap-1.5 text-[#1A1A1A]/35 select-none",
          className,
          placeholderClassName
        )}
        style={
          width && height
            ? { aspectRatio: `${width} / ${height}` }
            : undefined
        }
      >
        {fallback ?? (
          <>
            <BrokenImageIcon className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 opacity-70" />
            <span className="text-[10px] sm:text-[11px] font-medium tracking-wide px-2 text-center line-clamp-2">
              {label}
            </span>
          </>
        )}
      </div>
    );
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "low"}
      className={cn(
        useFade && "transition-opacity duration-300",
        useFade && !loaded && "opacity-0",
        useFade && loaded && "opacity-100",
        className
      )}
      onLoad={(e) => {
        setLoaded(true);
        setError(false);
        onLoad?.(e);
      }}
      onError={(e) => {
        // 1ª falha → tenta fallbackSrc uma vez
        if (!triedFallback && fallbackSrc && fallbackSrc !== currentSrc) {
          setTriedFallback(true);
          setLoaded(false);
          setCurrentSrc(fallbackSrc);
          return;
        }
        setError(true);
        setLoaded(false);
        onError?.(e);
      }}
      {...rest}
    />
  );

  if (showSkeleton && !loaded) {
    return (
      <span className={cn("relative inline-block max-w-full", wrapperClassName)}>
        <span
          className={cn(
            "absolute inset-0 bg-black/[0.04] animate-pulse rounded-[inherit] pointer-events-none",
            placeholderClassName
          )}
          aria-hidden
        />
        {img}
      </span>
    );
  }

  return wrap(img);
}

/** Preload da imagem LCP (hero/avatar). */
export function useLcpImagePreload(src: string | null | undefined): void {
  useEffect(() => {
    if (!src || typeof document === "undefined") return;
    const existing = Array.from(
      document.querySelectorAll("link[data-lcp-preload]")
    ).find((el) => el.getAttribute("data-lcp-preload") === src);
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.setAttribute("data-lcp-preload", src);
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, [src]);
}
