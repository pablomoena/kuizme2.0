'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePortal, requireStaff } from '@/lib/auth/guard';

/**
 * Matrícula: las dos vías (D11).
 *
 * Ninguna de estas funciones decide si el alumno PUEDE. Eso lo deciden las
 * políticas y can_self_enroll(). Acá se traduce el fallo de la base a algo que
 * el usuario entienda, que es lo único que la aplicación aporta de más.
 */

export type EnrollResult = { error: string | null };

const uuid = z.string().uuid('Identificador inválido.');

/** Vía 1: curso gratuito y publicado. */
export async function selfEnroll(courseId: string, courseSlug: string): Promise<EnrollResult> {
  const session = await requirePortal();
  if (!uuid.safeParse(courseId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('enrollments')
    .insert({ course_id: courseId, student_id: session.userId, status: 'active' });

  if (error) {
    if (error.code === '23505') return { error: null }; // ya estaba matriculado
    if (error.code === '42501') {
      return {
        error:
          'Este curso no admite matrícula directa. Puedes solicitarla y la institución te responde.',
      };
    }
    return { error: `No se pudo completar la matrícula: ${error.message}` };
  }

  revalidatePath(`/cursos/${courseSlug}`);
  revalidatePath('/cursos');
  return { error: null };
}

/** Vía 2: solicitud, para cursos de pago o sin precio definido. */
export async function requestEnrollment(
  courseId: string,
  message: string,
  courseSlug: string,
): Promise<EnrollResult> {
  const session = await requirePortal();
  const parsed = z
    .object({ courseId: uuid, message: z.string().trim().max(1000, 'El mensaje es muy largo.') })
    .safeParse({ courseId, message });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };

  const supabase = await createClient();
  const { error } = await supabase.from('enrollment_requests').insert({
    course_id: parsed.data.courseId,
    student_id: session.userId,
    message: parsed.data.message.length > 0 ? parsed.data.message : null,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya tienes una solicitud pendiente para este curso.' };
    }
    if (error.code === '42501') {
      return { error: 'No puedes solicitar matrícula en este curso.' };
    }
    return { error: `No se pudo enviar la solicitud: ${error.message}` };
  }

  revalidatePath(`/cursos/${courseSlug}`);
  return { error: null };
}

export async function cancelRequest(requestId: string, courseSlug: string): Promise<EnrollResult> {
  await requirePortal();
  if (!uuid.safeParse(requestId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('enrollment_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .select('id');

  if (error) return { error: `No se pudo retirar la solicitud: ${error.message}` };
  if (data.length === 0) return { error: 'Esa solicitud ya no está pendiente.' };

  revalidatePath(`/cursos/${courseSlug}`);
  return { error: null };
}

/**
 * La institución resuelve. Aprobar va por la función de la base, que marca la
 * solicitud y crea la matrícula en una sola sentencia: hacerlo en dos desde acá
 * dejaría el estado a medias si la segunda falla.
 */
export async function approveRequest(requestId: string): Promise<EnrollResult> {
  await requireStaff();
  if (!uuid.safeParse(requestId).success) return { error: 'Identificador inválido.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_enrollment_request', { _request: requestId });

  if (error) {
    if (error.code === '42501') return { error: 'No tienes permiso para resolver esta solicitud.' };
    if (error.code === '23514') return { error: 'Esa solicitud ya estaba resuelta.' };
    return { error: error.message };
  }

  revalidatePath('/panel/solicitudes');
  return { error: null };
}

/** Rechazar exige motivo: la base lo obliga, y acá se dice antes de enviarlo. */
export async function rejectRequest(requestId: string, note: string): Promise<EnrollResult> {
  const session = await requireStaff();
  const parsed = z
    .object({
      requestId: uuid,
      note: z.string().trim().min(5, 'Escribe el motivo del rechazo: queda en el registro.'),
    })
    .safeParse({ requestId, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('enrollment_requests')
    .update({
      status: 'rejected',
      resolution_note: parsed.data.note,
      resolved_at: new Date().toISOString(),
      resolved_by: session.userId,
    })
    .eq('id', parsed.data.requestId)
    .select('id');

  if (error) return { error: `No se pudo rechazar: ${error.message}` };
  if (data.length === 0) return { error: 'Esa solicitud ya no está pendiente.' };

  revalidatePath('/panel/solicitudes');
  return { error: null };
}
