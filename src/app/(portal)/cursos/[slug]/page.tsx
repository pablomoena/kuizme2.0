import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth/guard';
import { getCourseForStudent } from '@/lib/courses/catalog';
import { Temario } from '@/components/temario';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await requirePortal();
  const { slug } = await params;
  const { data } = await getCourseForStudent(session.organization.id, slug, session.userId);
  return { title: data?.title ?? 'Curso' };
}

export default async function CursoAlumnoPage({ params }: Props) {
  const session = await requirePortal();
  const { slug } = await params;
  const result = await getCourseForStudent(session.organization.id, slug, session.userId);

  // Un fallo de lectura no es un 404: lo toma error.tsx, que ofrece reintentar.
  if (result.error !== null) throw new Error(result.error);
  const course = result.data;
  if (!course) notFound();

  const lecciones = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const abiertas = course.modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.readable).length,
    0,
  );
  const muestras = course.modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.is_preview).length,
    0,
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/cursos" className="text-sm text-ink-muted hover:text-ink">
          ← Cursos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{course.title}</h1>
        {course.subtitle ? <p className="text-lg text-ink-muted">{course.subtitle}</p> : null}
        {course.description ? (
          <p className="max-w-prose whitespace-pre-wrap">{course.description}</p>
        ) : null}
      </header>

      {/* El estado se dice explícitamente en vez de dejarlo deducir del temario.
          Quien llega a esta página está decidiendo si le sirve el curso. */}
      {course.enrolled ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
          Estás matriculado en este curso.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-muted px-3 py-3 text-sm">
          <p>
            {muestras > 0
              ? `No estás matriculado. Puedes leer ${
                  muestras === 1 ? 'la lección de muestra' : `las ${muestras} lecciones de muestra`
                } y revisar el temario completo antes de decidir.`
              : 'No estás matriculado. Puedes revisar el temario completo antes de decidir.'}
          </p>
          {/* Sin botón de pago todavía: hoy la matrícula la hace la institución,
              y un botón que no cobra sería una promesa falsa. */}
          <p className="text-ink-muted">
            Las matrículas las gestiona {session.organization.name}.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h2 className="text-lg font-medium">Temario</h2>
          <p className="text-sm text-ink-muted">
            {course.modules.length} {course.modules.length === 1 ? 'módulo' : 'módulos'} ·{' '}
            {lecciones} {lecciones === 1 ? 'lección' : 'lecciones'}
            {!course.enrolled && abiertas > 0 ? ` · ${abiertas} abierta${abiertas === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        <Temario modules={course.modules} enrolled={course.enrolled} />
      </section>
    </div>
  );
}
