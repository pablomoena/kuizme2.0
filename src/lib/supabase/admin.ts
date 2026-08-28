import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from '@/lib/db/types';

/**
 * ⚠️  SERVICE ROLE — omite RLS por completo.
 *
 * Uso permitido, y nada más:
 *   · webhooks (Mercado Pago, Stripe, Zoom, Bunny) donde no hay usuario
 *   · tareas de sistema y jobs
 *   · lectura de `question_keys` durante la corrección de un examen
 *
 * Prohibido: atender una petición de usuario con este cliente. Si lo haces, la
 * capa 3 del modelo de seguridad deja de existir. Toda llamada nueva a esta
 * función tiene que justificarse en la revisión de código.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada');

  return createSupabaseClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
