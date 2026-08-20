// ============================================================
// POST /api/auth/register
// Cadastro server-side com:
//   - Rate limit por IP (auth:register — 5/dia)
//   - Termos de Uso e declaração de maioridade OBRIGATÓRIOS
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizeShortText } from "@/lib/sanitize";
import { PROFILE_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { TERMS_VERSION } from "@/lib/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) return "Senha deve ter pelo menos 8 caracteres";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Senha deve conter letras e números";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP — anti-spam de contas no beta
    const blocked = await rateLimitByRule(req, "auth:register", null);
    if (blocked) return blocked;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const neighborhood =
      typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
    const agreedTerms = body.agreedTerms === true;
    const declaredAdult = body.declaredAdult === true;

    // Termos e maioridade — obrigatórios no servidor (não confiar só no client)
    if (!agreedTerms) {
      return NextResponse.json(
        { error: "Você precisa aceitar os Termos de Uso para se cadastrar" },
        { status: 400 }
      );
    }
    if (!declaredAdult) {
      return NextResponse.json(
        { error: "Você precisa declarar que tem 18 anos ou mais" },
        { status: 400 }
      );
    }

    if (!name || name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "Usuário inválido (3–24 caracteres: letras, números ou _)" },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    }
    const passError = validatePasswordStrength(password);
    if (passError) {
      return NextResponse.json({ error: passError }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: sanitizeShortText(name, 80),
          username: username.toLowerCase(),
          neighborhood: sanitizeShortText(neighborhood, 100) || null,
          terms_accepted: true,
          terms_version: TERMS_VERSION,
          declared_adult: true,
        },
      },
    });

    if (error) {
      // Mensagens comuns do Supabase sem vazar detalhes internos
      const msg = error.message || "Erro ao criar conta";
      if (/already|registered|exists/i.test(msg)) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json(
        { error: "Não foi possível criar a conta" },
        { status: 500 }
      );
    }

    // Bairro (o trigger cria o profile; aqui só complementa)
    if (neighborhood) {
      await supabase
        .from("profiles")
        .update({ neighborhood: sanitizeShortText(neighborhood, 100) || null })
        .eq("id", data.user.id);
    }

    // Entra automaticamente na sala oficial Geral FSA
    const { data: geralRoom } = await supabase
      .from("rooms")
      .select("id")
      .eq("slug", "geral-fsa")
      .single();
    if (geralRoom) {
      await supabase.from("room_members").insert({
        room_id: geralRoom.id,
        user_id: data.user.id,
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(selectCols(PROFILE_SAFE_COLUMNS))
      .eq("id", data.user.id)
      .single();

    return NextResponse.json({
      user: profile,
      // session pode ser null se confirmação de e-mail estiver ativa no Supabase
      needsEmailConfirmation: !data.session,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[auth/register POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
