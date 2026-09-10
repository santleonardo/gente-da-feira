import { NextResponse } from "next/server";

/**
 * ROTA ESTÁTICA INVÁLIDA — não use.
 * A API correta é /api/users/[id] (pasta com colchetes).
 * Este arquivo só existe para o TypeScript não quebrar o build
 * se a pasta "id" ainda estiver no repositório.
 *
 * Depois do deploy, APAGUE esta pasta inteira:
 *   rm -rf src/app/api/users/id
 * e faça commit da exclusão.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Rota inválida. Use /api/users/{uuid}" },
    { status: 404 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Rota inválida. Use /api/users/{uuid}" },
    { status: 404 }
  );
}
