import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Enum } from '@/lib/db/types';
import type { QueryResult } from './queries';

/**
 * El lector del alumno.
 *
 * El progreso NO se calcula acá: se lee de la vista my_course_progress, que es la
 * única definición (D9). En la v1 cada pantalla calculaba su propio total y una
 * lo infería dividiendo por el porcentaje, así que los totales cambiaban al
 * navegar. Si hay un solo sitio de donde leerlo, no hay nada que reconstruir.
 */

export type Progress = { completed: number; total: number; percent: number };

export type ReaderLesson = {
  id: string;
  title: string;
  kind: Enum<'lesson_kind'>;
  isRequired: boolean;
  isPreview: boolean;
  body: string | null;
  /** El contenido llegó de la base: matrícula, o lección de muestra. */
  readable: boolean;
  completed: boolean;
};

export type ReaderView = {
  course: { id: string; slug: string; title: string };
  lesson: ReaderLesson;
  /** Para navegar sin volver al índice. null en los extremos. */
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  position: { index: number; total: number };
  progress: Progress;
  enrolled: boolean;
};

export async function getReaderView(
  organizationId: string,
  courseSlug: string,
  lessonId: string,
  userId: string,
): Promise<QueryResult<ReaderView | null>> {
  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, slug, title, modules(id, order_index, lessons(id, title, kind, order_index, is_required, is_preview))')
    .eq('organization_id', organizationId)
    .eq('slug', courseSlug)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!course) return { data: null, error: null };

  // El orden del curso es una sola secuencia: módulos por orden, y dentro las
  // lecciones por el suyo. La navegación anterior/siguiente cruza módulos, que es
  // lo que el alumno espera al terminar el último tema de uno.
  const secuencia = [...course.modules]
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((m) => [...m.lessons].sort((a, b) => a.order_index - b.order_index));

  const i = secuencia.findIndex((l) => l.id === lessonId);
  if (i === -1) return { data: null, error: null };
  const actual = secuencia[i];
  if (!actual) return { data: null, error: null };

  const [contenido, completada, progreso, matricula] = await Promise.all([
    supabase.from('lesson_contents').select('body').eq('lesson_id', lessonId).maybeSingle(),
    supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('lesson_id', lessonId)
      .eq('student_id', userId)
      .maybeSingle(),
    supabase
      .from('my_course_progress')
      .select('completed, total, percent')
      .eq('course_id', course.id)
      .maybeSingle(),
    supabase
      .from('enrollments')
      .select('course_id')
      .eq('course_id', course.id)
      .eq('student_id', userId)
      .maybeSingle(),
  ]);

  if (contenido.error) return { data: null, error: contenido.error.message };
  if (progreso.error) return { data: null, error: progreso.error.message };

  const anterior = i > 0 ? secuencia[i - 1] : undefined;
  const siguiente = i < secuencia.length - 1 ? secuencia[i + 1] : undefined;

  return {
    data: {
      course: { id: course.id, slug: course.slug, title: course.title },
      lesson: {
        id: actual.id,
        title: actual.title,
        kind: actual.kind,
        isRequired: actual.is_required,
        isPreview: actual.is_preview,
        body: contenido.data?.body ?? null,
        readable: contenido.data !== null,
        completed: completada.data !== null,
      },
      prev: anterior ? { id: anterior.id, title: anterior.title } : null,
      next: siguiente ? { id: siguiente.id, title: siguiente.title } : null,
      position: { index: i + 1, total: secuencia.length },
      progress: {
        completed: progreso.data?.completed ?? 0,
        total: progreso.data?.total ?? 0,
        percent: progreso.data?.percent ?? 0,
      },
      enrolled: matricula.data !== null,
    },
    error: null,
  };
}
