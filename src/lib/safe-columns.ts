/**
 * SEC-003: Colunas permitidas para consultas.
 * CENTRALIZA todas as listas para evitar SELECT *.
 */

export const PROFILE_SAFE_COLUMNS = [
  "id", "username", "display_name", "avatar_url", "bio", "neighborhood",
  "theme", "is_private", "hide_following", "hide_followers",
  "hide_neighborhood", "approve_followers", "created_at", "updated_at",
] as const;

export const PROFILE_PUBLIC_COLUMNS = [
  "id", "display_name", "username", "avatar_url", "neighborhood", "bio",
] as const;

export const ROOM_SAFE_COLUMNS = [
  "id", "name", "slug", "icon", "description", "type", "rules",
  "is_active", "is_open", "max_members", "member_count", "has_password",
  "created_at", "created_by",
] as const;

export const ROOM_MEMBERSHIP_COLUMNS = [
  "id", "is_active", "is_open", "max_members", "member_count",
] as const;

export function selectCols(cols: readonly string[]): string {
  return cols.join(", ");
}
