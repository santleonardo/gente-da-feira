/**
 * Validação centralizada de texto (client + server).
 * Limites alinhados com as APIs existentes.
 */

export const TEXT_LIMITS = {
  post: 1000,
  comment: 300,
  dmMessage: 2000,
  roomMessage: 2000,
  bio: 300,
  displayName: { min: 2, max: 80 },
  username: { min: 3, max: 30 },
  bulletin: 2000,
  roomRules: 500,
  roomDescription: 200,
  neighborhood: 100,
} as const;

export type TextField =
  | "post"
  | "comment"
  | "dmMessage"
  | "roomMessage"
  | "bio"
  | "displayName"
  | "username"
  | "bulletin"
  | "roomRules"
  | "roomDescription"
  | "neighborhood";

export type TextValidationResult = {
  ok: boolean;
  error?: string;
  /** Texto normalizado (trim + sem controles), sem HTML */
  normalized: string;
  /** Tamanho do texto plano (sem tags) */
  length: number;
};

/** Remove tags HTML e decodifica entidades simples para contar chars reais */
export function toPlainText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&\w+;/g, " ")
    .replace(/\u0000/g, "")
    // Controles (exceto \n \r \t)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{3,}/g, "  ");
}

function limitsFor(field: TextField): { min: number; max: number; label: string; required: boolean } {
  switch (field) {
    case "post":
      return { min: 0, max: TEXT_LIMITS.post, label: "Post", required: false };
    case "comment":
      return { min: 1, max: TEXT_LIMITS.comment, label: "Comentário", required: true };
    case "dmMessage":
      return { min: 0, max: TEXT_LIMITS.dmMessage, label: "Mensagem", required: false };
    case "roomMessage":
      return { min: 0, max: TEXT_LIMITS.roomMessage, label: "Mensagem", required: false };
    case "bio":
      return { min: 0, max: TEXT_LIMITS.bio, label: "Bio", required: false };
    case "displayName":
      return {
        min: TEXT_LIMITS.displayName.min,
        max: TEXT_LIMITS.displayName.max,
        label: "Nome",
        required: true,
      };
    case "username":
      return {
        min: TEXT_LIMITS.username.min,
        max: TEXT_LIMITS.username.max,
        label: "Username",
        required: true,
      };
    case "bulletin":
      return { min: 0, max: TEXT_LIMITS.bulletin, label: "Aviso", required: false };
    case "roomRules":
      return { min: 0, max: TEXT_LIMITS.roomRules, label: "Regras", required: false };
    case "roomDescription":
      return { min: 0, max: TEXT_LIMITS.roomDescription, label: "Descrição", required: false };
    case "neighborhood":
      return { min: 0, max: TEXT_LIMITS.neighborhood, label: "Bairro", required: false };
    default:
      return { min: 0, max: 1000, label: "Texto", required: false };
  }
}

/**
 * Validação genérica de texto.
 * @param allowEmpty — se true, string vazia é válida (ex.: post só com mídia)
 */
export function validateText(
  input: string | null | undefined,
  field: TextField,
  options?: { allowEmpty?: boolean; hasMedia?: boolean }
): TextValidationResult {
  const raw = typeof input === "string" ? input : "";
  const plain = toPlainText(raw).trim();
  const length = plain.length;
  const { min, max, label, required } = limitsFor(field);
  const allowEmpty =
    options?.allowEmpty === true ||
    (field === "post" && options?.hasMedia === true) ||
    (field === "dmMessage" && options?.hasMedia === true) ||
    (field === "roomMessage" && options?.hasMedia === true);

  if (!plain) {
    if (required && !allowEmpty) {
      return { ok: false, error: `${label} não pode estar vazio`, normalized: "", length: 0 };
    }
    if (!allowEmpty && (field === "post" || field === "dmMessage" || field === "roomMessage")) {
      return {
        ok: false,
        error: `${label} é obrigatório (ou anexe uma mídia)`,
        normalized: "",
        length: 0,
      };
    }
    return { ok: true, normalized: "", length: 0 };
  }

  if (length < min) {
    return {
      ok: false,
      error: `${label} deve ter pelo menos ${min} caracteres`,
      normalized: plain,
      length,
    };
  }

  if (length > max) {
    return {
      ok: false,
      error: `${label} muito longo (máx ${max} caracteres)`,
      normalized: plain.slice(0, max),
      length,
    };
  }

  // Username: só a-z 0-9 _
  if (field === "username") {
    const sanitized = plain.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (sanitized !== plain.toLowerCase() || !/^[a-z0-9_]+$/.test(sanitized)) {
      return {
        ok: false,
        error: "Username: apenas letras minúsculas, números e _",
        normalized: sanitized,
        length: sanitized.length,
      };
    }
    if (sanitized.length < min) {
      return {
        ok: false,
        error: `Username deve ter pelo menos ${min} caracteres`,
        normalized: sanitized,
        length: sanitized.length,
      };
    }
    return { ok: true, normalized: sanitized, length: sanitized.length };
  }

  // Spam simples: mesmo caractere repetido demais
  if (/(.)\1{29,}/.test(plain)) {
    return {
      ok: false,
      error: `${label} contém caracteres repetidos em excesso`,
      normalized: plain,
      length,
    };
  }

  // Só espaços zero-width / invisíveis
  if (/^[\u200B-\u200D\uFEFF\s]+$/.test(raw)) {
    return {
      ok: false,
      error: `${label} inválido`,
      normalized: "",
      length: 0,
    };
  }

  return { ok: true, normalized: plain, length };
}

/** Helper para UI: cor do contador conforme proximidade do limite */
export function textCountTone(length: number, max: number): "ok" | "warn" | "over" {
  if (length > max) return "over";
  if (length >= max * 0.9) return "warn";
  return "ok";
}
