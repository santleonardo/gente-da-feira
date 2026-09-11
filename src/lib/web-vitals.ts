/**
 * Web Vitals — coleta e envio de métricas Core Web Vitals.
 * Usa a API nativa PerformanceObserver + integração Next.js (useReportWebVitals).
 */

export type WebVitalName = "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB" | "Next.js-hydration" | "Next.js-route-change-to-render" | "Next.js-render";

export type WebVitalMetric = {
  id: string;
  name: string;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  delta?: number;
  navigationType?: string;
  entries?: PerformanceEntry[];
};

/** Limiares oficiais do Google (Chrome UX Report) */
export function rateMetric(name: string, value: number): "good" | "needs-improvement" | "poor" {
  switch (name) {
    case "LCP":
      return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    case "CLS":
      return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    case "INP":
    case "FID":
      return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
    case "FCP":
      return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
    case "TTFB":
      return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
    default:
      return "good";
  }
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Reporter = (metric: WebVitalMetric) => void;

/**
 * Observa LCP, CLS e INP via PerformanceObserver (sem dependência extra).
 * Complementa next/web-vitals quando disponível.
 */
export function observeNativeWebVitals(report: Reporter): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  const cleanups: Array<() => void> = [];

  // LCP
  try {
    let lastLcp = 0;
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      if (!last) return;
      lastLcp = last.startTime;
      report({
        id: uid(),
        name: "LCP",
        value: lastLcp,
        rating: rateMetric("LCP", lastLcp),
        entries,
      });
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    cleanups.push(() => po.disconnect());
  } catch {
    /* browser sem suporte */
  }

  // CLS
  try {
    let clsValue = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput && typeof entry.value === "number") {
          clsValue += entry.value;
        }
      }
      report({
        id: uid(),
        name: "CLS",
        value: clsValue,
        rating: rateMetric("CLS", clsValue),
      });
    });
    po.observe({ type: "layout-shift", buffered: true });
    cleanups.push(() => po.disconnect());
  } catch {
    /* */
  }

  // INP (event timing)
  try {
    let maxInp = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
        if (entry.interactionId && entry.duration > maxInp) {
          maxInp = entry.duration;
          report({
            id: uid(),
            name: "INP",
            value: maxInp,
            rating: rateMetric("INP", maxInp),
          });
        }
      }
    });
    po.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    cleanups.push(() => po.disconnect());
  } catch {
    /* */
  }

  // FCP / TTFB a partir de navigation + paint
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const ttfb = nav.responseStart;
      report({
        id: uid(),
        name: "TTFB",
        value: ttfb,
        rating: rateMetric("TTFB", ttfb),
      });
    }
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          report({
            id: uid(),
            name: "FCP",
            value: entry.startTime,
            rating: rateMetric("FCP", entry.startTime),
          });
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
    cleanups.push(() => po.disconnect());
  } catch {
    /* */
  }

  return () => cleanups.forEach((fn) => fn());
}

/** Envia métrica para o endpoint de analytics (beacon, não bloqueia). */
export function sendWebVital(
  metric: WebVitalMetric,
  endpoint = "/api/web-vitals"
): void {
  const body = JSON.stringify({
    name: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value) / (metric.name === "CLS" ? 1000 : 1),
    rating: metric.rating ?? rateMetric(metric.name, metric.value),
    id: metric.id,
    path: typeof window !== "undefined" ? window.location.pathname : "",
    ts: Date.now(),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(endpoint, blob)) return;
  }

  // fallback
  if (typeof fetch === "function") {
    void fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }
}

/** Log em dev + envio em produção */
export function handleWebVital(metric: WebVitalMetric): void {
  const rating = metric.rating ?? rateMetric(metric.name, metric.value);
  const enriched = { ...metric, rating };

  if (process.env.NODE_ENV === "development") {
    const label =
      rating === "good" ? "🟢" : rating === "needs-improvement" ? "🟡" : "🔴";
    // eslint-disable-next-line no-console
    console.info(
      `${label} [Web Vital] ${metric.name}: ${
        metric.name === "CLS" ? metric.value.toFixed(3) : Math.round(metric.value)
      }${metric.name === "CLS" ? "" : "ms"} (${rating})`
    );
  }

  // Só envia métricas Core Web Vitals principais
  if (["LCP", "CLS", "INP", "FCP", "TTFB", "FID"].includes(metric.name)) {
    sendWebVital(enriched);
  }
}
