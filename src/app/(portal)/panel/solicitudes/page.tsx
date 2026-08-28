import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/guard';
import { listPendingRequests } from '@/lib/courses/requests';
import { ResolverSolicitud } from '@/components/resolver-solicitud';

export const metadata: Metadata = { title: 'Solicitudes de matrícula' };

const FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function SolicitudesPage() {
  const session = await requireStaff();
  const result = await listPendingRequests(session.organization.id);

  if (result.error !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Solicitudes de matrícula</h1>
        <p className="text-danger">No pudimos cargar las solicitudes.</p>
        <p className="text-sm text-ink-muted">{result.error}</p>
      </div>
    );
  }

  const solicitudes = result.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Solicitudes de matrícula</h1>
        <p className="text-ink-muted">
          {solicitudes.length === 0
            ? 'No hay solicitudes pendientes.'
            : `${solicitudes.length} ${solicitudes.length === 1 ? 'pendiente' : 'pendientes'}, de la más antigua a la más reciente.`}
        </p>
      </header>

      {solicitudes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {solicitudes.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{s.studentName ?? 'Alumno sin nombre en su perfil'}</span>
                <span className="text-sm text-ink-muted">quiere entrar a</span>
                <Link
                  href={`/panel/cursos/${s.courseSlug}`}
                  className="text-sm font-medium hover:underline"
                >
                  {s.courseTitle}
                </Link>
                <span className="ml-auto text-xs text-ink-muted">
                  {FECHA.format(new Date(s.createdAt))}
                </span>
              </div>

              {s.message ? (
                <p className="border-l-2 border-line pl-3 text-sm whitespace-pre-wrap">
                  {s.message}
                </p>
              ) : null}

              <ResolverSolicitud requestId={s.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
