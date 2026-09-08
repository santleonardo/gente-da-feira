"use client";

import dynamic from "next/dynamic";

// PERF-002: PWARegister uses browser APIs (serviceWorker, Notification, etc.)
// Loading it dynamically prevents its code from blocking the initial render.
const PWARegister = dynamic(
  () => import("@/components/gdf/PWARegister").then((m) => ({ default: m.PWARegister })),
  { ssr: false }
);

export function PWARegisterLoader() {
  return <PWARegister />;
}
