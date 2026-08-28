'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/guard';

/**
 * Escrituras de módulos y lecciones.
 *
 * Todas empiezan por requireStaff(), que resuelve la organización desde el host.
 * Nunca se recibe organization_id ni course_id de confianza desde el cliente:
 * los triggers de la base los derivan del padre (D2), y RLS filtra por
 * organización. El id que sí llega del cliente es el del elemento a modificar, y
 * ahí el filtro es RLS: si no es de tu organización, la escritura no toca nada.
 *
 * Por eso cada escritura comprueba que afectó una fila. Un UPDATE que no toca
 * nada por RLS no devuelve error, y sin la comprobación la interfaz mostraría un
 * cambio que la base nunca guardó.
 */

export type FormResult = { error: string | null };
const OK: FormResult = { error: null };

const uuid = z.string().uuid('Identificador inválido.');
const titulo = z
  .string()
  .trim()
  .min(2, 'El título necesita al menos 2 caracteres.')
  .max(200, 'El título no puede pasar de 200 caracteres.');

/** Revalida la ficha del curso. Se pasa el slug porque la acción no lo deduce. */
function refresh(courseSlug: string) {
  revalidatePath(`/panel/cursos/${courseSlug}`);
}

export async function createModule(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff();
  const parsed = z
    .object({ courseId: uuid, courseSlug: z.string(), title: titulo })
    .safeParse({
      courseId: formData.get('courseId'),
      courseSlug: formData.get('courseSlug'),
      title: formData.get('title'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };

  const supabase = await createClient();

  // El nuevo módulo va al final. Se lee el máximo en vez de contar filas: si
  // alguien borró un módulo del medio, contar daría un índice repetido.
  const { data: ultimo } = await supabase
    .from('modules')
    .select('order_index')
    .eq('course_id', parsed.data.courseId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('modules').insert({
    course_id: parsed.data.courseId,
    title: parsed.data.title,
    order_index: (ultimo?.order_index ?? 0) + 1,
  });

  if (error) return { error: `No se pudo crear el módulo: ${error.message}` };
  refresh(parsed.data.courseSlug);
  return OK;
}

export async function createLesson(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff();
  const parsed = z
    .object({ moduleId: uuid, courseSlug: z.string(), title: titulo })
    .safeParse({
      moduleId: formData.get('moduleId'),
      courseSlug: formData.get('courseSlug'),
      title: formData.get('title'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };

  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from('lessons')
    .select('order_index')
    .eq('module_id', parsed.data.moduleId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  // organization_id y course_id no se pasan: los derivan los triggers (D2/D7).
  const { error } = await supabase.from('lessons').insert({
    module_id: parsed.data.moduleId,
    title: parsed.data.title,
    order_index: (ultima?.order_index ?? 0) + 1,
  });

  if (error) return { error: `No se pudo crear la lección: ${error.message}` };
  refresh(parsed.data.courseSlug);
  return OK;
}

/**
 * Crear una sección dentro de un módulo (D13).
 *
 * organization_id y course_id no se pasan: los derivan los triggers desde el
 * módulo, igual que en lecciones. Lo único que llega del cliente es a qué módulo
 * va, y ahí el filtro es RLS.
 */
export async function createSection(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff();
  const parsed = z
    .object({ moduleId: uuid, courseSlug: z.string(), title: titulo })
    .safeParse({
      moduleId: formData.get('moduleId'),
      courseSlug: formData.get('courseSlug'),
      title: formData.get('title'),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };

  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from('sections')
    .select('order_index')
    .eq('module_id', parsed.data.moduleId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('sections').insert({
    module_id: parsed.data.moduleId,
    title: parsed.data.title,
    order_index: (ultima?.order_index ?? 0) + 1,
  });

  if (error) return { error: `No se pudo crear la sección: ${error.message}` };
  refresh(parsed.data.courseSlug);
  return OK;
}

export async function renameItem(
  tabla: 'modules' | 'sections' | 'lessons',
  id: string,
  title: string,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  const parsed = z.object({ id: uuid, title: titulo }).safeParse({ id, title });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa el título.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabla)
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.id)
    .select('id');

  if (error) return { error: `No se pudo renombrar: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar esto, o ya no existe.' };

  refresh(courseSlug);
  return OK;
}

export async function deleteItem(
  tabla: 'modules' | 'sections' | 'lessons',
  id: string,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { data, error } = await supabase.from(tabla).delete().eq('id', id).select('id');

  if (error) return { error: `No se pudo borrar: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para borrar esto, o ya no existe.' };

  refresh(courseSlug);
  return OK;
}

/**
 * Reordenar. Se manda la lista COMPLETA de ids en el orden nuevo, y la base la
 * aplica en una sola sentencia: o queda el orden entero, o no cambia nada. Si la
 * lista no coincide con lo que la base tiene, se rechaza y el cliente recarga —
 * significa que alguien más cambió el curso mientras tanto.
 */
export async function reorder(
  nivel: 'modules' | 'sections' | 'lessons',
  parentId: string,
  orderedIds: string[],
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();

  const parsed = z
    .object({ parentId: uuid, orderedIds: z.array(uuid).min(1, 'La lista viene vacía.') })
    .safeParse({ parentId, orderedIds });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Orden inválido.' };

  const supabase = await createClient();
  const { error } =
    nivel === 'modules'
      ? await supabase.rpc('reorder_modules', {
          _course: parsed.data.parentId,
          _ids: parsed.data.orderedIds,
        })
      : nivel === 'sections'
        ? await supabase.rpc('reorder_sections', {
            _module: parsed.data.parentId,
            _ids: parsed.data.orderedIds,
          })
        : await supabase.rpc('reorder_lessons', {
            _module: parsed.data.parentId,
            _ids: parsed.data.orderedIds,
          });

  if (error) {
    // 42501 lo lanza la función cuando RLS dejó el UPDATE en cero filas.
    if (error.code === '42501') {
      return { error: 'No tienes permiso para reordenar este contenido.' };
    }
    return { error: error.message };
  }

  refresh(courseSlug);
  return OK;
}

/**
 * Marca o desmarca una lección como muestra (D8).
 *
 * Es la palanca de venta: con una lección abierta, el alumno puede leer algo
 * real antes de pagar. Abre SOLO el contenido de esa lección — el resto del
 * curso sigue cerrado, y eso lo garantiza la política, no esta función.
 */
export async function setPreview(
  lessonId: string,
  isPreview: boolean,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(lessonId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lessons')
    .update({ is_preview: isPreview })
    .eq('id', lessonId)
    .select('id');

  if (error) return { error: `No se pudo cambiar la muestra: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar esto, o ya no existe.' };

  refresh(courseSlug);
  return OK;
}

/**
 * Configuración de entrega del curso (D10). Solo el modo y la secuencia; las
 * fechas y los plazos van por lección, porque es donde el docente los piensa.
 */
export async function setRelease(
  courseId: string,
  releaseMode: 'immediate' | 'scheduled' | 'relative',
  sequential: boolean,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(courseId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .update({ release_mode: releaseMode, sequential })
    .eq('id', courseId)
    .select('id');

  if (error) return { error: `No se pudo guardar la configuración: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar este curso.' };

  refresh(courseSlug);
  return OK;
}

/**
 * Cuándo se abre una lección. Se guarda el campo que corresponde al modo del
 * curso; el otro se deja como está, para no perder lo configurado si el
 * administrador cambia de modo y vuelve.
 */
export async function setLessonUnlock(
  lessonId: string,
  campo: 'unlock_at' | 'unlock_after_days',
  valor: string | null,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(lessonId).success) return { error: 'Identificador inválido.' };

  let patch: { unlock_at?: string | null; unlock_after_days?: number | null };

  if (campo === 'unlock_at') {
    if (valor && Number.isNaN(Date.parse(valor))) return { error: 'Esa fecha no es válida.' };
    patch = { unlock_at: valor && valor.length > 0 ? new Date(valor).toISOString() : null };
  } else {
    if (valor === null || valor.length === 0) {
      patch = { unlock_after_days: null };
    } else {
      const dias = Number(valor);
      if (!Number.isInteger(dias) || dias < 0) {
        return { error: 'Los días tienen que ser un número entero de 0 o más.' };
      }
      patch = { unlock_after_days: dias };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lessons')
    .update(patch)
    .eq('id', lessonId)
    .select('id');

  if (error) return { error: `No se pudo guardar: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar esta lección.' };

  refresh(courseSlug);
  return OK;
}

/**
 * Controles de inscripción (D12): abierta, plazo y cupo.
 *
 * El cupo no se valida contra los matriculados actuales acá: bajarlo por debajo
 * de los que ya están es legítimo —cerrar el ingreso sin echar a nadie— y el
 * trigger de la base impide que entren más. Validarlo acá impediría ese caso.
 */
export async function setEnrollmentControls(
  courseId: string,
  enrollmentOpen: boolean,
  deadline: string | null,
  maxStudents: string | null,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(courseId).success) return { error: 'Identificador inválido.' };

  if (deadline && Number.isNaN(Date.parse(deadline))) {
    return { error: 'Esa fecha no es válida.' };
  }

  let cupo: number | null = null;
  if (maxStudents !== null && maxStudents.length > 0) {
    cupo = Number(maxStudents);
    if (!Number.isInteger(cupo) || cupo < 1) {
      return { error: 'El cupo tiene que ser un número entero de 1 o más.' };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .update({
      enrollment_open: enrollmentOpen,
      enrollment_deadline: deadline ? new Date(deadline).toISOString() : null,
      max_students: cupo,
    })
    .eq('id', courseId)
    .select('id');

  if (error) return { error: `No se pudo guardar: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar este curso.' };

  refresh(courseSlug);
  return OK;
}

/**
 * Agrupar una lección en una sección, o sacarla (D13).
 *
 * Pasa por set_lesson_section() en vez de un UPDATE directo por un motivo: la
 * función comprueba que la sección sea del MISMO módulo y devuelve un mensaje
 * que se puede mostrar. Un UPDATE directo también sería rechazado —el trigger
 * está para eso— pero con un error de base de datos en bruto.
 */
export async function setLessonSection(
  lessonId: string,
  sectionId: string | null,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(lessonId).success) return { error: 'Identificador inválido.' };
  if (sectionId !== null && !uuid.safeParse(sectionId).success) {
    return { error: 'Identificador de sección inválido.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_lesson_section', {
    _lesson: lessonId,
    _section: sectionId,
  });

  if (error) {
    if (error.code === '42501') return { error: 'No tienes permiso para mover esta lección.' };
    return { error: error.message };
  }

  refresh(courseSlug);
  return OK;
}

/**
 * Cuándo se abre un MÓDULO (D13). Mismo par de campos que la lección, y la misma
 * regla: se guarda el que corresponde al modo del curso y el otro se deja como
 * está, para no perder lo configurado al cambiar de modo y volver.
 *
 * El módulo es suelo, no techo: poner una fecha acá no borra las de sus
 * lecciones, y una lección con fecha posterior sigue abriéndose después.
 */
export async function setModuleUnlock(
  moduleId: string,
  campo: 'unlock_at' | 'unlock_after_days',
  valor: string | null,
  courseSlug: string,
): Promise<FormResult> {
  await requireStaff();
  if (!uuid.safeParse(moduleId).success) return { error: 'Identificador inválido.' };

  let patch: { unlock_at?: string | null; unlock_after_days?: number | null };

  if (campo === 'unlock_at') {
    if (valor && Number.isNaN(Date.parse(valor))) return { error: 'Esa fecha no es válida.' };
    patch = { unlock_at: valor && valor.length > 0 ? new Date(valor).toISOString() : null };
  } else {
    if (valor === null || valor.length === 0) {
      patch = { unlock_after_days: null };
    } else {
      const dias = Number(valor);
      if (!Number.isInteger(dias) || dias < 0) {
        return { error: 'Los días tienen que ser un número entero de 0 o más.' };
      }
      patch = { unlock_after_days: dias };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('modules')
    .update(patch)
    .eq('id', moduleId)
    .select('id');

  if (error) return { error: `No se pudo guardar: ${error.message}` };
  if (data.length === 0) return { error: 'No tienes permiso para editar este módulo.' };

  refresh(courseSlug);
  return OK;
}
