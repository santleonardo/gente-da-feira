import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    // Rotas públicas adicionais (landing / marketing) podem entrar aqui.
    // Não listar /api, /admin, DMs, feed autenticado ou posts privados.
  ];
}
