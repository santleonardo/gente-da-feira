import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canReadRoomMessages, isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizePlainText } from "@/lib/sanitize";

const MAX_ACTIVE = 10;
const MAX_BODY = 2000;
const MAX_LINKS = 3;

/**
 * GET  /api/rooms/[id]/announcements — lista avisos (ativos primeiro)
 * POST /api/rooms/[id]/announcements — cria aviso (NÃO apaga os anteriores)
 */

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

    const blocked = await rateLimitByRule(req, "rooms:messages:list", user.id);
    if (blocked) return blocked;

    const auth = await canReadRoomMessages(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("room_announcements")
      .select(
        "id, room_id, body, category, links, contact, expires_at, created_by, is_active, created_at, updated_at"
      )
      .eq("room_id", roomId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_ACTIVE);

    if (error) {
      if (/room_announcements|relation|does not exist/i.test(error.message || "")) {
        return NextResponse.json({
          announcements: [],
          error:
            "Tabela de avisos ainda não existe. Rode scripts/20260909_room_announcements.sql no Supabase.",
        });
      }
      throw error;
    }

    const now = Date.now();
    const list = (data || []).filter((a) => {
      if (!a.expires_at) return true;
      return new Date(a.expires_at).getTime() > now;
    });

    return NextResponse.json({
      announcements: list,
      activeCount: list.length,
      maxActive: MAX_ACTIVE,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[rooms/announcements GET]"
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

    const body = await req.json().catch(() => ({}));
    const text =
      typeof body.body === "string"
        ? sanitizePlainText(body.body.trim()).slice(0, MAX_BODY)
        : "";
    if (!text || text.length < 1) {
      return NextResponse.json(
        { error: "Escreva o texto do aviso" },
        { status: 400 }
      );
    }

    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : null;

    let links: { url: string; label: string | null }[] = [];
    if (Array.isArray(body.links)) {
      if (body.links.length > MAX_LINKS) {
        return NextResponse.json(
          { error: `No máximo ${MAX_LINKS} links` },
          { status: 400 }
        );
      }
      for (const raw of body.links) {
        const url = typeof raw?.url === "string" ? raw.url.trim() : "";
        if (!url) continue;
        const label =
          typeof raw?.label === "string" ? raw.label.trim().slice(0, 80) : null;
        links.push({ url, label: label || null });
      }
    }

    let contact: { phone: string; label: string | null } | null = null;
    if (body.contact && typeof body.contact === "object") {
      const phone =
        typeof body.contact.phone === "string"
          ? body.contact.phone.trim()
          : "";
      if (phone) {
        const label =
          typeof body.contact.label === "string"
            ? body.contact.label.trim().slice(0, 80)
            : null;
        contact = { phone, label: label || null };
      }
    }

    let expiresAt: string | null = null;
    if (typeof body.expires_at === "string" && body.expires_at) {
      const parsed = new Date(body.expires_at);
      if (!Number.isNaN(parsed.getTime())) {
        expiresAt = parsed.toISOString();
      }
    }

    // Conta ativos (não expirados) — NÃO desativa os anteriores
    const { data: existing, error: countErr } = await supabase
      .from("room_announcements")
      .select("id, expires_at")
      .eq("room_id", roomId)
      .eq("is_active", true);
    if (countErr) {
      if (/room_announcements|relation|does not exist/i.test(countErr.message || "")) {
        return NextResponse.json(
          {
            error:
              "Tabela de avisos ainda não existe. Rode scripts/20260909_room_announcements.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      throw countErr;
    }

    const now = Date.now();
    const activeCount = (existing || []).filter((a) => {
      if (!a.expires_at) return true;
      return new Date(a.expires_at).getTime() > now;
    }).length;

    if (activeCount >= MAX_ACTIVE) {
      return NextResponse.json(
        {
          error: `Limite de ${MAX_ACTIVE} avisos ativos nesta sala. Apague um para criar outro — os antigos não somem sozinhos.`,
        },
        { status: 409 }
      );
    }

    const { data: row, error } = await supabase
      .from("room_announcements")
      .insert({
        room_id: roomId,
        body: text,
        category,
        links,
        contact,
        expires_at: expiresAt,
        created_by: user.id,
        is_active: true,
      })
      .select(
        "id, room_id, body, category, links, contact, expires_at, created_by, is_active, created_at, updated_at"
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ announcement: row }, { status: 201 });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[rooms/announcements POST]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
