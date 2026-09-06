"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Galeria de fotos em tela cheia — UX mobile-first.
 *
 * Estratégia:
 * 1. Portal em document.body (escapa transform/overflow do shell)
 * 2. Dimensões via 100dvw/100dvh + position fixed com style inline
 * 3. Fechar: botão grande no TOPO, toque na área escura, swipe para baixo, Esc
 * 4. Navegar: setas, swipe horizontal, teclado
 * 5. Controles com pointer-events e touch-action explícitos
 */
export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const go = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => {
        const n = i + dir;
        if (n < 0) return photos.length - 1;
        if (n >= photos.length) return 0;
        return n;
      });
    },
    [photos.length]
  );

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go]);

  if (!mounted || photos.length === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Swipe para baixo → fechar
    if (dy > 80 && absY > absX * 1.2) {
      close();
      return;
    }
    // Swipe horizontal → navegar
    if (photos.length > 1 && absX > 50 && absX > absY) {
      go(dx > 0 ? -1 : 1);
    }
  };

  const ui = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Galeria de fotos"
      data-photo-viewer="true"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        // fallback para browsers antigos sem dvh
        minHeight: "100vh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        margin: 0,
        padding: 0,
        zIndex: 2147483000,
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
        overscrollBehavior: "none",
      }}
    >
      {/* Barra superior — fechar + contador */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)",
          position: "relative",
          zIndex: 2,
        }}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.15)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
          }}
        >
          <X size={22} strokeWidth={2.5} />
        </button>

        <span
          style={{
            color: "rgba(255,255,255,0.9)",
            fontSize: 14,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.35)",
          }}
        >
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : "Foto"}
        </span>

        {/* Espaçador para equilibrar o X */}
        <div style={{ width: 48, height: 48 }} />
      </div>

      {/* Área da foto */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 8px",
        }}
        onClick={(e) => {
          // clique no fundo (não na img) fecha
          if (e.target === e.currentTarget) close();
        }}
      >
        <img
          key={photos[index]}
          src={photos[index]}
          alt={`Foto ${index + 1} de ${photos.length}`}
          draggable={false}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: "none",
          }}
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              style={{
                position: "absolute",
                left: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: 999,
                border: "none",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              <ChevronLeft size={28} />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              style={{
                position: "absolute",
                right: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: 999,
                border: "none",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 2,
              }}
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>

      {/* Rodapé: pontinhos + dica de gesto */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          paddingTop: 8,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {photos.length > 1 && photos.length <= 15 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para foto ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                style={{
                  width: i === index ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  border: "none",
                  padding: 0,
                  background:
                    i === index ? "#f7f75e" : "rgba(255,255,255,0.35)",
                  transition: "width 0.2s, background 0.2s",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.02em",
          }}
        >
          Deslize para o lado · para baixo para fechar
        </p>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
