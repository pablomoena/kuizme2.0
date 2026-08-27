import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Cliente de servidor con la sesión DEL USUARIO.
 *
 * Es el que se usa para todo lo que hace un usuario. Al llevar su token, RLS
 * aplica: la capa 3 sigue en pie. No usar el service role para operaciones de
 * usuario — eso desactivaría RLS y volveríamos al modelo de la v1, donde un
 * error de política era una brecha de datos.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Los Server Components no pueden escribir cookies. El refresco de
          // sesión ocurre en el middleware, así que ignorar acá es correcto.
        }
      },
    },
  });
}
