import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canReadRoomMessages, isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizePlainText } from "@/lib/sanitize";
import { isReadOnlyMode } from "@/lib/feature-flags";

// ============================================================
// Enquete no Mural de avisos ("Vamos abrir sábado?")
//
// GET   /api/rooms/[id]/poll   → lista de enquetes da sala (mais novas primeiro)
// POST  /api/rooms/[id]/poll   → cria enquete (admin only)
// PATCH /api/rooms/[id]/poll   → encerra UMA enquete específica (admin only)
//
// Regra: até MAX_ACTIVE_POLLS enquetes ativas por sala ao mesmo tempo.
// Publicar uma nova enquete NÃO encerra as anteriores — cada uma some
// só quando um admin/moderador a encerra (ou quando ela expira).
// Ver 20260908_room_polls.sql e a migration que remove o índice de
// "1 enquete ativa por sala".
// ============================================================

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
/** Máximo de enquetes ativas (não encerradas, não vencidas) por sala ao mesmo tempo. */
const MAX_ACTIVE_POLLS = 10;
/** Quantas enquetes (ativas + encerradas) retornar no GET, mais novas primeiro. */
const LIST_LIMIT = 30;

type PollRow = {
  id: string;
  room_id: string;
  question: string;
  created_by: string;
  is_closed: boolean;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
};

type OptionRow = { id: string; poll_id: string; label: string; position: number };
type VoteRow = { option_id: string; user_id: string };

/** Monta o payload público de uma enquete: opções + contagens + meu voto. */
function buildPollPayload(
  poll: PollRow,
  options: OptionRow[],
  votes: VoteRow[],
  viewerId: string
) {
  const isExpired = Boolean(poll.expires_at && new Date(poll.expires_at).getTime() <= Date.now());
  const totalVotes = votes.length;
  const myVote = votes.find((v) => v.user_id === viewerId)?.option_id ?? null;

  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1);

  const optionsOut = options
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const count = counts.get(o.id) || 0;
      return {
        id: o.id,
        label: o.label,
        count,
        percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
        mine: myVote === o.id,
      };
    });

  return {
    id: poll.id,
    question: poll.question,
    createdBy: poll.created_by,
    isClosed: poll.is_closed,
    isExpired,
    isActive: !poll.is_closed && !isExpired,
    expiresAt: poll.expires_at,
    closedAt: poll.closed_at,
    createdAt: poll.created_at,
    totalVotes,
    myVote,
    options: optionsOut,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:poll:get", user.id);
    if (blocked) return blocked;

    const auth = await canReadRoomMessages(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { data: polls, error: pollErr } = await supabase
      .from("room_polls")
      .select("id, room_id, question, created_by, is_closed, expires_at, closed_at, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    if (pollErr) {
      if (/room_polls|relation|does not exist/i.test(pollErr.message || "")) {
        return NextResponse.json({ polls: [] });
      }
      throw pollErr;
    }
    if (!polls || polls.length === 0) return NextResponse.json({ polls: [] });

    const pollIds = polls.map((p) => p.id);
    const [{ data: options, error: optErr }, { data: votes, error: voteErr }] = await Promise.all([
      supabase
        .from("room_poll_options")
        .select("id, poll_id, label, position")
        .in("poll_id", pollIds),
      supabase
        .from("room_poll_votes")
        .select("option_id, poll_id, user_id")
        .in("poll_id", pollIds),
    ]);
    if (optErr) throw optErr;
    if (voteErr) throw voteErr;

    const optionsByPoll = new Map<string, OptionRow[]>();
    for (const o of (options || []) as OptionRow[]) {
      const list = optionsByPoll.get(o.poll_id) || [];
      list.push(o);
      optionsByPoll.set(o.poll_id, list);
    }
    const votesByPoll = new Map<string, VoteRow[]>();
    for (const v of (votes || []) as (VoteRow & { poll_id: string })[]) {
      const list = votesByPoll.get(v.poll_id) || [];
      list.push(v);
      votesByPoll.set(v.poll_id, list);
    }

    return NextResponse.json({
      polls: (polls as PollRow[]).map((poll) =>
        buildPollPayload(
          poll,
          optionsByPoll.get(poll.id) || [],
          votesByPoll.get(poll.id) || [],
          user.id
        )
      ),
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms/poll GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:poll:create", user.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      await idempotencyFail(req);
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const rawOptions: unknown[] = Array.isArray(body.options) ? body.options : [];
    const options = rawOptions
      .map((o) => (typeof o === "string" ? o.trim() : ""))
      .filter((o) => o.length > 0)
      .slice(0, MAX_OPTIONS);
    const expiresInHours =
      typeof body.expiresInHours === "number" && body.expiresInHours > 0
        ? Math.min(body.expiresInHours, 24 * 30)
        : null;
    const announceInRoom = body.announceInRoom !== false; // padrão: anuncia

    if (question.length < 3 || question.length > 300) {
      await idempotencyFail(req);
      return NextResponse.json(
        { error: "A pergunta deve ter entre 3 e 300 caracteres" },
        { status: 400 }
      );
    }
    const uniqueOptions = Array.from(new Set(options.map((o) => o.toLowerCase())));
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      await idempotencyFail(req);
      return NextResponse.json(
        { error: `Escolha de ${MIN_OPTIONS} a ${MAX_OPTIONS} opções` },
        { status: 400 }
      );
    }
    if (uniqueOptions.length !== options.length) {
      await idempotencyFail(req);
      return NextResponse.json({ error: "As opções não podem se repetir" }, { status: 400 });
    }
    if (options.some((o) => o.length > 120)) {
      await idempotencyFail(req);
      return NextResponse.json(
        { error: "Cada opção deve ter no máximo 120 caracteres" },
        { status: 400 }
      );
    }

    // Até MAX_ACTIVE_POLLS enquetes ativas por vez — publicar uma nova NÃO
    // encerra as anteriores. Um admin/moderador precisa encerrar manualmente
    // (ou a enquete expira sozinha) para abrir espaço para outra.
    const { data: activePolls, error: activeErr } = await supabase
      .from("room_polls")
      .select("id, expires_at")
      .eq("room_id", roomId)
      .eq("is_closed", false);
    if (activeErr && !/room_polls|relation|does not exist/i.test(activeErr.message || "")) {
      throw activeErr;
    }
    const now = Date.now();
    const activeCount = (activePolls || []).filter(
      (p) => !p.expires_at || new Date(p.expires_at).getTime() > now
    ).length;
    if (activeCount >= MAX_ACTIVE_POLLS) {
      await idempotencyFail(req);
      return NextResponse.json(
        {
          error: `Limite de ${MAX_ACTIVE_POLLS} enquetes ativas nesta sala. Encerre alguma para criar outra.`,
        },
        { status: 409 }
      );
    }

    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

    const { data: poll, error: insertErr } = await supabase
      .from("room_polls")
      .insert({ room_id: roomId, question, created_by: user.id, expires_at: expiresAt })
      .select("id, room_id, question, created_by, is_closed, expires_at, closed_at, created_at")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        await idempotencyFail(req);
        return NextResponse.json(
          {
            error:
              "O banco ainda tem a regra antiga de 1 enquete por sala. Rode a migration que remove o índice único de room_polls no Supabase.",
          },
          { status: 409 }
        );
      }
      if (/room_polls|relation|does not exist/i.test(insertErr.message || "")) {
        await idempotencyFail(req);
        return NextResponse.json(
          {
            error:
              "Enquetes ainda não disponíveis no banco. Rode 20260908_room_polls.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      throw insertErr;
    }

    const { error: optionsErr } = await supabase.from("room_poll_options").insert(
      options.map((label, position) => ({ poll_id: poll.id, label, position }))
    );
    if (optionsErr) {
      // Rollback best-effort: sem a enquete completa (sem opções) não faz sentido manter.
      await supabase.from("room_polls").delete().eq("id", poll.id);
      throw optionsErr;
    }

    // Recarrega com os IDs reais das opções recém-criadas
    const { data: savedOptions } = await supabase
      .from("room_poll_options")
      .select("id, poll_id, label, position")
      .eq("poll_id", poll.id);

    // Publica um anúncio da enquete no chat da sala (best-effort — se
    // falhar, a enquete continua criada normalmente, só sem o anúncio).
    let announced = false;
    if (announceInRoom && !isReadOnlyMode()) {
      try {
        const optionsList = options.map((label) => `• ${label}`).join("\n");
        const announceText = sanitizePlainText(
          `📊 Nova enquete no mural: "${question}"\n${optionsList}\n\nToque em ⋮ → Enquete para votar.`
        );
        const { error: msgErr } = await supabase.from("messages").insert({
          sender_id: user.id,
          room_id: roomId,
          target_type: "room",
          content: announceText,
        });
        announced = !msgErr;
        if (msgErr) console.error("[rooms/poll POST announce]", msgErr.message);
      } catch (announceError) {
        console.error("[rooms/poll POST announce]", announceError);
      }
    }

    const responseData = {
      poll: buildPollPayload(poll as PollRow, (savedOptions || []) as OptionRow[], [], user.id),
      announced,
    };

    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[rooms/poll POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:poll:close", user.id);
    if (blocked) return blocked;

    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const pollId = typeof body.pollId === "string" ? body.pollId : "";
    if (!pollId) {
      return NextResponse.json({ error: "pollId obrigatório" }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("room_polls")
      .select("id")
      .eq("id", pollId)
      .eq("room_id", roomId)
      .eq("is_closed", false)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing) {
      return NextResponse.json({ error: "Enquete não encontrada ou já encerrada" }, { status: 404 });
    }

    const { error: updErr } = await supabase
      .from("room_polls")
      .update({ is_closed: true, closed_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updErr) throw updErr;

    return NextResponse.json({ closed: true, pollId: existing.id });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms/poll PATCH]");
    return NextResponse.json({ error: message }, { status });
  }
}
