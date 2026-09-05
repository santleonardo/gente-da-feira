import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { isBlocked, getPostAuthorId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { sanitizePlainText } from "@/lib/sanitize";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL } from "@/lib/safe-columns";
import { filterCommentAuthorsNeighborhood, batchFetchPrivacyFlags } from "@/lib/privacy-filter";
import { checkPostVisibility } from "@/lib/content-visibility";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { checkSpam } from "@/lib/spam-check";
import { autoReportSpam } from "@/lib/auto-report";
import { validateText } from "@/lib/text-validation";

// SEC-009: Author profile columns for comment authors
const AUTHOR_COLS = selectCols(AUTHOR_PROFILE_COLUMNS_FULL);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    // SEC-010: Check parent post visibility before returning comments.
    // Prevents comment leakage on followers-only / private posts.
    const visibility = await checkPostVisibility(supabase, postId, authUser?.id ?? null);
    if (!visibility.allowed) {
      return NextResponse.json({ comments: [] });
    }

    const { data: comments, error } = await supabase
      .from("comments")
      .select(`
        id, content, created_at, author_id, parent_id,
        author:profiles(${AUTHOR_COLS})
      `)
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // SEC-009: Filter neighborhood from comment authors
    const authorIds = (comments || []).map((c: any) => c.author_id).filter(Boolean);
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(supabase, authorIds);
    const filtered = filterCommentAuthorsNeighborhood(comments || [], hiddenNeighborhoodIds);

    return NextResponse.json({ comments: filtered });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts/comments GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "comments:create", user?.id);
    if (blocked) return blocked;

    if (isReadOnlyMode()) {
      return NextResponse.json(
        { error: KILL_SWITCH_MESSAGES.readonly },
        { status: 503 }
      );
    }


    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { content, parentId } = await req.json();
    const textCheck = validateText(content || "", "comment");
    if (!textCheck.ok) {
      return NextResponse.json({ error: textCheck.error }, { status: 400 });
    }

    const { data: post } = await supabase
      .from("posts").select("id").eq("id", postId).eq("is_deleted", false).single();
    if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

    // SEC-004: Check bidirectional block with post author
    const authorId = await getPostAuthorId(supabase, postId);
    if (authorId && authorId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, authorId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível comentar neste post" }, { status: 403 });
      }
    }

    const sanitizedContent = sanitizePlainText(content.trim());
    const insertData: Record<string, any> = { content: sanitizedContent, post_id: postId, author_id: user.id };
    if (parentId) insertData.parent_id = parentId;

    // MOD-001: mesma checagem dos posts — fail-open em erro da IA;
    // bloqueia só quando a IA confirma spam.
    const spamResult = await checkSpam(sanitizedContent);
    if (spamResult.isSpam) {
      return NextResponse.json(
        {
          error: "Comentário bloqueado por moderação automática. Revise o texto e tente de novo.",
          code: "SPAM_BLOCKED",
          reason: spamResult.reason || null,
        },
        { status: 422 }
      );
    }

    const { data: comment, error } = await supabase
      .from("comments").insert(insertData)
      .select(`id, content, created_at, author_id, parent_id, author:profiles(${AUTHOR_COLS})`)
      .single();

    if (error) throw error;


    // SEC-009: Filter neighborhood from new comment's author
    // (For the user's own comment, they'll always see their own neighborhood,
    //  but we apply the filter for consistency)
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(supabase, [user.id]);
    const filtered = filterCommentAuthorsNeighborhood([comment], hiddenNeighborhoodIds);

    // Busca notificação criada pelo trigger para disparar push
    const notifType = parentId ? "reply" : "comment";
    const { data: notif } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", notifType)
      .eq("actor_id", user.id)
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (notif?.id) {
      dispatchPushForNotification(notif.id).catch(() => {});
    }

    // Notifica usuários mencionados no comentário (@usuario)
    const mentionedUsernames = [
      ...new Set(
        [...(sanitizedContent || "").matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1].toLowerCase())
      ),
    ];
    if (mentionedUsernames.length > 0) {
      (async () => {
        try {
          const adminClient = createAdminClient();
          const notified = new Set<string>();
          for (const username of mentionedUsernames) {
            const { data: mentioned } = await adminClient
              .from("profiles")
              .select("id")
              .eq("username", username)
              .maybeSingle();
            if (!mentioned || mentioned.id === user.id || notified.has(mentioned.id)) continue;
            const { count: mentionBlockCount } = await adminClient
              .from("blocks")
              .select("id", { count: "exact", head: true })
              .or(
                `and(blocker_id.eq.${user.id},blocked_id.eq.${mentioned.id}),and(blocker_id.eq.${mentioned.id},blocked_id.eq.${user.id})`
              );
            if ((mentionBlockCount ?? 0) > 0) continue;
            notified.add(mentioned.id);
            const { data: mentionNotif } = await adminClient
              .from("notifications")
              .insert({
                user_id: mentioned.id,
                type: "mention",
                actor_id: user.id,
                post_id: postId,
                is_read: false,
              })
              .select("id")
              .single();
            if (mentionNotif?.id) {
              dispatchPushForNotification(mentionNotif.id).catch(() => {});
            }
          }
        } catch { /* silent */ }
      })();
    }

    const responseData = { comment: filtered[0] };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[posts/comments POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "comments:delete", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) return NextResponse.json({ error: "ID do comentário necessário" }, { status: 400 });

    const { error } = await supabase
      .from("comments").update({ is_deleted: true })
      .eq("id", commentId).eq("author_id", user.id);
    if (error) throw error;

    const responseData = { success: true };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[posts/comments DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
