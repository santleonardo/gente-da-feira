/**
 * SEC-003: Tratamento seguro de erros.
 *
 * Nunca retorne error.message diretamente ao cliente em produção.
 * Mensagens de erro do PostgreSQL/Supabase podem conter:
 *   - Nomes de tabelas e colunas
 *   - Stack traces parciais
 *   - Detalhes de conexão com banco
 *   - Informações sobre schema interno
 */

/** Mensagem genérica para erros internos do servidor (500) */
const GENERIC_ERROR_MESSAGE = "Erro interno do servidor. Tente novamente.";

/**
 * Retorna uma resposta JSON segura para erros internos.
 * Loga o erro real no servidor mas retorna mensagem genérica ao cliente.
 */
export function safeErrorResponse(
  error: unknown,
  status: number = 500,
  logPrefix: string = "[SEC-003]"
): { message: string; status: number } {
  // Log detalhado apenas no servidor
  if (error instanceof Error) {
    console.error(`${logPrefix}`, error.message);
  } else {
    console.error(`${logPrefix}`, error);
  }

  // Retorna apenas mensagem genérica para o cliente
  return {
    message: GENERIC_ERROR_MESSAGE,
    status,
  };
}

/**
 * Extrai mensagem de erro safe para logs (nunca para o cliente).
 * Remove possíveis dados sensíveis de mensagens de erro do banco.
 */
export function sanitizeForLog(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    // Trunca mensagens muito longas (possível data exfil)
    return error.length > 500 ? error.slice(0, 500) + "..." : error;
  }
  return "Erro desconhecido";
}