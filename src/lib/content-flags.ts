/** Categorias de post (content_flag) — mesmas do composer do feed. */

export type ContentFlagValue =
  | "aviso"
  | "achados_e_perdidos"
  | "pedido_de_ajuda"
  | "publicidade"
  | "outro";

export const CONTENT_FLAG_OPTIONS: {
  value: ContentFlagValue;
  label: string;
  emoji: string;
}[] = [
  { value: "aviso", label: "Aviso", emoji: "📢" },
  { value: "achados_e_perdidos", label: "Achados e perdidos", emoji: "🔍" },
  { value: "pedido_de_ajuda", label: "Pedido de ajuda", emoji: "🙏" },
  { value: "publicidade", label: "Publicidade", emoji: "🏷️" },
  { value: "outro", label: "Outro", emoji: "💬" },
];

export const CONTENT_FLAG_VALUES = CONTENT_FLAG_OPTIONS.map((o) => o.value);

export function isContentFlagValue(v: string | null | undefined): v is ContentFlagValue {
  return !!v && (CONTENT_FLAG_VALUES as string[]).includes(v);
}

export function contentFlagLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return CONTENT_FLAG_OPTIONS.find((o) => o.value === v)?.label ?? null;
}
