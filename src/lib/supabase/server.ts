import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Retorna um Supabase client autenticado via cookies do navegador.
 *
 * NOTA: O `as any` no retorno é necessário porque este projeto não
 * gera tipos do Supabase. Sem isso, `.select(string)` retorna
 * `GenericStringError` para qualquer query, impedindo acesso a
 * propriedades do resultado em TODOS os arquivos do projeto.
 *
 * Quando tipos gerados forem adicionados, remova o `as any`.
 */
export async function createClient() {
  const cookieStore = await cookies()

  const client = createServerClient(
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

  return client as any
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

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  return client as any
}
