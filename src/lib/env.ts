import { z } from 'zod';

/**
 * Validación de entorno en el arranque. Si falta algo, el proceso falla acá con
 * un mensaje claro en vez de reventar en una petición cualquiera meses después.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(3),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  });
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno inválidas:\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}
