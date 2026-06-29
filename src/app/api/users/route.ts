import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { PROFILE_SEARCH_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { filterSearchResults, batchFetchPrivacyFlags } from "@/lib/privacy-filter";

export async function GET(req: NextRequest) {
  try {
    const blocked = await rateLimitByRule(req, "users:search", undefined);
    if (blocked) return blocked;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const username = searchParams.get("username");

    // Exact username lookup (used for @mention resolution)
    if (username) {
      const sanitized = username.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
      if (!sanitized) {
        return NextResponse.json({ error: "Username inválido" }, { status: 400 });
      }
      const { data: _user, error } = await supabase
        .from("profiles")
        .select(selectCols(PROFILE_SEARCH_COLUMNS))
        .eq("username", sanitized)
        .maybeSingle();
      if (error) throw error;
      // Type assertion necessário porque selectCols() retorna string dinâmica
      const user = _user as any;
      if (!user) {
        return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
      }

      // SEC-004: Don't return user if blocked
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser && authUser.id !== user.id) {
        const blocked = await (
          await supabase
            .from("blocks")
            .select("id", { count: "exact", head: true })
            .or(
              `and(blocker_id.eq.${authUser.id},blocked_id.eq.${user.id}),and(blocker_id.eq.${user.id},blocked_id.eq.${authUser.id})`
            )
        ).count;
        if ((blocked ?? 0) > 0) {
          return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
        }
      }

      // SEC-009: Strip neighborhood if target has hide_neighborhood
      const filtered = user.hide_neighborhood
        ? { ...user, neighborhood: null }
        : user;

      return NextResponse.json({ user: filtered });
    }

    // Search — SEC-003: colunas explícitas (with neighborhood, filtered below)
    let query = supabase.from("profiles").select(selectCols(PROFILE_SEARCH_COLUMNS)).limit(15);

    if (q) {
      const sanitized = q.replace(/[^\w\s@.-]/g, "").slice(0, 50);
      if (sanitized) {
        query = query.or(`display_name.ilike.%${sanitized}%,username.ilike.%${sanitized}%`);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) query = query.neq("id", user.id);
      }
    }

    const { data: users, error } = await query;
    if (error) throw error;

    // SEC-004: Filter out blocked users from search results
    const { data: { user: authUser } } = await supabase.auth.getUser();
    let filteredUsers: Record<string, any>[] = (users || []) as Record<string, any>[];
    if (authUser) {
      const blockedIds = await getBlockedUserIds(supabase, authUser.id);
      filteredUsers = filteredUsers.filter((u: any) => !blockedIds.has(u.id));
    }

    // SEC-009: Strip neighborhood from users with hide_neighborhood
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      filteredUsers.map((u: any) => u.id)
    );
    filteredUsers = filterSearchResults(filteredUsers, hiddenNeighborhoodIds);

    return NextResponse.json({ users: filteredUsers });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[users search]");
    return NextResponse.json({ error: message }, { status });
  }
}
