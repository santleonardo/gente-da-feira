// ═══════════════════════════════════════════════════════════
// Fullscreen API (com fallbacks de prefixo) — usado por
// PhotoViewer e PostDetailDialog para abrir em tela cheia
// nativa em qualquer aparelho (celular, tablet, desktop).
// ═══════════════════════════════════════════════════════════

export function requestElementFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as any;
  const fn =
    el.requestFullscreen?.bind(el) ||
    anyEl.webkitRequestFullscreen?.bind(anyEl) ||
    anyEl.msRequestFullscreen?.bind(anyEl);
  return fn ? fn() : Promise.reject(new Error("Fullscreen API indisponível"));
}

export function exitDocumentFullscreen(): Promise<void> {
  const anyDoc = document as any;
  const el =
    document.fullscreenElement ||
    anyDoc.webkitFullscreenElement ||
    anyDoc.msFullscreenElement;
  if (!el) return Promise.resolve();
  const fn =
    document.exitFullscreen?.bind(document) ||
    anyDoc.webkitExitFullscreen?.bind(anyDoc) ||
    anyDoc.msExitFullscreen?.bind(anyDoc);
  return fn ? fn() : Promise.resolve();
}

export function isDocumentFullscreen(): boolean {
  const anyDoc = document as any;
  return !!(
    document.fullscreenElement ||
    anyDoc.webkitFullscreenElement ||
    anyDoc.msFullscreenElement
  );
}
