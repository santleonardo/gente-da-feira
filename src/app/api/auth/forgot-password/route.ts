import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

const GENERIC_SUCCESS_MESSAGE =
  "Se este e-mail estiver cadastrado, você receberá um link de recuperação em instantes.";

export async function POST(req: NextRequest) {
  try {
    // UX-001: Rate limit por IP — 3 requisições por hora
    const blocked = await rateLimitByRule(req, "auth:forgot", null);
    if (blocked) return blocked;

    let email: string | undefined;

    try {
      const body = await req.json();
      email = body?.email;
    } catch {
      // JSON inválido — retorna mensagem genérica (anti-enumeration)
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    // Validação básica de formato
    if (
      !email ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      // NEXT_PUBLIC_APP_URL não configurado — log para debug mas retorna
      // mensagem genérica para não vazar info interna
      console.error(
        "[auth:forgot] NEXT_PUBLIC_APP_URL não definida. Defina no .env.local"
      );
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    const supabase = await createClient();

    // Solicita envio de e-mail de recuperação ao Supabase.
    // O Supabase retorna erro se o e-mail não existe, mas nós
    // ignoramos o resultado para evitar enumeração de contas.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appUrl}/reset-password`,
    });

    // UX-001: Anti-enumeration — SEMPRE retorna a mesma mensagem,
    // independentemente do e-mail existir ou não.
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  } catch {
    // Qualquer erro interno também retorna mensagem genérica
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}