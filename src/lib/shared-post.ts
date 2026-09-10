// ============================================================
// SEC-011: Repost de post deletado não deve vazar o conteúdo original.
//
// O join `shared_post:posts!shared_post_id(...)` usado em GET/PATCH de
// posts NÃO é filtrado por `is_deleted` pelo PostgREST (isso exigiria
// `!inner`, que excluiria também os posts que simplesmente não são
// reposts). Isso significa que, sem esta camada, o texto/fotos de um
// post deletado continuam aparecendo para sempre em qualquer repost
// dele — no feed, no detalhe do post, no perfil de quem repostou e em
// Descobrir.
//
// Toda rota que retorna um post com `shared_post` embutido DEVE passar
// o resultado por redactDeletedSharedPost() antes de responder ao
// cliente.
// ============================================================

export interface RawSharedPost {
  id: string;
  content?: string | null;
  image_urls?: string[] | null;
  video_url?: string | null;
  audio_url?: string | null;
  created_at?: string;
  is_deleted?: boolean;
  author?: unknown;
  author_id?: string;
  [key: string]: unknown;
}

export interface RedactedSharedPost {
  id: string;
  content: null;
  image_urls: null;
  video_url: null;
  audio_url: null;
  created_at?: string;
  author: null;
  removed: true;
}

/**
 * Normaliza o shape que o PostgREST retorna para relações self-referencing
 * (às vezes vem como array mesmo para 1 registro, às vezes objeto/null).
 */
export function normalizeSharedPost(
  sharedPost: RawSharedPost | RawSharedPost[] | null | undefined
): RawSharedPost | null {
  if (Array.isArray(sharedPost)) return sharedPost[0] ?? null;
  return sharedPost ?? null;
}

/**
 * Se o post original (shared_post) foi deletado, substitui o conteúdo
 * sensível por um placeholder — nunca remove o objeto inteiro, para que
 * a UI ainda saiba "isto era um repost" e possa mostrar
 * "Post original removido" em vez de simplesmente sumir com o contexto.
 *
 * Também remove o campo `is_deleted` da resposta em qualquer caso — ele
 * existe só para esta checagem interna, nunca deve ir para o cliente.
 */
export function redactDeletedSharedPost(
  sharedPostRaw: RawSharedPost | RawSharedPost[] | null | undefined
): RedactedSharedPost | (Omit<RawSharedPost, "is_deleted">) | null {
  const sharedPost = normalizeSharedPost(sharedPostRaw);
  if (!sharedPost) return null;

  if (sharedPost.is_deleted) {
    return {
      id: sharedPost.id,
      content: null,
      image_urls: null,
      video_url: null,
      audio_url: null,
      created_at: sharedPost.created_at,
      author: null,
      removed: true,
    };
  }

  const { is_deleted, ...rest } = sharedPost;
  return rest;
}
