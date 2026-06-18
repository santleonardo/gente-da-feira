import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Retorna um Supabase client autenticado via cookies do navegador.
 *
 * NOTA: O generic <any> é usado porque este projeto não gera tipos
 * do Supabase (não há `supabase gen types`). Sem isso, o cliente
 * retorna `GenericStringError` para queries com `.select(string)`,
 * impedindo acesso a propriedades do resultado.
 *
 * Quando tipos gerados forem adicionados, substitua `<any>` por
 * `<Database>` importando da definição gerada.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components nao podem setar cookies
          }
        },
      },
    }
  )
}

/**
 * SEC-003: Admin client com fallback FAIL-CLOSED.
 *
 * Se SUPABASE_SERVICE_ROLE_KEY não estiver configurada, lança erro
 * em vez de usar anon key (que era o comportamento anterior e
 * violava o princípio de menor privilégio).
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. " +
      "Operação que requer privilégios elevados foi abortada."
    );
  }

  return createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}
