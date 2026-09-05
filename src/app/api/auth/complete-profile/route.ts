// ============================================================
// POST /api/auth/complete-profile
//
// Usado só logo após o primeiro login via Google (OAuth), quando
// o perfil ainda não tem um "username" válido. Exige sessão ativa
// (cookie do Supabase) — não é um cadastro aberto, é o mesmo termo
// e maioridade exigidos no /api/auth/register, só que para quem
// já tem auth.users criado pelo provedor social.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizeShortText } from "@/lib/sanitize";
import { PROFILE_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { TERMS_VERSION } from "@/lib/constants";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "auth:complete-profile", user.id);
    if (blocked) return blocked;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
    const agreedTerms = body.agreedTerms === true;
    const declaredAdult = body.declaredAdult === true;

    if (!agreedTerms) {
      return NextResponse.json(
        { error: "Você precisa aceitar os Termos de Uso para continuar" },
        { status: 400 }
      );
    }
    if (!declaredAdult) {
      return NextResponse.json(
        { error: "Você precisa declarar que tem 18 anos ou mais" },
        { status: 400 }
      );
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "Usuário inválido (3–24 caracteres: letras, números ou _)" },
        { status: 400 }
      );
    }
    if (!displayName || displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json({ error: "Nome inválido" }, { status: 400 });
    }

    // Username já em uso por outra conta?
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Este usuário já está em uso" }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        username,
        display_name: sanitizeShortText(displayName, 80),
        neighborhood: sanitizeShortText(neighborhood, 100) || null,
      })
      .eq("id", user.id);

    if (updateError) {
      const msg = updateError.message || "Erro ao salvar perfil";
      if (/duplicate|unique/i.test(msg)) {
        return NextResponse.json({ error: "Este usuário já está em uso" }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Registra aceite dos Termos — mesma metadata usada no cadastro por e-mail
    await supabase.auth.updateUser({
      data: {
        terms_accepted: true,
        terms_version: TERMS_VERSION,
        declared_adult: true,
      },
    });

    // Entra automaticamente na sala oficial Geral FSA (mesmo comportamento do /api/auth/register)
    const { data: geralRoom } = await supabase
      .from("rooms")
      .select("id")
      .eq("slug", "geral-fsa")
      .single();
    if (geralRoom) {
      // best-effort: se já for membro (ex.: reprocessamento), ignora o erro de duplicidade
      await supabase
        .from("room_members")
        .insert({ room_id: geralRoom.id, user_id: user.id });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(selectCols(PROFILE_SAFE_COLUMNS))
      .eq("id", user.id)
      .single();

    return NextResponse.json({ user: profile });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[auth/complete-profile POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
