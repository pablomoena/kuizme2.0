'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo.').email('Ese correo no parece válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
  // A dónde volver después de entrar. Se valida abajo: nunca se redirige a un
  // destino que venga de fuera.
  next: z.string().optional(),
});

export type LoginState = { error: string | null };

/** Solo rutas internas. Un `next` con esquema o con host es un redirect abierto. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/panel';
  return next;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Un mensaje único a propósito: distinguir "no existe la cuenta" de
    // "contraseña incorrecta" convierte el login en un verificador de correos.
    return { error: 'Correo o contraseña incorrectos.' };
  }

  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
