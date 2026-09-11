"use client";

import { useState, useRef, useEffect, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type LazyImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> & {
  /** Acima da dobra: carrega com prioridade alta */
  priority?: boolean;
  /** Placeholder enquanto carrega (cor de fundo) */
  placeholderClassName?: string;
  /** Fade-in suave ao carregar */
  fadeIn?: boolean;
};

/**
 * Imagem com lazy loading nativo + decoding async.
 * - priority: usa loading="eager" e fetchPriority="high" (hero/avatar)
 * - demais: loading="lazy", fetchPriority="low"
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
  ...rest
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Se a imagem já estiver em cache, onLoad pode ter disparado antes do listener
  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  if (!src || error) {
    return (
      <div
        className={cn(
          "bg-black/[0.04] flex items-center justify-center",
          className,
          placeholderClassName
        )}
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
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      className={cn(
        fadeIn && "transition-opacity duration-300",
        fadeIn && !loaded && "opacity-0",
        fadeIn && loaded && "opacity-100",
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
