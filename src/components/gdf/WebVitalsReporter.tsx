"use client";

import { useReportWebVitals } from "next/web-vitals";
import { handleWebVital, type WebVitalMetric } from "@/lib/web-vitals";

/**
 * Coleta Core Web Vitals via API do Next.js (`useReportWebVitals`).
 * Métricas: LCP, CLS, INP, FCP, TTFB (+ hidratação Next).
 *
 * Layout raiz:
 * ```tsx
 * import { WebVitalsReporter } from "@/components/gdf/WebVitalsReporter";
 * <WebVitalsReporter />
 * ```
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    handleWebVital({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: (metric as { rating?: WebVitalMetric["rating"] }).rating,
      delta: (metric as { delta?: number }).delta,
    });
  });

  return null;
}
