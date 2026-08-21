/**
 * UX-024: Constantes compartilhadas do sistema de denúncias.
 *
 * Única fonte de verdade para categorias, tipos de alvo e status —
 * usada tanto pelas API routes (validação) quanto pelos componentes
 * de UI (ReportDialog, AdminReportsView).
 */

export const REPORT_TARGET_TYPES = [
  "post",
  "comment",
  "dm_message",
  "room_message",
  "profile",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  post: "Post",
  comment: "Comentário",
  dm_message: "Mensagem privada",
  room_message: "Mensagem de sala",
  profile: "Perfil",
};

export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "hate_speech",
  "inappropriate_content",
  "violence",
  "nudity",
  "fraud",
  "misinformation",
  "copyright",
  "impersonation",
  "illegal_activity",
  "other",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: "Spam ou propaganda indevida",
  harassment: "Assédio ou bullying",
  hate_speech: "Discurso de ódio",
  inappropriate_content: "Conteúdo impróprio",
  violence: "Violência ou incitação à violência",
  nudity: "Nudez ou conteúdo sexual",
  fraud: "Fraude ou golpe",
  misinformation: "Informação falsa",
  copyright: "Violação de direitos autorais",
  impersonation: "Perfil falso ou personificação",
  illegal_activity: "Atividade ilegal",
  other: "Outro motivo",
};

/** Categorias que exigem descrição obrigatória (motivos ambíguos por natureza) */
export const REPORT_CATEGORIES_REQUIRING_DESCRIPTION: ReadonlySet<ReportCategory> = new Set([
  "other",
]);

export const REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pendente",
  reviewing: "Em análise",
  resolved: "Resolvida",
  dismissed: "Arquivada",
};

export const MAX_REPORT_DESCRIPTION_LENGTH = 1000;

export function isValidReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === "string" && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isValidReportCategory(value: unknown): value is ReportCategory {
  return typeof value === "string" && (REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isValidReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}
