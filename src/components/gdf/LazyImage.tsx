"use client";

import { useState, useRef, useEffect, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type LazyImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> & {
  /** LCP / acima da dobra: eager + fetchPriority high, sem fade que atrasa paint */
  priority?: boolean;
  placeholderClassName?: string;
  /** Fade-in (desligado automaticamente se priority) */
  fadeIn?: boolean;
};

/**
 * Imagem otimizada para CWV:
 * - priority (LCP): loading=eager, fetchPriority=high, sem opacity-0
 * - demais: loading=lazy, fetchPriority=low
 */
export function LazyImage({
  src,
  alt = "",
  className,
  priority = false,
  placeholderClassName,
  fadeIn = true,
  onLoad,
  onError,
  width,
  height,
  sizes,
  ...rest
}: LazyImageProps) {
  const useFade = fadeIn && !priority;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);

  if (!src || error) {
    return (
      <div
        className={cn(
          "bg-black/[0.04] flex items-center justify-center",
          className,
          placeholderClassName
        )}
        style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      // sync no LCP evita atraso de decode em alguns browsers
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
}

/**
 * Preload da imagem LCP (avatar/hero) o mais cedo possível no cliente.
 * Injeta <link rel="preload" as="image"> e remove no unmount.
 */
export function useLcpImagePreload(src: string | null | undefined) {
  useEffect(() => {
    if (!src || typeof document === "undefined") return;
    const existing = Array.from(document.querySelectorAll('link[data-lcp-preload]')).find(
      (el) => el.getAttribute("data-lcp-preload") === src
    );
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.setAttribute("data-lcp-preload", src);
    // fetchpriority no link (Chromium)
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, [src]);
}
