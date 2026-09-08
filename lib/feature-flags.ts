/**
 * Feature flags / kill switches para o beta público.
 *
 * Ative no ambiente (Vercel → Settings → Environment Variables)
 * sem precisar alterar código:
 *
 *   KILL_SWITCH_SIGNUP=1      — bloqueia novos cadastros
 *   KILL_SWITCH_READONLY=1    — app somente leitura (sem posts/comentários/msgs)
 *
 * Valores aceitos como "ligado": "1", "true", "yes", "on" (case-insensitive).
 */

function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** Bloqueia criação de novas contas. */
export function isSignupDisabled(): boolean {
  return envFlag("KILL_SWITCH_SIGNUP");
}

/**
 * Modo somente leitura: bloqueia criação de conteúdo
 * (posts, comentários, mensagens, etc.). Login e leitura seguem ok.
 */
export function isReadOnlyMode(): boolean {
  return envFlag("KILL_SWITCH_READONLY");
}

/** Mensagens padrão para respostas 503. */
export const KILL_SWITCH_MESSAGES = {
  signup:
    "Cadastros temporariamente desabilitados. Tente novamente mais tarde.",
  readonly:
    "O app está em modo somente leitura no momento. Você ainda pode navegar e ler conteúdo.",
} as const;
