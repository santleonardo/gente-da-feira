// ============================================================
// API de upload de áudios para o Supabase Storage
// Bucket: post-audios (público)
//
// LIGHT / SUPABASE FREE: desabilitado no beta público.
// Para reativar, remova o early-return e restaure a lógica original.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Upload de áudio está desabilitado nesta versão beta." },
    { status: 403 }
  );
}
