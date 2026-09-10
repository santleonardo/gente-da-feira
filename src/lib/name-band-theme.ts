/**
 * Cores da faixa do nome no perfil (até 7 opções).
 * Armazenadas em profiles.theme como slug estável.
 * Texto sempre com contraste legível sobre o fundo.
 */

export const NAME_BAND_THEMES = [
  {
    id: "navy",
    label: "Navy",
    bg: "#1B2A4A",
    text: "#F5F4F1",
    line: "rgba(255,255,255,0.32)",
  },
  {
    id: "rosa",
    label: "Rosa",
    bg: "#C45B7A",
    text: "#FFF8FA",
    line: "rgba(255,255,255,0.35)",
  },
  {
    id: "amarelo",
    label: "Amarelo",
    bg: "#D4A017",
    text: "#1A1408",
    line: "rgba(26,20,8,0.28)",
  },
  {
    id: "preto",
    label: "Preto",
    bg: "#1A1A1A",
    text: "#F5F4F1",
    line: "rgba(255,255,255,0.28)",
  },
  {
    id: "verde",
    label: "Verde",
    bg: "#1F6B4A",
    text: "#F2FBF6",
    line: "rgba(255,255,255,0.32)",
  },
  {
    id: "vermelho",
    label: "Vermelho",
    bg: "#B33A3A",
    text: "#FFF6F6",
    line: "rgba(255,255,255,0.32)",
  },
  {
    id: "lilas",
    label: "Lilás",
    bg: "#6B5B95",
    text: "#F7F5FB",
    line: "rgba(255,255,255,0.32)",
  },
] as const;

export type NameBandThemeId = (typeof NAME_BAND_THEMES)[number]["id"];

export const NAME_BAND_THEME_IDS = NAME_BAND_THEMES.map((t) => t.id);

export const DEFAULT_NAME_BAND_THEME: NameBandThemeId = "navy";

export function isNameBandThemeId(value: unknown): value is NameBandThemeId {
  return typeof value === "string" && (NAME_BAND_THEME_IDS as readonly string[]).includes(value);
}

export function resolveNameBandTheme(theme: string | null | undefined) {
  const id = isNameBandThemeId(theme) ? theme : DEFAULT_NAME_BAND_THEME;
  return NAME_BAND_THEMES.find((t) => t.id === id)!;
}

export function sanitizeNameBandTheme(value: unknown): NameBandThemeId {
  return isNameBandThemeId(value) ? value : DEFAULT_NAME_BAND_THEME;
}
