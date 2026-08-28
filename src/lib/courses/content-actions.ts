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

export async function renameItem(
  tabla: 'modules' | 'lessons',
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
  tabla: 'modules' | 'lessons',
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
  nivel: 'modules' | 'lessons',
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
