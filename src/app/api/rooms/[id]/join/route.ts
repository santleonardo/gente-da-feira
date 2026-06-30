import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// ============================================================
// SEC-002/SEC-003/REL-005: POST /api/rooms/[id]/join
// Body (opcional): { password }
//
// REL-005: A entrada na sala é executada inteiramente dentro da RPC
// public.rpc_join_room, que trava a linha da sala (SELECT ... FOR
// UPDATE) durante toda a operação. Isso serializa qualquer tentativa
// concorrente de entrada na MESMA sala — elimina o estouro de
// max_members e a duplicação de filiação quando dois usuários (ou o
// mesmo usuário em duplo-tap) tentam entrar simultaneamente em uma
// sala quase cheia.
//
// SEC-003: password_hash NUNCA é retornado ao cliente. A comparação
// bcrypt acontece inteiramente dentro da função SQL (via crypt()),
// nunca saindo do banco.
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

    const body = await req.json().catch(() => ({}));
    const providedPassword = (body?.password || "").trim() || null;

    const { data, error } = await supabase
      .rpc("rpc_join_room", { p_room_id: roomId, p_password: providedPassword })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as {
      ok: boolean;
      joined?: boolean;
      error?: string;
      requires_password?: boolean;
      banned_until?: string | null;
    };

    if (result.ok) {
      return NextResponse.json({ joined: true });
    }

    switch (result.error) {
      case "not_authenticated":
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

      case "room_not_found":
        return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });

      case "room_inactive":
        return NextResponse.json({ error: "Sala inativa" }, { status: 403 });

      case "banned": {
        const until = result.banned_until
          ? ` até ${new Date(result.banned_until).toLocaleDateString("pt-BR")}`
          : " permanentemente";
        return NextResponse.json(
          { error: `Você está banido desta sala${until}.` },
          { status: 403 }
        );
      }

      case "room_closed":
        return NextResponse.json(
          { error: "Esta sala está fechada para novos membros." },
          { status: 403 }
        );

      case "room_full":
        return NextResponse.json({ error: "Sala lotada." }, { status: 403 });

      case "password_required":
        return NextResponse.json(
          { error: "Esta sala é privada. Informe a senha.", requiresPassword: true },
          { status: 403 }
        );

      case "wrong_password":
        return NextResponse.json(
          { error: "Senha incorreta.", requiresPassword: true },
          { status: 403 }
        );

      default:
        return NextResponse.json(
          { error: "Não foi possível entrar na sala (condições não atendidas)" },
          { status: 403 }
        );
    }
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-join POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
