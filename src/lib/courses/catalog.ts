import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Enum } from '@/lib/db/types';
import type { QueryResult } from './queries';

/**
 * Lo que ve el ALUMNO. Consultas separadas de las del editor a propósito: son
 * dos audiencias con dos formas distintas, y mezclarlas en una función con
 * banderas es cómo se acaban filtrando campos a quien no debe verlos.
 *
 * No hay ningún filtro de permisos escrito acá. Lo aplica RLS: el temario llega
 * porque el curso es visible en catálogo (D8), y de lesson_contents llegan
 * exactamente las filas que este usuario puede leer — la muestra, o todas si está
 * matriculado. La interfaz refleja lo que la base devolvió en vez de decidir por
 * su cuenta quién puede leer qué.
 */

export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: Enum<'course_status'>;
  enrolled: boolean;
  lessonCount: number;
};

export async function listCatalog(
  organizationId: string,
  userId: string,
): Promise<QueryResult<CatalogItem[]>> {
  const supabase = await createClient();

  const [cursos, matriculas] = await Promise.all([
    supabase
      .from('courses')
      .select('id, slug, title, subtitle, status, lessons(id)')
      .eq('organization_id', organizationId)
      .eq('status', 'published')
      .order('title'),
    supabase.from('enrollments').select('course_id').eq('student_id', userId),
  ]);

  if (cursos.error) return { data: null, error: cursos.error.message };
  if (matriculas.error) return { data: null, error: matriculas.error.message };

  const inscrito = new Set(matriculas.data.map((e) => e.course_id));

  return {
    data: cursos.data.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      status: c.status,
      enrolled: inscrito.has(c.id),
      lessonCount: c.lessons.length,
    })),
    error: null,
  };
}

export type StudentLesson = {
  id: string;
  title: string;
  kind: Enum<'lesson_kind'>;
  is_required: boolean;
  is_preview: boolean;
  duration_seconds: number | null;
  /** El cuerpo, si este usuario puede leerlo. RLS decide; acá solo se refleja. */
  body: string | null;
  /** true si el contenido llegó: matrícula, o lección de muestra. */
  readable: boolean;
};

export type StudentCourse = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  enrolled: boolean;
  modules: { id: string; title: string; description: string | null; lessons: StudentLesson[] }[];
};

export async function getCourseForStudent(
  organizationId: string,
  slug: string,
  userId: string,
): Promise<QueryResult<StudentCourse | null>> {
  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from('courses')
    .select(
      `id, slug, title, subtitle, description,
       modules(id, title, description, order_index,
               lessons(id, title, kind, order_index, is_required, is_preview, duration_seconds))`,
    )
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!course) return { data: null, error: null };

  const [contenidos, matricula] = await Promise.all([
    // Llegan solo las que este usuario puede leer. Esa es la autorización.
    supabase.from('lesson_contents').select('lesson_id, body').eq('course_id', course.id),
    supabase
      .from('enrollments')
      .select('course_id')
      .eq('course_id', course.id)
      .eq('student_id', userId)
      .maybeSingle(),
  ]);

  if (contenidos.error) return { data: null, error: contenidos.error.message };

  const cuerpo = new Map(contenidos.data.map((c) => [c.lesson_id, c.body]));

  const modules = [...course.modules]
    .sort((a, b) => a.order_index - b.order_index)
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      lessons: [...m.lessons]
        .sort((a, b) => a.order_index - b.order_index)
        .map((l) => ({
          id: l.id,
          title: l.title,
          kind: l.kind,
          is_required: l.is_required,
          is_preview: l.is_preview,
          duration_seconds: l.duration_seconds,
          body: cuerpo.get(l.id) ?? null,
          readable: cuerpo.has(l.id),
        })),
    }));

  return {
    data: { ...course, enrolled: matricula.data !== null, modules },
    error: null,
  };
}
