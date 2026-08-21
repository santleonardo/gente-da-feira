import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Retorna um Supabase client para uso no browser.
 *
 * NOTA: O generic <any> é usado porque este projeto não gera tipos
 * do Supabase (não há `supabase gen types`). Sem isso, o cliente
 * retorna `GenericStringError` para queries com `.select(string)`.
 */
export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
    );
  }
  return createBrowserClient<any>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
