'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePortal } from '@/lib/auth/guard';

/**
 * Marcar y desmarcar una lección como completada.
 *
 * No se comprueba acá si el alumno puede completar la lección: lo comprueba la
 * política de la base, que exige matrícula en un curso publicado (D9). Si esto
 * lo validara además por su cuenta, habría dos reglas que mantener sincronizadas
 * y una se quedaría atrás.
 *
 * Lo que sí se hace es distinguir "no tienes permiso" de "falló la red", porque
 * al alumno le importa la diferencia.
 */

export type ToggleResult = { error: string | null };

const uuid = z.string().uuid('Identificador inválido.');

export async function setCompleted(
  lessonId: string,
  completed: boolean,
  courseSlug: string,
): Promise<ToggleResult> {
  const session = await requirePortal();
  if (!uuid.safeParse(lessonId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();

  if (completed) {
    const { error } = await supabase
      .from('lesson_completions')
      .insert({ lesson_id: lessonId, student_id: session.userId });

    // 42501 es la política negando: no hay matrícula, o el curso no está
    // publicado. 23505 es que ya estaba marcada, y eso no es un error.
    if (error && error.code !== '23505') {
      return {
        error:
          error.code === '42501'
            ? 'Necesitas estar matriculado en este curso para registrar tu avance.'
            : `No se pudo guardar tu avance: ${error.message}`,
      };
    }
  } else {
    const { error } = await supabase
      .from('lesson_completions')
      .delete()
      .eq('lesson_id', lessonId)
      .eq('student_id', session.userId);
    if (error) return { error: `No se pudo actualizar tu avance: ${error.message}` };
  }

  revalidatePath(`/cursos/${courseSlug}`);
  return { error: null };
}
