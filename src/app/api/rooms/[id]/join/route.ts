import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { ROOM_MEMBERSHIP_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const blocked = await rateLimitByRule(req, "rooms:join", user?.id);
    if (blocked) return blocked;
    const { data: room, error: roomErr } = await supabase
      .from("rooms").select(selectCols(ROOM_MEMBERSHIP_COLUMNS)).eq("id", roomId).maybeSingle();
    if (roomErr || !room) return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    if (!room.is_active) return NextResponse.json({ error: "Sala inativa" }, { status: 403 });
    const { data: existing } = await supabase.from("room_members").select("id, is_banned, banned_until, role").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
    if (existing) {
      if (existing.is_banned && existing.banned_until && new Date(existing.banned_until) < new Date()) {
        await supabase.from("room_members").update({ is_banned: false, banned_until: null }).eq("room_id", roomId).eq("user_id", user.id);
      } else if (existing.is_banned) {
        const until = existing.banned_until ? ` até ${new Date(existing.banned_until).toLocaleDateString("pt-BR")}` : " permanentemente";
        return NextResponse.json({ error: `Você está banido desta sala${until}.` }, { status: 403 });
      }
      return NextResponse.json({ joined: true });
    }
    if (room.is_open === false) return NextResponse.json({ error: "Esta sala está fechada para novos membros." }, { status: 403 });
    if (room.member_count >= room.max_members) return NextResponse.json({ error: `Sala lotada (máx ${room.max_members} membros).` }, { status: 403 });
    const { data: hasPasswordData } = await supabase.rpc("room_has_password", { p_room_id: roomId }).maybeSingle();
    const roomHasPassword = hasPasswordData === true || (hasPasswordData as any)?.has_password === true;
    if (roomHasPassword) {
      const body = await req.json().catch(() => ({}));
      const provided = (body.password || "").trim();
      if (!provided) return NextResponse.json({ error: "Esta sala é privada. Informe a senha.", requiresPassword: true }, { status: 403 });
      const { data: passwordOk, error: rpcErr } = await supabase.rpc("verify_room_password", { p_room_id: roomId, p_password: provided }).maybeSingle();
      if (rpcErr || passwordOk !== true) {
        console.warn("[room-join] verificação de senha falhou via RPC");
        const admin = createAdminClient();
        const { data: roomCreds } = await admin.from("rooms").select("password_hash").eq("id", roomId).maybeSingle();
        const storedHash = roomCreds?.password_hash;
        if (!storedHash) return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
        const match = await bcrypt.compare(provided, storedHash);
        if (!match) return NextResponse.json({ error: "Senha incorreta.", requiresPassword: true }, { status: 403 });
      }
    }
    const { error: insertErr } = await supabase.from("room_members").insert({ room_id: roomId, user_id: user.id, role: "member" });
    if (insertErr) {
      console.error("[room-join INSERT]", insertErr);
      if (insertErr.code === "42501" || insertErr.message.includes("row-level security")) return NextResponse.json({ error: "Não foi possível entrar na sala (condições não atendidas)" }, { status: 403 });
      throw insertErr;
    }
    return NextResponse.json({ joined: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-join POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
