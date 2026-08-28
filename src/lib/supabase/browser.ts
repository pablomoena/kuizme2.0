import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { DatabaseUsuario } from '@/lib/db/types';

/**
 * Cliente de navegador. Solo para interactividad real (rendir examen, editor de
 * preguntas). Nunca para leer datos sensibles: eso vive en el servidor.
 */
export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  return createBrowserClient<DatabaseUsuario>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
