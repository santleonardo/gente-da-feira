"use client";

import React, { useState, useCallback, memo } from "react";
import { cn } from "@/lib/utils";

export type LazyImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "loading" | "decoding"
> & {
  /** Carrega imediatamente (above-the-fold / LCP) */
  priority?: boolean;
  /** Placeholder cinza com pulse até carregar */
  skeleton?: boolean;
  /** Classe do wrapper quando skeleton=true */
  wrapperClassName?: string;
};

/**
 * Imagem com lazy loading nativo + fade-in.
 * - loading="lazy" / decoding="async" por padrão
 * - priority → eager + fetchPriority high (hero)
 * - skeleton opcional enquanto baixa
 */
export const LazyImage = memo(function LazyImage({
  src,
  alt = "",
  className,
  priority = false,
  skeleton = true,
  wrapperClassName,
  onLoad,
  onError,
  ...rest
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad]
  );

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setFailed(true);
      setLoaded(true);
      onError?.(e);
    },
    [onError]
  );

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center bg-muted text-muted-foreground text-xs",
          className
        )}
        aria-hidden
      />
    );
  }

  const img = (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...({ fetchPriority: priority ? "high" : "low" } as React.ImgHTMLAttributes<HTMLImageElement>)}
      onLoad={handleLoad}
      onError={handleError}
      className={cn(
        className,
        skeleton && "transition-opacity duration-300 ease-out",
        skeleton && !loaded && "opacity-0",
        skeleton && loaded && "opacity-100"
      )}
      {...rest}
    />
  );

  if (!skeleton) return img;

  return (
    <span className={cn("relative block max-w-full overflow-hidden", wrapperClassName)}>
      {!loaded && (
        <span
          className="absolute inset-0 animate-pulse bg-muted/80 rounded-[inherit]"
          aria-hidden
        />
      )}
      {img}
    </span>
  );
});

export default LazyImage;
