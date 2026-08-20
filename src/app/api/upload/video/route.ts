// ============================================================
// API de upload de vídeos para o Supabase Storage
// Bucket: post-videos (público)
// Máximo: 50MB, formatos: video/mp4, video/webm
//
// LIGHT / SUPABASE FREE: desabilitado no beta público.
// Para reativar, remova o early-return e restaure a lógica original.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Upload de vídeo está desabilitado nesta versão beta." },
    { status: 403 }
  );
}
