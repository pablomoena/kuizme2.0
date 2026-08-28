import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Enum } from '@/lib/db/types';
import type { QueryResult } from './queries';
import { esReason, type Reason } from './release';

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
  /** Desde la vista my_course_progress, que es la única definición (D9). */
  progress: { completed: number; total: number; percent: number } | null;
};

export async function listCatalog(
  organizationId: string,
  userId: string,
): Promise<QueryResult<CatalogItem[]>> {
  const supabase = await createClient();

  const [cursos, matriculas, progresos] = await Promise.all([
    supabase
      .from('courses')
      .select('id, slug, title, subtitle, status, lessons(id)')
      .eq('organization_id', organizationId)
      .eq('status', 'published')
      .order('title'),
    supabase.from('enrollments').select('course_id').eq('student_id', userId),
    // El progreso NO se calcula acá. Se lee de la vista, y por eso no puede
    // discrepar del que muestra el lector.
    supabase.from('my_course_progress').select('course_id, completed, total, percent'),
  ]);

  if (cursos.error) return { data: null, error: cursos.error.message };
  if (matriculas.error) return { data: null, error: matriculas.error.message };
  if (progresos.error) return { data: null, error: progresos.error.message };

  const inscrito = new Set(matriculas.data.map((e) => e.course_id));
  const avance = new Map(
    progresos.data.flatMap((p) =>
      p.course_id === null
        ? []
        : [[
            p.course_id,
            { completed: p.completed ?? 0, total: p.total ?? 0, percent: p.percent ?? 0 },
          ] as const],
    ),
  );

  return {
    data: cursos.data.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      status: c.status,
      enrolled: inscrito.has(c.id),
      lessonCount: c.lessons.length,
      progress: avance.get(c.id) ?? null,
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
  /** true si el contenido llegó: la puerta de la base lo decidió, no la interfaz. */
  readable: boolean;
  completed: boolean;
  /** Por qué está cerrada, y cuándo abre. Explicativo; no decide acceso. */
  reason: Reason;
  opensAt: string | null;
};

export type StudentCourse = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  enrolled: boolean;
  progress: { completed: number; total: number; percent: number } | null;
  /** D11: cómo puede matricularse este usuario en este curso, ahora. */
  enroll:
    | { via: 'ya-matriculado' }
    | { via: 'directa' }
    | { via: 'solicitud'; pendiente: { id: string } | null }
    | { via: 'ninguna' };
  precio: { kind: Enum<'pricing_kind'>; amountCents: number | null; currency: string } | null;
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

  const [contenidos, matricula, completadas, progreso, apertura, autoMatricula, precio, solicitud] =
    await Promise.all([
    // Llegan solo las que este usuario puede leer. Esa es la autorización.
    supabase.from('lesson_contents').select('lesson_id, body').eq('course_id', course.id),
    supabase
      .from('enrollments')
      .select('course_id')
      .eq('course_id', course.id)
      .eq('student_id', userId)
      .maybeSingle(),
    supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('course_id', course.id)
      .eq('student_id', userId),
    supabase
      .from('my_course_progress')
      .select('completed, total, percent')
      .eq('course_id', course.id)
      .maybeSingle(),
    // El motivo del bloqueo y la fecha de apertura, de la misma vista cuyo
    // is_open sale de can_open_lesson. Una sola autoridad.
    supabase
      .from('my_lesson_availability')
      .select('lesson_id, reason, opens_at')
      .eq('course_id', course.id),
    // can_self_enroll es la MISMA función que usa la política: el botón aparece
    // si y solo si la base aceptaría la matrícula.
    supabase.rpc('can_self_enroll', { _course: course.id }),
    supabase
      .from('course_pricing')
      .select('kind, amount_cents, currency')
      .eq('course_id', course.id)
      .maybeSingle(),
    supabase
      .from('enrollment_requests')
      .select('id')
      .eq('course_id', course.id)
      .eq('student_id', userId)
      .eq('status', 'pending')
      .maybeSingle(),
  ]);

  if (contenidos.error) return { data: null, error: contenidos.error.message };
  if (completadas.error) return { data: null, error: completadas.error.message };
  if (progreso.error) return { data: null, error: progreso.error.message };
  if (apertura.error) return { data: null, error: apertura.error.message };
  if (autoMatricula.error) return { data: null, error: autoMatricula.error.message };

  const cuerpo = new Map(contenidos.data.map((c) => [c.lesson_id, c.body]));
  const hechas = new Set(completadas.data.map((c) => c.lesson_id));
  const motivos = new Map(
    apertura.data.flatMap((a) =>
      a.lesson_id === null ? [] : [[a.lesson_id, { reason: esReason(a.reason), opensAt: a.opens_at }] as const],
    ),
  );

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
          completed: hechas.has(l.id),
          reason: motivos.get(l.id)?.reason ?? 'sin-matricula',
          opensAt: motivos.get(l.id)?.opensAt ?? null,
        })),
    }));

  return {
    data: {
      ...course,
      enrolled: matricula.data !== null,
      enroll:
        matricula.data !== null
          ? { via: 'ya-matriculado' as const }
          : autoMatricula.data === true
            ? { via: 'directa' as const }
            : { via: 'solicitud' as const, pendiente: solicitud.data ?? null },
      precio: precio.data
        ? {
            kind: precio.data.kind,
            amountCents: precio.data.amount_cents,
            currency: precio.data.currency,
          }
        : null,
      progress: progreso.data
        ? {
            completed: progreso.data.completed ?? 0,
            total: progreso.data.total ?? 0,
            percent: progreso.data.percent ?? 0,
          }
        : null,
      modules,
    },
    error: null,
  };
}
