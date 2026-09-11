"use client";

import {
  useState,
  useRef,
  useEffect,
  type ImgHTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

/**
 * LazyImage — compatível com FeedView (skeleton), DMsView (wrapperClassName), hero (priority).
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
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    setError(false);
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);

  const wrap = (node: ReactElement): ReactElement => {
    if (!wrapperClassName) return node;
    return <span className={wrapperClassName}>{node}</span>;
  };

  if (!src || error) {
    return wrap(
      <div
        className={cn(
          "bg-black/[0.04] flex items-center justify-center",
          showSkeleton && "animate-pulse",
          className,
          placeholderClassName
        )}
        style={
          width && height
            ? { aspectRatio: `${width} / ${height}` }
            : undefined
        }
        aria-hidden
      />
    );
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src as string}
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
        onLoad?.(e);
      }}
      onError={(e) => {
        setError(true);
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
