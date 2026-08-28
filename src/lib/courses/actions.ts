'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/guard';
import { checkSlug, describeSlugProblem, slugify } from './slug';

/**
 * Escrituras de cursos.
 *
 * Cada acción empieza por requireStaff(), que resuelve la organización desde el
 * HOST y comprueba el rol. Nunca se recibe organization_id del formulario: si el
 * cliente pudiera elegir la organización, el aislamiento entre instituciones
 * dependería de un campo oculto. RLS lo negaría igual, pero la petición no
 * debería llegar a existir.
 */

export type FormResult = { error: string | null };

const nuevoCurso = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'El título necesita al menos 3 caracteres.')
    .max(200, 'El título no puede pasar de 200 caracteres.'),
  slug: z.string().trim().optional(),
});

export async function createCourse(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const session = await requireStaff();

  const parsed = nuevoCurso.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  }

  // Si no escribieron dirección, se propone desde el título. Se valida igual:
  // un título de dos letras produce un slug que la base rechaza, y es mejor
  // decirlo acá que devolver un error de restricción.
  const slug = parsed.data.slug?.length ? parsed.data.slug : slugify(parsed.data.title);
  const problem = checkSlug(slug);
  if (problem) {
    return {
      error:
        parsed.data.slug?.length
          ? describeSlugProblem(problem)
          : `No se pudo proponer una dirección a partir de "${parsed.data.title}". ${describeSlugProblem(problem)}`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('courses')
    .insert({
      organization_id: session.organization.id,
      slug: slug.toLowerCase(),
      title: parsed.data.title,
      created_by: session.userId,
    })
    .select('slug')
    .single();

  if (error) {
    // 23505 es violación de unicidad. El único índice único que puede fallar acá
    // es (organization_id, slug), así que el mensaje puede ser específico.
    if (error.code === '23505') {
      return { error: `Ya existe un curso con la dirección "${slug}". Elige otra.` };
    }
    return { error: `No se pudo crear el curso: ${error.message}` };
  }

  revalidatePath('/panel/cursos');
  redirect(`/panel/cursos/${data.slug}`);
}
