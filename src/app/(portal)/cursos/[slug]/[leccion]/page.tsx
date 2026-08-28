import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth/guard';
import { getReaderView } from '@/lib/courses/reader';
import { Progreso } from '@/components/progreso';
import { CompletarLeccion } from '@/components/completar-leccion';

type Props = { params: Promise<{ slug: string; leccion: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await requirePortal();
  const { slug, leccion } = await params;
  const { data } = await getReaderView(session.organization.id, slug, leccion, session.userId);
  return { title: data?.lesson.title ?? 'Lección' };
}

export default async function LectorPage({ params }: Props) {
  const session = await requirePortal();
  const { slug, leccion } = await params;
  const result = await getReaderView(session.organization.id, slug, leccion, session.userId);

  if (result.error !== null) throw new Error(result.error);
  const vista = result.data;
  if (!vista) notFound();

  const { course, lesson, prev, next, position, progress, enrolled } = vista;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link href={`/cursos/${course.slug}`} className="text-sm text-ink-muted hover:text-ink">
          ← {course.title}
        </Link>
        <Progreso progress={progress} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">
            Lección {position.index} de {position.total}
            {lesson.isRequired ? '' : ' · opcional'}
            {lesson.isPreview && !enrolled ? ' · muestra gratis' : ''}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{lesson.title}</h1>
        </div>
      </header>

      {lesson.readable ? (
        <div className="max-w-prose whitespace-pre-wrap">
          {lesson.body ?? (
            <p className="text-ink-muted">Esta lección todavía no tiene contenido.</p>
          )}
        </div>
      ) : (
        /* No es un 404: la lección existe y el alumno la ve en el temario. Lo que
           falta es la matrícula, y decirlo así es lo único útil acá. */
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-muted px-4 py-4">
          <p className="font-medium">Esta lección requiere matrícula</p>
          <p className="text-sm text-ink-muted">
            Las matrículas las gestiona {session.organization.name}. Puedes seguir revisando el
            temario y las lecciones de muestra.
          </p>
          <Link
            href={`/cursos/${course.slug}`}
            className="self-start text-sm font-medium text-brand hover:underline"
          >
            Volver al temario
          </Link>
        </div>
      )}

      {/* Solo se ofrece marcar avance donde hay avance que registrar. */}
      {lesson.readable && enrolled ? (
        <CompletarLeccion
          lessonId={lesson.id}
          completed={lesson.completed}
          courseSlug={course.slug}
        />
      ) : null}

      <nav aria-label="Navegación de lecciones" className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
        {prev ? (
          <Link
            href={`/cursos/${course.slug}/${prev.id}`}
            className="max-w-[45%] rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-muted"
          >
            <span className="block text-xs text-ink-muted">Anterior</span>
            <span className="line-clamp-1">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/cursos/${course.slug}/${next.id}`}
            className="ml-auto max-w-[45%] rounded-md border border-line px-3 py-2 text-right text-sm hover:bg-surface-muted"
          >
            <span className="block text-xs text-ink-muted">Siguiente</span>
            <span className="line-clamp-1">{next.title}</span>
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
