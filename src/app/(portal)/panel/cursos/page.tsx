import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/guard';
import { currentTarget } from '@/lib/tenant/context';
import { listCourses } from '@/lib/courses/queries';
import { NuevoCurso } from './nuevo-curso';
import { EstadoCurso } from '@/components/estado-curso';

export const metadata: Metadata = { title: 'Cursos' };

export default async function CursosPage() {
  const session = await requireStaff();
  // Sin desestructurar: el resultado es una unión discriminada y desarmarla en
  // dos variables pierde la relación entre `error` y `data`.
  const [result, target] = await Promise.all([
    listCourses(session.organization.id),
    currentTarget(),
  ]);

  // Un fallo de lectura no se muestra como lista vacía: son cosas distintas y
  // confundirlas hace que el usuario crea que perdió su contenido.
  if (result.error !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Cursos</h1>
        <p className="text-danger">No pudimos cargar los cursos.</p>
        <p className="text-sm text-ink-muted">{result.error}</p>
      </div>
    );
  }

  const courses = result.data;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cursos</h1>
        <p className="text-ink-muted">
          {courses.length === 0
            ? 'Todavía no hay cursos en esta institución.'
            : `${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'}.`}
        </p>
      </header>

      {courses.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {courses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/panel/cursos/${c.slug}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface px-4 py-3 hover:border-brand"
              >
                <span className="font-medium">{c.title}</span>
                <EstadoCurso status={c.status} visibility={c.visibility} />
                <span className="ml-auto text-sm text-ink-muted">
                  {c.moduleCount} {c.moduleCount === 1 ? 'módulo' : 'módulos'} ·{' '}
                  {c.lessonCount} {c.lessonCount === 1 ? 'lección' : 'lecciones'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <NuevoCurso portalSlug={target.kind === 'tenant' ? target.slug : null} />
    </div>
  );
}
