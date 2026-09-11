"use client";

import {
  useState,
  useRef,
  useEffect,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * LazyImage — carregamento otimizado + CWV.
 *
 * Compat: FeedView (skeleton), DMsView (wrapperClassName), hero (priority).
 * Otimizações: lazy/eager, fetchPriority, decoding, sizes, aspect-ratio (CLS),
 * fallback de erro, preload LCP (useLcpImagePreload).
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
  /** URL alternativa se a principal falhar */
  fallbackSrc?: string | null;
  /** Conteúdo customizado no estado quebrado */
  fallback?: ReactNode;
  /** Texto acessível do estado quebrado */
  fallbackLabel?: string;
  /**
   * Aspect ratio CSS (ex.: "16/10", "1") para reservar espaço e reduzir CLS.
   * Alternativa a width+height quando a proporção é conhecida.
   */
  aspectRatio?: string | number;
}

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

/** Detecta rede lenta (Save-Data ou effectiveType 2g/slow-2g). */
function useSlowNetwork(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const conn = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
          addEventListener?: (type: string, fn: () => void) => void;
          removeEventListener?: (type: string, fn: () => void) => void;
        };
      }
    ).connection;
    if (!conn) return;
    const update = () => {
      const type = conn.effectiveType || "";
      setSlow(!!conn.saveData || type === "slow-2g" || type === "2g");
    };
    update();
    conn.addEventListener?.("change", update);
    return () => conn.removeEventListener?.("change", update);
  }, []);
  return slow;
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
  aspectRatio,
  onLoad,
  onError,
  width,
  height,
  sizes,
  style,
  ...rest
}: LazyImageProps): ReactElement {
  const showSkeleton = skeleton !== undefined ? skeleton : !priority;
  const useFade = fadeIn && !priority;
  const slowNetwork = useSlowNetwork();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(
    src ? String(src) : null
  );
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    setError(false);
    setTriedFallback(false);
    setCurrentSrc(src ? String(src) : null);
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [currentSrc]);

  const boxStyle: CSSProperties = {
    ...(style as CSSProperties),
  };
  if (aspectRatio != null) {
    boxStyle.aspectRatio =
      typeof aspectRatio === "number" ? String(aspectRatio) : aspectRatio;
  } else if (width && height) {
    boxStyle.aspectRatio = `${width} / ${height}`;
  }

  // sizes padrão: evita baixar versão desktop em mobile
  const resolvedSizes =
    sizes ??
    (priority
      ? "(max-width: 640px) 90vw, 440px"
      : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 672px");

  const wrap = (node: ReactElement): ReactElement => {
    if (!wrapperClassName) return node;
    return <span className={wrapperClassName}>{node}</span>;
  };

  const label = fallbackLabel || alt || "Imagem indisponível";

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
        style={Object.keys(boxStyle).length ? boxStyle : undefined}
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

  // Rede lenta + não-LCP: adia um pouco o decode para não competir com LCP
  const decoding: "sync" | "async" = priority
    ? "sync"
    : slowNetwork
      ? "async"
      : "async";

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      sizes={resolvedSizes}
      loading={priority ? "eager" : "lazy"}
      decoding={decoding}
      fetchPriority={priority ? "high" : slowNetwork ? "low" : "low"}
      // Dica ao browser: não bloquear render com imagens offscreen
      className={cn(
        "max-w-full h-auto",
        useFade && "transition-opacity duration-300",
        useFade && !loaded && "opacity-0",
        useFade && loaded && "opacity-100",
        className
      )}
      style={Object.keys(boxStyle).length ? boxStyle : style}
      onLoad={(e) => {
        setLoaded(true);
        setError(false);
        onLoad?.(e);
      }}
      onError={(e) => {
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
      <span
        className={cn(
          "relative inline-block max-w-full overflow-hidden",
          wrapperClassName
        )}
        style={Object.keys(boxStyle).length ? boxStyle : undefined}
      >
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

/**
 * Preload da imagem LCP (hero/avatar) o mais cedo possível.
 * Chamar no componente do hero: useLcpImagePreload(avatarUrl)
 */
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
