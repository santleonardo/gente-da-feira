"use client";

import {
  useState,
  useRef,
  useEffect,
  type ImgHTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

export interface LazyImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> {
  /** LCP / acima da dobra */
  priority?: boolean;
  placeholderClassName?: string;
  /** Fade-in (desligado se priority) */
  fadeIn?: boolean;
  /**
   * Classe do wrapper em volta da img (ex.: DMsView).
   * Compatível com o uso: wrapperClassName="max-w-full block"
   */
  wrapperClassName?: string;
}

export function LazyImage({
  src,
  alt = "",
  className,
  priority = false,
  placeholderClassName,
  fadeIn = true,
  wrapperClassName,
  onLoad,
  onError,
  width,
  height,
  sizes,
  ...rest
}: LazyImageProps): ReactElement {
  const useFade = fadeIn && !priority;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);

  if (!src || error) {
    const placeholder = (
      <div
        className={cn(
          "bg-black/[0.04] flex items-center justify-center",
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
    if (wrapperClassName) {
      return <span className={wrapperClassName}>{placeholder}</span>;
    }
    return placeholder;
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

  if (wrapperClassName) {
    return <span className={wrapperClassName}>{img}</span>;
  }

  return img;
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
