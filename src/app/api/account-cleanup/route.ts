// POST /api/account-cleanup
// Endpoint INTERNO — chamado por pg_cron/pg_net para exclusão permanente.
//
// Fluxo:
//   1. Valida autenticação interna (bearer token)
//   2. Parse do body: { userId, storagePaths }
//   3. Remove arquivos de storage listados em storagePaths
//   4. Varre TODOS os buckets removendo arquivos do diretório do usuário
//   5. Deleta o auth user
//
// Segurança:
//   - INTERNAL_API_SECRET obrigatório (fail-closed via validateInternalAuth)
//   - Apenas chamável por serviços internos

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { extractStoragePathFromUrl, ALLOWED_BUCKETS } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";

/** Todos os buckets onde o usuário pode ter arquivos */
const ALL_BUCKETS = ["avatars", "post-photos", "post-images", "post-videos", "post-audios", "profile-videos"];

export async function POST(req: NextRequest) {
  // ── 1. Autenticação interna (SEC-001) ───────────────────────────────
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    // ── 2. Parse do body ───────────────────────────────────────────────
    let userId: string;
    let storagePaths: string[];

    try {
      const body = await req.json();
      userId = body?.userId;
      storagePaths = body?.storagePaths || [];
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
    }

    if (!Array.isArray(storagePaths)) {
      storagePaths = [];
    }

    const admin = createAdminClient();

    // ── 3. Remover arquivos de storage listados em storagePaths ────────
    for (const url of storagePaths) {
      try {
        const parsed = extractStoragePathFromUrl(url);
        if (parsed) {
          await admin.storage.from(parsed.bucket).remove([parsed.path]);
        }
      } catch (err) {
        console.error(`[account-cleanup] Erro ao remover arquivo ${url}:`, err);
      }
    }

    // ── 4. Varrer todos os buckets e remover diretório do usuário ──────
    for (const bucket of ALL_BUCKETS) {
      try {
        // Listar todos os arquivos no diretório do usuário
        const { data: files } = await admin.storage.from(bucket).list(`${userId}/`);

        if (files && files.length > 0) {
          // Montar paths completos
          const paths = files
            .filter((f) => f.name) // ignorar pastas sem nome
            .map((f) => `${userId}/${f.name}`);

          // Remover em lotes (storage remove suporta array)
          if (paths.length > 0) {
            await admin.storage.from(bucket).remove(paths);
          }

          // Recursão: remover arquivos em subpastas (posts/, video-thumbs/, etc.)
          for (const file of files) {
            if (file.metadata?.name || file.id) {
              // Se for pasta, tentar listar e remover recursivamente
              const subPath = `${userId}/${file.name}`;
              try {
                const { data: subFiles } = await admin.storage.from(bucket).list(subPath);
                if (subFiles && subFiles.length > 0) {
                  const subPaths = subFiles.map((sf) => `${subPath}/${sf.name}`);
                  await admin.storage.from(bucket).remove(subPaths);
                }
              } catch {
                // Ignorar erros de subpastas
              }
            }
          }
        }
      } catch (err) {
        console.error(`[account-cleanup] Erro ao varrer bucket ${bucket}/${userId}/:`, err);
      }
    }

    // ── 5. Deletar o auth user ──────────────────────────────────────────
    let authDeletionFailed = false;
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (err) {
      console.error(`[account-cleanup] Erro ao deletar auth user ${userId}:`, err);
      authDeletionFailed = true;
    }

    // ── 6. Retornar resultado ──────────────────────────────────────────
    if (authDeletionFailed) {
      // Storage foi limpo, mas auth user não pôde ser deletado
      // Retornar sucesso parcial para que o cron não tente limpar storage de novo
      return NextResponse.json({
        success: true,
        deletedUser: userId,
        warning: "Storage cleanup completed but auth user deletion failed",
      });
    }

    return NextResponse.json({ success: true, deletedUser: userId });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[account-cleanup]");
    return NextResponse.json({ error: message }, { status });
  }
}
