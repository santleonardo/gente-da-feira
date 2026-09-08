/**
 * URL canônica do app — usada em metadata, sitemap, robots e JSON-LD.
 * Defina NEXT_PUBLIC_APP_URL no .env (ex.: https://gentedafeira.com.br).
 * Em Vercel, cai em https://$VERCEL_URL se a env não existir.
 */
export function getSiteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const vercel = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vercel) {
    return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  }

  // Fallback de desenvolvimento — não use em produção sem NEXT_PUBLIC_APP_URL
  return "http://localhost:3000";
}

export const SITE_NAME = "Gente da Feira";
export const SITE_TAGLINE =
  "A rede social do seu bairro em Feira de Santana. Converse, publique e conecte-se com vizinhos.";
export const SITE_DESCRIPTION_SHORT =
  "Rede social de bairro em Feira de Santana — posts, salas e conexão com a vizinhança.";
