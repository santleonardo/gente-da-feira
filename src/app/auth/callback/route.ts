// ============================================================
// GET /auth/callback
//
// Destino do redirect do provedor OAuth (Google) configurado no
// Supabase Auth. Troca o "code" da URL por uma sessão (cookies
// httpOnly), depois decide para onde mandar o usuário:
//
//   - Primeiro login via Google (perfil sem username ainda)
//     → /auth/complete-profile  (escolher usuário, bairro,
//       aceitar Termos e declarar maioridade)
//   - Perfil já completo (login recorrente ou conta antiga)
//     → / (app)
//   - Erro na troca do code / sem code na URL
//     → / com ?auth_error=1 (o AuthForm pode exibir um toast)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(`${origin}/?auth_error=1`);
  }

  // O trigger do banco já deve ter criado a linha em "profiles" a partir
  // do auth.users. Para contas Google, o username vem vazio/nulo (o
  // Google não fornece isso) — checamos e mandamos completar o cadastro.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", data.user.id)
    .maybeSingle();

  const hasValidUsername =
    !!profile?.username && USERNAME_RE.test(profile.username);

  if (!hasValidUsername) {
    return NextResponse.redirect(`${origin}/auth/complete-profile`);
  }

  return NextResponse.redirect(`${origin}/`);
}
