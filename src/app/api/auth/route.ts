import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { PROFILE_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }
    const blocked = await rateLimitByRule(req, "auth:get", user?.id);
    if (blocked) return blocked;
    const { data: profile } = await supabase
      .from("profiles")
      .select(selectCols(PROFILE_SAFE_COLUMNS))
      .eq("id", user.id)
      .single();
    return NextResponse.json({ user: profile });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[auth GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Use Supabase client auth" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  try {
    const blocked = await rateLimitByRule(req, "auth:delete", null);
    if (blocked) return blocked;
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[auth DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
