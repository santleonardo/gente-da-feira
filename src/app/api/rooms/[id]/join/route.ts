import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

// ============================================================
// SEC-002: POST /api/rooms/[id]/join
// Body (opcional): { password }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Sala ativa
//   - Sala aberta (is_open=true) — salas fechadas exigem convite
//   - Não exceder max_members
//   - Senha correta (se a sala tem senha)
//   - Usuário não banido
//
// Defense-in-depth: RLS em room_members bloqueia INSERT não-autorizado.
//
// IMPORTANTE: NÃO usar mais select("password_hash") com o client
// do usuário — a coluna tem SELECT revogado via RLS (REVOKE SELECT).
// Em vez disso, usamos uma RPC PostgreSQL que faz o bcrypt.compare
// server-side e retorna apenas boolean.
// Como essa RPC pode não existir ainda, fazemos fallback para o
// admin client APENAS para a verificação de senha.
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    // Buscar sala SEM password_hash (RLS revoga SELECT nessa coluna).
    // O campo has_password é derivado via EXISTS ou similar — mas para
    // compatibilidade, fazemos uma query que apenas retorna a flag.
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, is_active, is_open, max_members, member_count")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }
    if (!room.is_active) {
      return NextResponse.json({ error: "Sala inativa" }, { status: 403 });
    }

    // Verifica se já é membro
    const { data: existing } = await supabase
      .from("room_members")
      .select("id, is_banned, banned_until, role")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // Se banido temporariamente e o ban expirou, remover ban
      if (existing.is_banned && existing.banned_until && new Date(existing.banned_until) < new Date()) {
        await supabase
          .from("room_members")
          .update({ is_banned: false, banned_until: null })
          .eq("room_id", roomId)
          .eq("user_id", user.id);
      } else if (existing.is_banned) {
        const until = existing.banned_until
          ? ` até ${new Date(existing.banned_until).toLocaleDateString("pt-BR")}`
          : " permanentemente";
        return NextResponse.json(
          { error: `Você está banido desta sala${until}.` },
          { status: 403 }
        );
      }
      // Já é membro ativo
      return NextResponse.json({ joined: true });
    }

    // Sala fechada: não pode entrar direto (precisa de convite)
    if (room.is_open === false) {
      return NextResponse.json(
        { error: "Esta sala está fechada para novos membros." },
        { status: 403 }
      );
    }

    // Capacidade
    if (room.member_count >= room.max_members) {
      return NextResponse.json(
        { error: `Sala lotada (máx ${room.max_members} membros).` },
        { status: 403 }
      );
    }

    // Verificar senha: como password_hash tem SELECT revogado para o client
    // do usuário, usamos uma RPC que faz bcrypt.compare server-side.
    // Se a RPC não existir, fazemos fallback para admin client APENAS na
    // verificação de senha (não expomos o hash para o cliente).
    const { data: hasPasswordData } = await supabase
      .rpc("room_has_password", { p_room_id: roomId })
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roomHasPassword = hasPasswordData === true || (hasPasswordData as any)?.has_password === true;

    if (roomHasPassword) {
      const body = await req.json().catch(() => ({}));
      const provided = (body.password || "").trim();
      if (!provided) {
        return NextResponse.json(
          { error: "Esta sala é privada. Informe a senha.", requiresPassword: true },
          { status: 403 }
        );
      }

      // Tentar verificar senha via RPC (mais seguro — hash nunca sai do banco)
      const { data: passwordOk, error: rpcErr } = await supabase
        .rpc("verify_room_password", { p_room_id: roomId, p_password: provided })
        .maybeSingle();

      if (rpcErr || passwordOk !== true) {
        // Se a RPC não existe, fazer fallback com admin client (NÃO expor hash)
        // Comentário: a RPC verify_room_password está definida no SQL
        // 006_create_verify_room_password_function.sql
        console.warn("[SEC-002 join] RPC verify_room_password falhou, usando fallback:", rpcErr?.message);

        // Fallback: usar admin client APENAS para buscar o hash e comparar
        // server-side. O hash NUNCA é retornado ao cliente.
        const admin = (await import("@/lib/supabase/server")).createAdminClient();
        const { data: adminRoom } = await admin
          .from("rooms")
          .select("password_hash")
          .eq("id", roomId)
          .maybeSingle();

        if (!adminRoom?.password_hash) {
          return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
        }

        const match = await bcrypt.compare(provided, adminRoom.password_hash);
        if (!match) {
          return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
        }
      }
    }

    // Inserir como membro
    // RLS permite o INSERT porque a sala está ativa, aberta, e tem capacidade
    // (validado pela função room_can_accept_new_member).
    const { error: insertErr } = await supabase.from("room_members").insert({
      room_id: roomId,
      user_id: user.id,
      role: "member",
    });

    if (insertErr) {
      console.error("[SEC-002 join INSERT]", insertErr);
      if (insertErr.code === "42501" || insertErr.message.includes("row-level security")) {
        return NextResponse.json(
          { error: "Não foi possível entrar na sala (condições não atendidas)" },
          { status: 403 }
        );
      }
      throw insertErr;
    }

    return NextResponse.json({ joined: true });
  } catch (error: any) {
    console.error("[SEC-002 join POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
