/**
 * Paletas de cores acessíveis — Gente da Feira
 *
 * Fonte de verdade paralela ao CSS (`globals.css` → :root / .dark).
 * Use estes tokens em JS (canvas, e-mail, charts) e prefira classes
 * Tailwind/CSS (`bg-gdf-paper`, `text-gdf-ink`, `.text-ink-muted`) na UI.
 *
 * Contraste medido aproximado vs papel claro (#F9F8F6 / #F7F9FA):
 * WCAG 2.2 AA = 4.5:1 (texto normal), 3:1 (texto grande / UI).
 */

export const paletteLight = {
  paper: "#F9F8F6",
  ink: "#1A1A1A", // ~15.8:1 AAA
  inkMuted: "#3A3A3A", // ~10.6:1 AAA — preferir a #4A4A4A legado
  inkSubtle: "#555555", // ~7.0:1 AA
  teal: "#0A4D5C", // ~8.2:1 AAA
  tealSoft: "#0D5F71",
  tealForeground: "#F7F9FA",
  terracotta: "#C45A3A", // decorativo / ícones
  terracottaText: "#A8482E", // links/texto sobre claro (~5.1:1 AA)
  yellow: "#E6E04A",
  yellowForeground: "#000305",
  success: "#1B6B4A",
  warning: "#9A6B00",
  danger: "#C62828",
  focus: "#0A4D5C",
  border: "#B7CED6",
  mutedSurface: "#E8F0F2",
} as const;

export const paletteDark = {
  paper: "#121416",
  ink: "#F2F1EE",
  inkMuted: "#C8C6C1",
  inkSubtle: "#A09E98",
  teal: "#5EB8C9",
  tealSoft: "#7ECADB",
  tealForeground: "#0A1A1E",
  terracotta: "#E08A6C",
  terracottaText: "#F0A58C",
  yellow: "#E6E04A",
  yellowForeground: "#0A0A0A",
  success: "#6BC49A",
  warning: "#E0B84A",
  danger: "#F07171",
  focus: "#7ECADB",
  border: "#2E3A3E",
  mutedSurface: "#1E2A2E",
} as const;

/** Aliases legados → tokens acessíveis (migração gradual) */
export const legacyColorMap = {
  "#4A4A4A": paletteLight.inkMuted,
  "#4a4a4a": paletteLight.inkMuted,
  "#D96C4A": paletteLight.terracotta,
  "#d96c4a": paletteLight.terracotta,
  "#F9F8F6": paletteLight.paper,
  "#f9f8f6": paletteLight.paper,
  "#1A1A1A": paletteLight.ink,
  "#1a1a1a": paletteLight.ink,
  "#f7f75e": paletteLight.yellow,
  "#F7F75E": paletteLight.yellow,
} as const;

export type Palette = typeof paletteLight;
