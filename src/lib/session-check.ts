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
 * Aqui a gente revalida a sessão no client; se de fato não há usuário,
 * sincroniza o estado local (logout) em vez de continuar tentando.
 */
let checking = false;

export async function handleAuthPollingFailure(status: number) {
  if (status !== 401) return;
  if (checking) return;
  checking = true;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      useStore.getState().logout();
    }
  } catch {
    /* ignore — próxima tentativa cobre */
  } finally {
    checking = false;
  }
}
