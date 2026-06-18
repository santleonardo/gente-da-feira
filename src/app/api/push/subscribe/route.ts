import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Validação básica do objeto de subscription do Push API
function isValidSubscription(sub: any): boolean {
  return (
    sub &&
    typeof sub === "object" &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.keys &&
    typeof sub.keys === "object" &&
    typeof sub.keys.p256dh === "string" &&
    sub.keys.auth === "string"
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    let subscription: any;
    try {
      subscription = await req.json();
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "Subscription inválida" }, { status: 400 });
    }

    if (!isValidSubscription(subscription)) {
      return NextResponse.json({ error: "Subscription com formato inválido" }, { status: 400 });
    }

    // Limitar quantidade de subscriptions por usuário (máx 5 dispositivos)
    const admin = await createAdminClient();
    const { count: userSubCount } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((userSubCount ?? 0) >= 5) {
      return NextResponse.json(
        { error: "Limite de dispositivos atingido (máx 5)" },
        { status: 429 }
      );
    }

    // SEC-001: Verificar se o endpoint já está associado a OUTRO usuário.
    // Em dispositivos compartilhados, a subscription anterior deve ser
    // removida antes de reassociar ao novo usuário logado.
    const { data: existingSub } = await admin
      .from("push_subscriptions")
      .select("id, user_id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (existingSub && existingSub.user_id !== user.id) {
      // Remover a associação antiga — o dispositivo agora pertence ao novo usuário
      console.warn(
        `[SEC-001] Endpoint ${subscription.endpoint.slice(0, 50)}... reassociado de ` +
        `user ${existingSub.user_id.slice(0, 8)}... para user ${user.id.slice(0, 8)}...`
      );
      await admin
        .from("push_subscriptions")
        .delete()
        .eq("id", existingSub.id);
    }

    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription: JSON.stringify(subscription),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      // Se a tabela não existe ainda, retornar 200 silencioso para não quebrar o app
      const msg = (error as any)?.message ?? String(error);
      if (msg.includes("does not exist") || msg.includes("relation")) {
        console.warn("[push/subscribe] Tabela push_subscriptions não encontrada");
        return NextResponse.json({ ok: true, warning: "push_subscriptions table not found" });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: "Endpoint obrigatório" }, { status: 400 });

    // SEC-001: Só permite deletar subscriptions do próprio usuário
    const admin = await createAdminClient();

    // Verificar ownership antes de deletar
    const { data: existing } = await admin
      .from("push_subscriptions")
      .select("id, user_id")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    await admin.from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe DELETE]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}