import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { ROOM_MEMBERSHIP_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";

// ============================================================
// SEC-002/SEC-003: POST /api/rooms/[id]/join
// Body (opcional): { password }
//
// SEC-003: password_hash NUNCA é retornado ao cliente.
// Verificação de senha usa RPC (verify_room_password) que faz
// bcrypt.compare server-side. Fallback usa admin client APENAS
// para comparação — hash nunca sai do escopo server-side.
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

    const blocked = await rateLimitByRule(req, "rooms:join", user?.id);
    if (blocked) return blocked;

    // SEC-003: Select explícito — nunca SELECT *
    const { data: _room, error: roomErr } = await supabase
      .from("rooms")
      .select(selectCols(ROOM_MEMBERSHIP_COLUMNS))
      .eq("id", roomId)
      .maybeSingle();

    // Type assertion necessário porque selectCols() retorna string dinâmica
    const room = _room as { is_active: boolean; is_open: boolean; max_members: number; member_count: number; id: string } | null;
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

    // Verificar senha via RPC (hash nunca sai do banco)
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

      // Verificar senha via RPC (bcrypt server-side — hash nunca sai do banco)
      const { data: passwordOk, error: rpcErr } = await supabase
        .rpc("verify_room_password", { p_room_id: roomId, p_password: provided })
        .maybeSingle();

      if (rpcErr || passwordOk !== true) {
        // SEC-003: Log sem expor detalhes do erro RPC
        console.warn("[room-join] verificação de senha falhou via RPC");

        // Fallback: admin client para comparação server-side
        // O hash NUNCA é retornado ao cliente — fica apenas na memória do servidor
        const admin = createAdminClient();
        const { data: roomCreds } = await admin
          .from("rooms")
          .select("password_hash")
          .eq("id", roomId)
          .maybeSingle();

        // SEC-003: Variável local apenas para comparação — nunca serializada
        const storedHash = roomCreds?.password_hash;
        if (!storedHash) {
          return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
        }

        const match = await bcrypt.compare(provided, storedHash);
        if (!match) {
          return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
        }
      }
    }

    // Inserir como membro
    const { error: insertErr } = await supabase.from("room_members").insert({
      room_id: roomId,
      user_id: user.id,
      role: "member",
    });

    if (insertErr) {
      console.error("[room-join INSERT]", insertErr);
      if (insertErr.code === "42501" || insertErr.message.includes("row-level security")) {
        return NextResponse.json(
          { error: "Não foi possível entrar na sala (condições não atendidas)" },
          { status: 403 }
        );
      }
      throw insertErr;
    }

    return NextResponse.json({ joined: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-join POST]");
    return NextResponse.json({ error: message }, { status });
  }
}