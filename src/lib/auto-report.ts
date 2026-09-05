/**
 * MOD-001 / MOD-002: Registra automaticamente uma denúncia quando alguma
 * checagem de IA (spam-check.ts para posts/comentários, chat-moderation.ts
 * para salas/DMs) classifica conteúdo como problemático.
 *
 * Reaproveita 100% a tabela `reports` e o painel AdminReportsView já
 * existentes — o item cai na fila de moderação normal, com status
 * "pending", como se um usuário tivesse denunciado. Os target_type
 * "room_message" e "dm_message" já existem em REPORT_TARGET_TYPES
 * (report-constants.ts) — só não eram usados por nenhum fluxo automático
 * até o MOD-002.
 *
 * Requer uma conta de sistema (perfil "Gente da Feira · Moderação" ou
 * similar) cujo ID vai em SYSTEM_REPORTER_USER_ID. Isso evita mexer na
 * constraint anti-autodenúncia da tabela `reports` (reporter_id !=
 * target_owner_id) — é só mais um usuário normal fazendo a denúncia.
 *
 * Ver instruções de setup no final deste arquivo.
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { ReportCategory, ReportTargetType } from "@/lib/report-constants";
import { REPORT_CATEGORY_LABELS } from "@/lib/report-constants";

export async function autoReportContent(params: {
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerId: string;
  /** Categoria real detectada pela IA — default "spam" por compatibilidade */
  category?: ReportCategory;
  reason: string | null;
}): Promise<void> {
  const systemReporterId = process.env.SYSTEM_REPORTER_USER_ID;
  if (!systemReporterId) return; // sem conta de sistema configurada → não registra

  // Nunca denuncia o próprio "sistema" nem tenta se a IA falhar em identificar o dono
  if (!params.targetOwnerId || params.targetOwnerId === systemReporterId) return;

  const category = params.category ?? "spam";

  try {
    const admin = createAdminClient();
    await admin.from("reports").insert({
      reporter_id: systemReporterId,
      target_type: params.targetType,
      target_id: params.targetId,
      target_owner_id: params.targetOwnerId,
      category,
      description: params.reason
        ? `[Auto-detectado por IA] ${params.reason}`
        : `[Auto-detectado por IA] Conteúdo classificado como "${REPORT_CATEGORY_LABELS[category]}".`,
    });
  } catch {
    // Best-effort — nunca deve quebrar o fluxo de criação/envio de conteúdo.
    // Causas comuns: já existe denúncia ativa pra esse alvo (unique index),
    // conta de sistema não configurada corretamente, etc.
  }
}

/** @deprecated use autoReportContent — mantido para não quebrar posts-route.ts */
export async function autoReportSpam(params: {
  targetType: "post" | "comment";
  targetId: string;
  targetOwnerId: string;
  reason: string | null;
}): Promise<void> {
  return autoReportContent({ ...params, category: "spam" });
}

/**
 * ── Setup (uma vez) ──────────────────────────────────────────────────
 *
 * 1. Crie um usuário normal no app (ex.: cadastre "moderacao@seudominio")
 *    para servir de "conta de sistema". Pode deixar sem posts, sem avatar.
 * 2. Pegue o UUID desse usuário (profiles.id) e configure:
 *      SYSTEM_REPORTER_USER_ID=<uuid>
 * 3. (Opcional, recomendado) Marque esse usuário como moderador também,
 *    ou deixe comum — reporter_id só precisa ser um perfil válido e
 *    diferente do dono do conteúdo denunciado.
 * 4. Ligue a checagem de spam:
 *      SPAM_CHECK_ENABLED=1
 *      GEMINI_API_KEY=<sua chave do Google AI Studio>
 *
 * Sem SYSTEM_REPORTER_USER_ID configurado, o spam ainda é detectado e
 * logado (ver rota), mas nenhuma denúncia automática é criada.
 */
