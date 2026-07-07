"use client";
import dynamic from "next/dynamic";

const PWARegister = dynamic(
  () => import("@/components/gdf/PWARegister").then((m) => ({ default: m.PWARegister })),
  { ssr: false }
);

export function PWARegisterLoader() {
  return <PWARegister />;
}
