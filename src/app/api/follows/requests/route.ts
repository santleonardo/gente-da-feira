import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { selectCols, FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH } from "@/lib/safe-columns";
import { batchFetchPrivacyFlags, filterFollowListItems } from "@/lib/privacy-filter";

// GET /api/follows/requests — Buscar solicitações pendentes do usuário logado
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "follows:requests", user?.id);
    if (blocked) return blocked;

    const followProfileCols = selectCols(FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH);

    const { data: requests, error } = await supabase
      .from("follows")
      .select(`id, follower_id, created_at, follower:profiles!follows_follower_id_fkey(${followProfileCols})`)
      .eq("following_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const followerIds = (requests || []).map((r: any) => r.follower_id).filter(Boolean);
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(supabase, followerIds);
    const filtered = filterFollowListItems(requests || [], hiddenNeighborhoodIds);

    return NextResponse.json({ requests: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/follows/requests — Aceitar ou rejeitar uma solicitação
// REL-006: Aceitar/rejeitar via RPCs atômicas (rpc_accept_follow_request /
// rpc_reject_follow_request). Verifica blocks, ownership e status em
// transação única no banco.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    {
      const blocked = await rateLimitByRule(req, "follows:accept", user?.id);
      if (blocked) return blocked;
    }

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { requestId, action } = await req.json();
    if (!requestId || !action) {
      return NextResponse.json({ error: "requestId e action são obrigatórios" }, { status: 400 });
    }

    if (action !== "accept" && action !== "reject") {
      return NextResponse.json({ error: "action deve ser 'accept' ou 'reject'" }, { status: 400 });
    }

    // REL-006: operação atômica via RPC
    const rpcName = action === "accept"
      ? "rpc_accept_follow_request"
      : "rpc_reject_follow_request";

    const { data, error } = await supabase
      .rpc(rpcName, { p_request_id: requestId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; accepted?: boolean; rejected?: boolean; follower_id?: string; reason?: string };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "request_not_found":
          return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
        default:
          return NextResponse.json({ error: "Não foi possível processar" }, { status: 400 });
      }
    }

    // Aceitou (ou rejeitou por block — retorna rejected: true)
    if (result.accepted) {
      // Disparar push para notificação de follow_accepted
      if (result.follower_id) {
        (async () => {
          try {
            await new Promise((r) => setTimeout(r, 200));
            const { data: notif } = await supabase
              .from("notifications")
              .select("id")
              .eq("type", "follow_accepted")
              .eq("user_id", result.follower_id)
              .eq("actor_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (notif?.id) {
              dispatchPushForNotification(notif.id).catch(() => {});
            }
          } catch { /* silent */ }
        })();
      }

      const acceptedData = { accepted: true };
      await idempotencyStore(req, acceptedData);
      return NextResponse.json(acceptedData);
    }

    const rejectedData = { rejected: true };
    await idempotencyStore(req, rejectedData);
    return NextResponse.json(rejectedData);
  } catch (error: any) {
    await idempotencyFail(req);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}