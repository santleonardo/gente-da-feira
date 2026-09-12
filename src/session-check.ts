import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";

/**
 * Chamado quando um endpoint autenticado responde 401 mesmo com `profile`
 * setado no client. Isso acontece quando o middleware detecta um refresh
 * token morto (revogado/expirado) e limpa os cookies no servidor, mas o
 * client Supabase ainda não percebeu — o `profile` fica "preso" no store e
 * o polling (notificações, banners, follow requests etc.) fica batendo 401
 * pra sempre.
 *
 * Revalida a sessão no client; se não há usuário (ou a sessão local está
 * inconsistente com o 401 do servidor), faz logout local e para o spam.
 */
let checking = false;

export async function handleAuthPollingFailure(status: number) {
  if (status !== 401) return;
  if (checking) return;
  checking = true;
  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!user || error) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
      useStore.getState().logout();
    }
  } catch {
    // Em dúvida após 401, preferir limpar o estado local a continuar o spam.
    try {
      useStore.getState().logout();
    } catch {
      /* ignore */
    }
  } finally {
    checking = false;
  }
}
