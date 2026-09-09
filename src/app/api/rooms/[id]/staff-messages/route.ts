import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { sanitizePlainText } from "@/lib/sanitize";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * Mini-sala da equipe (criador + moderadores).
 * GET/POST /api/rooms/[id]/staff-messages
 * target_type = "room_staff"
 */

const MESSAGE_COLS =
  "id, content, sender_id, room_id, target_type, media_url, media_type, expires_at, is_deleted, created_at, reply_to_id";
const SENDER_COLS = "id, username, display_name, avatar_url";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "rooms:msg:list", user.id);
    if (blocked) return blocked;

    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1),
      100
    );
    const before = searchParams.get("before")?.trim() || null;

    let query = supabase
      .from("messages")
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .eq("room_id", roomId)
      .eq("target_type", "room_staff")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      const t = Date.parse(before);
      if (!Number.isNaN(t)) {
        query = query.lt("created_at", new Date(t).toISOString());
      }
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    if (messages && messages.length > 1) messages.reverse();

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[rooms/staff-messages GET]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    if (isReadOnlyMode()) {
      return NextResponse.json({ error: KILL_SWITCH_MESSAGES }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "rooms:msg:post", user.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      await idempotencyFail(req);
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const content =
      typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      await idempotencyFail(req);
      return NextResponse.json(
        { error: "Digite uma mensagem" },
        { status: 400 }
      );
    }
    if (content.length > 2000) {
      await idempotencyFail(req);
      return NextResponse.json(
        { error: "Mensagem muito longa (máx. 2000)" },
        { status: 400 }
      );
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        room_id: roomId,
        target_type: "room_staff",
        content: sanitizePlainText(content),
      })
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .single();

    if (error) {
      await idempotencyFail(req);
      throw error;
    }

    const responseData = { message };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData, { status: 201 });
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[rooms/staff-messages POST]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
