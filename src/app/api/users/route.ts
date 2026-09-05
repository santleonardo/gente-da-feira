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
    // Sem termo: retorna sugestões recentes (limitado). Com termo: busca por nome/username.
    const rawQ = (q || "").trim();
    // Aceita letras com acento (pt-BR), números, espaços e @ . _ -
    const sanitized = rawQ
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\s@._-]/gu, "")
      .replace(/\s+/g, " ")
      .slice(0, 50)
      .trim();

    // Escape de curingas do ILIKE para o termo ser literal
    const likeTerm = sanitized.replace(/[%_\\]/g, "\\$&");

    let query = supabase
      .from("profiles")
      .select(selectCols(PROFILE_SEARCH_COLUMNS))
      .limit(20);

    if (likeTerm.length >= 1) {
      // Busca em display_name e username (case-insensitive)
      query = query.or(
        `display_name.ilike.%${likeTerm}%,username.ilike.%${likeTerm}%`
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) query = query.neq("id", user.id);
    } else {
      // Sugestões: perfis mais recentes (sem o próprio usuário)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) query = query.neq("id", user.id);
      query = query.order("created_at", { ascending: false }).limit(12);
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

    // Ordenação simples por relevância quando há termo: username exact > prefixo > resto
    if (likeTerm.length >= 1) {
      const termLower = likeTerm.toLowerCase();
      filteredUsers.sort((a, b) => {
        const score = (u: any) => {
          const un = String(u.username || "").toLowerCase();
          const dn = String(u.display_name || "").toLowerCase();
          if (un === termLower) return 0;
          if (un.startsWith(termLower)) return 1;
          if (dn.startsWith(termLower)) return 2;
          if (un.includes(termLower)) return 3;
          if (dn.includes(termLower)) return 4;
          return 5;
        };
        return score(a) - score(b);
      });
    }

    return NextResponse.json({ users: filteredUsers, q: sanitized || null });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[users search]");
    return NextResponse.json({ error: message }, { status });
  }
}
