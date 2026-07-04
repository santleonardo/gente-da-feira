import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";

const GENERIC_SUCCESS_MESSAGE =
  "Se este e-mail estiver cadastrado, você receberá um link de recuperação em instantes.";

export async function POST(req: NextRequest) {
  try {
    // UX-001: Rate limit por IP — 3 requisições por hora
    const blocked = await rateLimitByRule(req, "auth:forgot", null);
    if (blocked) return blocked;

    // REL-006: Idempotência para prevenir envio duplicado de e-mail
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const idemBlock = await idempotencyGate(req, user?.id || "00000000-0000-0000-0000-000000000000");
    if (idemBlock) return idemBlock;

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
      console.error(
        "[auth:forgot] NEXT_PUBLIC_APP_URL não definida. Defina no .env.local"
      );
      const responseData = { message: GENERIC_SUCCESS_MESSAGE };
      await idempotencyStore(req, responseData);
      return NextResponse.json(responseData);
    }

    const baseUrl = appUrl.replace(/\/+$/, "");

    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${baseUrl}/reset-password`,
    });

    // UX-001: Anti-enumeration — SEMPRE retorna a mesma mensagem
    const responseData = { message: GENERIC_SUCCESS_MESSAGE };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch {
    await idempotencyFail(req);
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}
