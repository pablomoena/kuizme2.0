import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Enum } from '@/lib/db/types';

/**
 * Lecturas de cursos. Todas con el token del usuario, así que lo que devuelven
 * ya está filtrado por RLS: el staff ve los cursos de su organización, un alumno
 * solo los publicados de su catálogo y aquellos donde está matriculado (D7).
 *
 * No se pasa organization_id como filtro de seguridad —eso lo hace RLS— sino
 * porque un índice sobre (organization_id, status) hace la consulta directa.
 */

export type CourseListItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: Enum<'course_status'>;
  visibility: Enum<'course_visibility'>;
  updated_at: string;
  moduleCount: number;
  lessonCount: number;
};

export type QueryResult<T> = { data: T; error: null } | { data: null; error: string };

export async function listCourses(organizationId: string): Promise<QueryResult<CourseListItem[]>> {
  const supabase = await createClient();

  // Los conteos vienen en la misma consulta: pedirlos aparte por curso es el
  // patrón que en la v1 hacía 40 peticiones para pintar una lista de 20 cursos.
  const { data, error } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, status, visibility, updated_at, modules(id), lessons(id)')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false });

  if (error) return { data: null, error: error.message };

  return {
    data: data.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      status: c.status,
      visibility: c.visibility,
      updated_at: c.updated_at,
      moduleCount: c.modules.length,
      lessonCount: c.lessons.length,
    })),
    error: null,
  };
}

export type CourseDetail = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: Enum<'course_status'>;
  visibility: Enum<'course_visibility'>;
  release_mode: Enum<'course_release_mode'>;
  sequential: boolean;
  enrollment_open: boolean;
  enrollment_deadline: string | null;
  max_students: number | null;
  /** Matrículas activas: es lo que ocupa cupo (D12). */
  activeEnrollments: number;
  modules: {
    id: string;
    title: string;
    description: string | null;
    order_index: number;
    /** D13: el módulo libera, y actúa como suelo de sus lecciones. */
    unlock_at: string | null;
    unlock_after_days: number | null;
    /** D13: agrupación dentro del módulo. Puede estar vacía. */
    sections: { id: string; title: string; order_index: number }[];
    lessons: {
      id: string;
      title: string;
      kind: Enum<'lesson_kind'>;
      order_index: number;
      is_required: boolean;
      /** D8: su contenido se lee sin matrícula. La lección de muestra. */
      is_preview: boolean;
      /** D13: null = cuelga del módulo directo. */
      section_id: string | null;
      unlock_at: string | null;
      unlock_after_days: number | null;
    }[];
  }[];
};

export async function getCourse(
  organizationId: string,
  slug: string,
): Promise<QueryResult<CourseDetail | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('courses')
    .select(
      `id, slug, title, subtitle, description, status, visibility, release_mode, sequential,
       enrollment_open, enrollment_deadline, max_students,
       modules(id, title, description, order_index, unlock_at, unlock_after_days,
               sections(id, title, order_index),
               lessons(id, title, kind, order_index, is_required, is_preview, section_id,
                       unlock_at, unlock_after_days))`,
    )
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  const activos = await supabase
    .from('enrollments')
    .select('course_id', { count: 'exact', head: true })
    .eq('course_id', data.id)
    .eq('status', 'active');
  if (activos.error) return { data: null, error: activos.error.message };

  // El orden lo decide el servidor, no el cliente: una lista que se reordena
  // sola según lo que devuelva Postgres es imposible de depurar.
  const modules = [...data.modules]
    .sort((a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title, 'es'))
    .map((m) => ({
      ...m,
      // Las secciones se ordenan acá y no en la vista: agrupar() las reordena
      // igual, pero dejarlas ordenadas hace que el <select> de asignación y el
      // árbol muestren la misma lista.
      sections: [...m.sections].sort(
        (a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title, 'es'),
      ),
      lessons: [...m.lessons].sort(
        (a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title, 'es'),
      ),
    }));

  return {
    data: { ...data, activeEnrollments: activos.count ?? 0, modules },
    error: null,
  };
}
