// ============================================================
// Estilo de post-it — validação compartilhada entre as rotas
// de criação (POST /api/posts) e edição (PATCH /api/posts/[id]).
//
// Só a cor de fundo (postItColor) é aceita do client. Os demais
// campos de post_style (fonte, negrito, itálico, cor de fonte)
// permanecem desabilitados nesta versão.
// ============================================================

// Precisa ficar em sincronia com POST_IT_COLORS em FeedView.tsx
// (e replicado em ProfileView.tsx / PostDetailDialog.tsx / UserProfileDialog.tsx).
export const POST_IT_COLOR_COUNT = 12;

// Índice usado quando o usuário não escolhe uma cor — post-it "neutro"
// (fundo branco / borda cinza claro).
export const NEUTRAL_POST_IT_COLOR = 10;

export interface PostStyleInput {
  postItColor?: unknown;
}

export interface SanitizedPostStyle {
  postItColor: number;
}

/**
 * Valida o post_style vindo do client. Aceita apenas um índice de cor
 * inteiro dentro da paleta; qualquer outra coisa (ausência, tipo errado,
 * índice fora do range, campos extras) é ignorada e cai no padrão neutro.
 */
export function sanitizePostItStyle(postStyle: unknown): SanitizedPostStyle {
  const idx = (postStyle as PostStyleInput | null | undefined)?.postItColor;
  if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < POST_IT_COLOR_COUNT) {
    return { postItColor: idx };
  }
  return { postItColor: NEUTRAL_POST_IT_COLOR };
}
