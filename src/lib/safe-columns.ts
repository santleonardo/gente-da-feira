/**
 * SEC-003/SEC-009: Columnas permitidas para consultas.
 *
 * CENTRALIZA todas as listas de colunas para evitar SELECT *.
 * Qualquer query em profiles ou rooms DEVE usar estas constantes.
 * Nunca adicione colunas sensíveis (password_hash, tokens, etc.) aqui.
 *
 * SEC-009: Colunas de autor NÃO incluem neighborhood por padrão.
 * O neighborhood só deve ser incluído quando o autor NÃO tem
 * hide_neighborhood ativado. Use filterPostsAuthorNeighborhood()
 * e filterCommentAuthorsNeighborhood() do privacy-filter.ts.
 */

/** Colunas seguras para leitura do próprio perfil */
export const PROFILE_SAFE_COLUMNS = [
  "id",
  "username",
  "display_name",
  "avatar_url",
  "bio",
  "neighborhood",
  "theme",
  "is_private",
  "hide_following",
  "hide_followers",
  "hide_neighborhood",
  "approve_followers",
  "created_at",
  "updated_at",
] as const;

/**
 * SEC-009: Colunas para lookup/busca de usuários.
 * NOTA: `neighborhood` é buscado separadamente e filtrado
 * via privacy-filter.ts. Não inclua neighborhood em JOINs
 * de autor (posts, comentários, etc.).
 */
export const PROFILE_PUBLIC_COLUMNS = [
  "id",
  "display_name",
  "username",
  "avatar_url",
  "bio",
] as const;

/** SEC-009: Colunas para busca com neighborhood (filtrado depois) */
export const PROFILE_SEARCH_COLUMNS = [
  "id",
  "display_name",
  "username",
  "avatar_url",
  "bio",
  "neighborhood",
] as const;

/**
 * SEC-009: Colunas de perfil para JOIN como "author" em posts, comentários, etc.
 * NÃO inclui neighborhood — este deve ser adicionado condicionalmente
 * usando filterPostsAuthorNeighborhood() após a query.
 */
export const AUTHOR_PROFILE_COLUMNS = [
  "id", "display_name", "username", "avatar_url",
] as const;

/**
 * SEC-009: Colunas de perfil para JOIN como "author" com neighborhood.
 * Usado quando o viewer é o próprio autor ou quando se aplicará
 * filterPostsAuthorNeighborhood() depois.
 */
export const AUTHOR_PROFILE_COLUMNS_FULL = [
  "id", "display_name", "username", "avatar_url", "neighborhood",
] as const;

/**
 * SEC-009: Colunas de perfil para listas de seguidores/seguindo.
 * Bio pode ser filtrado se o perfil é privado.
 */
export const FOLLOW_LIST_PROFILE_COLUMNS = [
  "id", "display_name", "username", "avatar_url", "bio",
] as const;

/**
 * SEC-009: Colunas de perfil para listas de seguidores/seguindo SEM neighborhood.
 * O neighborhood é removido via privacy-filter.ts.
 */
export const FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH = [
  "id", "display_name", "username", "avatar_url",
] as const;

/** Colunas seguras para leitura de salas (SEM password_hash) */
export const ROOM_SAFE_COLUMNS = [
  "id",
  "name",
  "slug",
  "icon",
  "description",
  "type",
  "rules",
  "is_active",
  "is_open",
  "max_members",
  "member_count",
  "has_password",
  "created_at",
  "created_by",
] as const;

/** Colunas mínimas para checagem de membership em salas */
export const ROOM_MEMBERSHIP_COLUMNS = [
  "id",
  "is_active",
  "is_open",
  "max_members",
  "member_count",
] as const;

/**
 * SEC-009: Colunas explícitas para a tabela posts — nunca SELECT *
 * Exclui is_deleted (já filtrado via .eq) mas inclui todos os demais campos.
 */
export const POST_COLUMNS = [
  "id",
  "author_id",
  "content",
  "image_url",
  "image_urls",
  "video_url",
  "audio_url",
  "audio_duration",
  "video_duration",
  "visibility",
  "expires_at",
  "shared_post_id",
  "post_style",
  "post_type",
  "neighborhood",
  "created_at",
] as const;

/** SEC-009: Colunas para shared_post dentro de um post (subconjunto) */
export const SHARED_POST_COLUMNS = [
  "id",
  "content",
  "image_urls",
  "video_url",
  "audio_url",
  "created_at",
] as const;

/** Helper: junta colunas em string para .select() */
export function selectCols(cols: readonly string[]): string {
  return cols.join(", ");
}