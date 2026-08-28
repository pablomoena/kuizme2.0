import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePortal } from '@/lib/auth/guard';
import { listCatalog, type CatalogItem } from '@/lib/courses/catalog';

export const metadata: Metadata = { title: 'Cursos' };

export default async function CatalogoPage() {
  const session = await requirePortal();
  const result = await listCatalog(session.organization.id, session.userId);

  if (result.error !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Cursos</h1>
        <p className="text-danger">No pudimos cargar los cursos.</p>
        <p className="text-sm text-ink-muted">{result.error}</p>
      </div>
    );
  }

  const cursos = result.data;
  const mios = cursos.filter((c) => c.enrolled);
  const otros = cursos.filter((c) => !c.enrolled);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Cursos</h1>

      {cursos.length === 0 ? (
        <p className="text-ink-muted">
          Todavía no hay cursos publicados en {session.organization.name}.
        </p>
      ) : null}

      {mios.length > 0 ? <Seccion titulo="Mis cursos" cursos={mios} /> : null}
      {otros.length > 0 ? (
        <Seccion
          titulo={mios.length > 0 ? 'Otros cursos' : 'Disponibles'}
          cursos={otros}
        />
      ) : null}
    </div>
  );
}

function Seccion({ titulo, cursos }: { titulo: string; cursos: CatalogItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">{titulo}</h2>
      <ul className="flex flex-col gap-2">
        {cursos.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cursos/${c.slug}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 hover:border-brand"
            >
              <span className="font-medium">{c.title}</span>
              {c.subtitle ? (
                <span className="text-sm text-ink-muted">{c.subtitle}</span>
              ) : null}
              <span className="ml-auto text-sm text-ink-muted">
                {c.enrolled && c.progress && c.progress.total > 0
                  ? `${c.progress.completed} de ${c.progress.total} · ${c.progress.percent}%`
                  : `${c.lessonCount} ${c.lessonCount === 1 ? 'lección' : 'lecciones'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
