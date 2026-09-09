import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * DELETE /api/rooms/[id]/announcements/[announcementId]
 * Soft-delete (is_active = false) — só some se o admin quiser.
 */

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; announcementId: string }> }
) {
  const { id: roomId, announcementId } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "rooms:messages:post", user.id);
    if (blocked) return blocked;

    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { error } = await supabase
      .from("room_announcements")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", announcementId)
      .eq("room_id", roomId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[rooms/announcements DELETE]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
