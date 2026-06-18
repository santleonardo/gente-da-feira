import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Retorna um Supabase client para uso no browser.
 *
 * NOTA: O `as any` no retorno é necessário porque este projeto não
 * gera tipos do Supabase. Sem isso, `.select(string)` retorna
 * `GenericStringError` para qualquer query.
 */
export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
    );
  }
  const client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client as any;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}
