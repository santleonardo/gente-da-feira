import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canReadRoomMessages } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// ============================================================
// POST /api/rooms/[id]/poll/vote
// Body: { optionId: string }
//
// Voto único por enquete: votar numa opção diferente troca o voto;
// votar de novo na mesma opção retira o voto (toggle, como reações).
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

    const blocked = await rateLimitByRule(req, "rooms:poll:vote", user.id);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const optionId = typeof body.optionId === "string" ? body.optionId : "";
    if (!optionId) {
      return NextResponse.json({ error: "optionId obrigatório" }, { status: 400 });
    }

    // Só membros (não banidos) podem votar
    const auth = await canReadRoomMessages(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    // A opção precisa existir, pertencer a uma enquete desta sala,
    // e a enquete precisa estar ativa (não encerrada, não vencida).
    const { data: option, error: optErr } = await supabase
      .from("room_poll_options")
      .select("id, poll_id, room_polls!inner(id, room_id, is_closed, expires_at)")
      .eq("id", optionId)
      .eq("room_polls.room_id", roomId)
      .maybeSingle();

    if (optErr) {
      if (/room_poll|relation|does not exist/i.test(optErr.message || "")) {
        return NextResponse.json(
          {
            error:
              "Enquetes ainda não disponíveis no banco. Rode 20260908_room_polls.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      throw optErr;
    }
    if (!option) {
      return NextResponse.json({ error: "Opção não encontrada" }, { status: 404 });
    }

    const poll = (option as any).room_polls;
    const isExpired = Boolean(poll?.expires_at && new Date(poll.expires_at).getTime() <= Date.now());
    if (poll?.is_closed || isExpired) {
      return NextResponse.json({ error: "Esta enquete já foi encerrada" }, { status: 409 });
    }

    const pollId = option.poll_id as string;

    // Toggle: já votei nesta opção? → retira o voto. Senão → grava/troca.
    const { data: myVote } = await supabase
      .from("room_poll_votes")
      .select("id, option_id")
      .eq("poll_id", pollId)
      .eq("user_id", user.id)
      .maybeSingle();

    let voted = false;

    if (myVote && myVote.option_id === optionId) {
      const { error: delErr } = await supabase
        .from("room_poll_votes")
        .delete()
        .eq("id", myVote.id)
        .eq("user_id", user.id);
      if (delErr) throw delErr;
      voted = false;
    } else if (myVote) {
      const { error: updErr } = await supabase
        .from("room_poll_votes")
        .update({ option_id: optionId })
        .eq("id", myVote.id)
        .eq("user_id", user.id);
      if (updErr) throw updErr;
      voted = true;
    } else {
      const { error: insErr } = await supabase
        .from("room_poll_votes")
        .insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
      if (insErr) {
        // Unique violation = corrida (já votou) → busca o estado atual
        if (insErr.code !== "23505") throw insErr;
      }
      voted = true;
    }

    // Contagens atualizadas para o client reconciliar
    const [{ data: options }, { data: votes }] = await Promise.all([
      supabase.from("room_poll_options").select("id, label, position").eq("poll_id", pollId),
      supabase.from("room_poll_votes").select("option_id, user_id").eq("poll_id", pollId),
    ]);

    const totalVotes = (votes || []).length;
    const counts = new Map<string, number>();
    for (const v of votes || []) counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1);
    const myFinalVote = (votes || []).find((v) => v.user_id === user.id)?.option_id ?? null;

    const optionsOut = (options || [])
      .sort((a, b) => a.position - b.position)
      .map((o) => {
        const count = counts.get(o.id) || 0;
        return {
          id: o.id,
          label: o.label,
          count,
          percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
          mine: myFinalVote === o.id,
        };
      });

    return NextResponse.json({
      voted,
      pollId,
      totalVotes,
      myVote: myFinalVote,
      options: optionsOut,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms/poll/vote POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
