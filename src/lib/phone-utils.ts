// ─── Utilitários de telefone/WhatsApp — mural de avisos das salas ───

/**
 * Sanitiza um número de telefone para uso em link do WhatsApp (wa.me).
 * Mantém apenas dígitos. Aceita DDI opcional (com ou sem "+").
 * Retorna null se o número não tiver um tamanho plausível (8–15 dígitos).
 */
export function sanitizeWhatsAppPhone(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Monta o link wa.me a partir de um telefone já sanitizado (só dígitos). */
export function buildWhatsAppLink(digits: string): string {
  return `https://wa.me/${digits}`;
}

/** Formata um telefone (só dígitos, com DDI) para exibição amigável em pt-BR. */
export function formatPhoneDisplay(digits: string): string {
  if (!digits) return "";
  // Brasil: DDI 55 + DDD (2) + número (8 ou 9)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 (${ddd}) ${mid}-${end}`;
  }
  return `+${digits}`;
}
