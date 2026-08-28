import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { QueryResult } from './queries';

/**
 * Las solicitudes de matrícula que ve la institución.
 *
 * No se filtra por organización como medida de seguridad —eso lo hace RLS— sino
 * porque el índice (organization_id, status, created_at) hace la consulta directa.
 */

export type SolicitudPendiente = {
  id: string;
  createdAt: string;
  message: string | null;
  courseTitle: string;
  courseSlug: string;
  studentEmail: string | null;
  studentName: string | null;
};

export async function listPendingRequests(
  organizationId: string,
): Promise<QueryResult<SolicitudPendiente[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollment_requests')
    .select('id, created_at, message, student_id, courses(title, slug)')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return { data: null, error: error.message };

  // Los perfiles van en una consulta aparte: student_id apunta a auth.users, no
  // a profiles, así que no hay relación que PostgREST pueda embeber. El tipo
  // generado lo detectó al compilar en vez de fallar en tiempo de ejecución.
  const ids = [...new Set(data.map((r) => r.student_id))];
  const perfiles = ids.length
    ? await supabase.from('profiles').select('id, first_name, last_name').in('id', ids)
    : { data: [], error: null };

  if (perfiles.error) return { data: null, error: perfiles.error.message };
  const nombres = new Map(
    perfiles.data.map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null,
    ]),
  );

  return {
    data: data.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      message: r.message,
      courseTitle: r.courses?.title ?? 'Curso',
      courseSlug: r.courses?.slug ?? '',
      // El correo vive en auth.users y no se expone a roles de usuario. Se
      // muestra el nombre del perfil, que sí es alcanzable por el staff.
      studentEmail: null,
      studentName: nombres.get(r.student_id) ?? null,
    })),
    error: null,
  };
}
