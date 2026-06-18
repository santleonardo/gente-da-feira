const GENERIC_ERROR_MESSAGE = "Erro interno do servidor. Tente novamente.";

export function safeErrorResponse(
  error: unknown,
  status: number = 500,
  logPrefix: string = "[SEC-003]"
): { message: string; status: number } {
  if (error instanceof Error) {
    console.error(`${logPrefix}`, error.message);
  } else {
    console.error(`${logPrefix}`, error);
  }
  return { message: GENERIC_ERROR_MESSAGE, status };
}

export function sanitizeForLog(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") {
    return error.length > 500 ? error.slice(0, 500) + "..." : error;
  }
  return "Erro desconhecido";
}
