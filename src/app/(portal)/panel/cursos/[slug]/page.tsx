import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth/guard';
import { getCourse } from '@/lib/courses/queries';
import { EstadoCurso } from '@/components/estado-curso';
import { ArbolContenido } from '@/components/arbol-contenido';
import { EntregaCurso } from '@/components/entrega-curso';
import { InscripcionCurso } from '@/components/inscripcion-curso';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await requireStaff();
  const { slug } = await params;
  const { data } = await getCourse(session.organization.id, slug);
  return { title: data?.title ?? 'Curso' };
}

export default async function CursoPage({ params }: Props) {
  const session = await requireStaff();
  const { slug } = await params;
  const result = await getCourse(session.organization.id, slug);

  if (result.error !== null) {
    // Se lanza para que lo tome error.tsx, que ofrece reintentar. Un fallo de
    // lectura no es un 404: el curso puede existir perfectamente.
    throw new Error(result.error);
  }
  const course = result.data;
  if (!course) notFound();

  const lecciones = course.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/panel/cursos" className="text-sm text-ink-muted hover:text-ink">
          ← Cursos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{course.title}</h1>
        {course.subtitle ? <p className="text-ink-muted">{course.subtitle}</p> : null}
        <EstadoCurso status={course.status} visibility={course.visibility} />
      </header>

      <InscripcionCurso
        courseId={course.id}
        courseSlug={course.slug}
        enrollmentOpen={course.enrollment_open}
        enrollmentDeadline={course.enrollment_deadline}
        maxStudents={course.max_students}
        activos={course.activeEnrollments}
      />

      <EntregaCurso
        courseId={course.id}
        courseSlug={course.slug}
        releaseMode={course.release_mode}
        sequential={course.sequential}
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Contenido</h2>
        <p className="text-sm text-ink-muted">
          {course.modules.length} {course.modules.length === 1 ? 'módulo' : 'módulos'} ·{' '}
          {lecciones} {lecciones === 1 ? 'lección' : 'lecciones'}
        </p>

        <ArbolContenido
          courseId={course.id}
          courseSlug={course.slug}
          modules={course.modules}
          releaseMode={course.release_mode}
        />
      </section>
    </div>
  );
}
