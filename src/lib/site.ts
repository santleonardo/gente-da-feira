/**
 * URL canônica do app — metadata, sitemap, robots e JSON-LD.
 *
 * Prioridade:
 *   1. NEXT_PUBLIC_APP_URL (recomendado na Vercel)
 *   2. Domínio de produção conhecido (www.gentedafeira.com)
 *   3. VERCEL_URL (preview deployments)
 *   4. localhost (dev)
 */

/** Domínio oficial de produção (sem barra final). */
export const PRODUCTION_SITE_URL = "https://www.gentedafeira.com";

export function getSiteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) {
    // Normaliza apex → www (canonical único)
    if (
      fromEnv === "https://gentedafeira.com" ||
      fromEnv === "http://gentedafeira.com"
    ) {
      return PRODUCTION_SITE_URL;
    }
    return fromEnv;
  }

  // Build de produção sem env: usa domínio oficial (evita vercel.app no canonical)
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV?.includes("preview")) {
    return PRODUCTION_SITE_URL;
  }

  const vercel = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vercel) {
    // Preview: mantém URL do deployment; production Vercel sem env → domínio oficial
    if (process.env.VERCEL_ENV === "production") {
      return PRODUCTION_SITE_URL;
    }
    return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  }

  return "http://localhost:3000";
}

export const SITE_NAME = "Gente da Feira";
export const SITE_TAGLINE =
  "A rede social do seu bairro em Feira de Santana. Converse, publique e conecte-se com vizinhos.";
export const SITE_DESCRIPTION_SHORT =
  "Rede social de bairro em Feira de Santana — posts, salas e conexão com a vizinhança.";

/** Repositório público no GitHub. */
export const GITHUB_REPO_URL = "https://github.com/santleonardo/gente-da-feira";
