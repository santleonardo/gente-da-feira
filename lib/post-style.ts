// ============================================================
// Estilo de post — validação compartilhada (API + client).
//
// Fonte única da whitelist de fontes: ALLOWED_POST_FONTS.
// ProfileView / FeedView devem importar daqui (não duplicar lista).
// ============================================================

export const POST_IT_COLOR_COUNT = 12;

/** Índice padrão quando o usuário não escolhe cor de post-it. */
export const NEUTRAL_POST_IT_COLOR = 10;

/**
 * Fontes permitidas no editor e aceitas pela API.
 * Qualquer valor fora desta lista é descartado no sanitize.
 */
export const ALLOWED_POST_FONTS = [
  "Nunito",
  "Quicksand",
  "Poppins",
  "Inter",
  "Comfortaa",
  "Montserrat",
  "Lato",
  "Raleway",
  "DM Sans",
  "Work Sans",
] as const;

export type AllowedPostFont = (typeof ALLOWED_POST_FONTS)[number];

const ALLOWED_FONT_SET = new Set<string>(ALLOWED_POST_FONTS);

const ALLOWED_ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

/** Hex #RGB ou #RRGGBB */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface PostStyleInput {
  postItColor?: unknown;
  font?: unknown;
  bold?: unknown;
  italic?: unknown;
  alignment?: unknown;
  fontColor?: unknown;
}

export interface SanitizedPostStyle {
  postItColor: number;
  font: AllowedPostFont | null;
  bold: boolean;
  italic: boolean;
  alignment: "left" | "center" | "right" | "justify";
  fontColor: string | null;
}

/** True se a string é uma fonte da whitelist (case-sensitive, nomes oficiais). */
export function isAllowedPostFont(font: string | null | undefined): font is AllowedPostFont {
  return typeof font === "string" && ALLOWED_FONT_SET.has(font);
}

/**
 * Valida post_style do client.
 * Campos inválidos caem em defaults seguros (não rejeitam o post).
 */
export function sanitizePostStyle(postStyle: unknown): SanitizedPostStyle {
  const raw = (
    postStyle && typeof postStyle === "object" ? (postStyle as PostStyleInput) : {}
  ) as PostStyleInput;

  let postItColor = NEUTRAL_POST_IT_COLOR;
  if (
    typeof raw.postItColor === "number" &&
    Number.isInteger(raw.postItColor) &&
    raw.postItColor >= 0 &&
    raw.postItColor < POST_IT_COLOR_COUNT
  ) {
    postItColor = raw.postItColor;
  }

  let font: AllowedPostFont | null = null;
  if (typeof raw.font === "string") {
    const trimmed = raw.font.trim();
    if (isAllowedPostFont(trimmed)) font = trimmed;
  }

  const bold = raw.bold === true;
  const italic = raw.italic === true;

  let alignment: SanitizedPostStyle["alignment"] = "left";
  if (typeof raw.alignment === "string" && ALLOWED_ALIGNMENTS.has(raw.alignment)) {
    alignment = raw.alignment as SanitizedPostStyle["alignment"];
  }

  let fontColor: string | null = null;
  if (typeof raw.fontColor === "string" && HEX_COLOR_RE.test(raw.fontColor.trim())) {
    fontColor = raw.fontColor.trim().toLowerCase();
  }

  return { postItColor, font, bold, italic, alignment, fontColor };
}

/** @deprecated use sanitizePostStyle */
export function sanitizePostItStyle(postStyle: unknown): { postItColor: number } {
  return { postItColor: sanitizePostStyle(postStyle).postItColor };
}

/** True se vale persistir (algo além do default neutro). */
export function isMeaningfulPostStyle(style: SanitizedPostStyle): boolean {
  return (
    style.font != null ||
    style.bold ||
    style.italic ||
    style.alignment !== "left" ||
    style.fontColor != null ||
    style.postItColor !== NEUTRAL_POST_IT_COLOR
  );
}
