import type { StudentCourse } from '@/lib/courses/catalog';

function duracion(segundos: number | null): string | null {
  if (segundos === null || segundos <= 0) return null;
  const min = Math.round(segundos / 60);
  return min < 1 ? 'menos de 1 min' : `${min} min`;
}

/**
 * El temario que ve el alumno.
 *
 * Cada lección muestra su título siempre, y su contenido solo si llegó de la
 * base. Se usa `readable`, que es "la fila llegó", no una regla reimplementada
 * acá: si la interfaz decidiera por su cuenta quién puede leer qué, tendríamos
 * dos fuentes de verdad y una de ellas se equivocaría tarde o temprano.
 *
 * Las lecciones cerradas se muestran, no se esconden: enseñar el temario
 * completo es el punto de la página. Lo que no viaja al navegador es el cuerpo.
 */
export function Temario({ modules, enrolled }: { modules: StudentCourse['modules']; enrolled: boolean }) {
  if (modules.length === 0) {
    return <p className="text-ink-muted">Este curso todavía no tiene contenido publicado.</p>;
  }

  return (
    <ol className="flex flex-col gap-5">
      {modules.map((m, i) => (
        <li key={m.id} className="flex flex-col gap-2">
          <h3 className="font-medium">
            <span className="text-ink-muted">Módulo {i + 1} · </span>
            {m.title}
          </h3>
          {m.description ? <p className="text-sm text-ink-muted">{m.description}</p> : null}

          <ul className="flex flex-col gap-1.5">
            {m.lessons.map((l) => {
              const min = duracion(l.duration_seconds);
              return (
                <li key={l.id} className="rounded-md border border-line bg-surface">
                  {l.readable ? (
                    <details>
                      <summary className="cursor-pointer px-3 py-2 text-sm">
                        <span className="font-medium">{l.title}</span>
                        {l.is_preview && !enrolled ? (
                          <span className="ml-2 rounded-full border border-success/40 px-2 py-0.5 text-xs text-success">
                            Muestra gratis
                          </span>
                        ) : null}
                        {min ? <span className="ml-2 text-xs text-ink-muted">{min}</span> : null}
                      </summary>
                      <div className="border-t border-line px-3 py-3 text-sm whitespace-pre-wrap">
                        {l.body ?? <span className="text-ink-muted">Sin contenido todavía.</span>}
                      </div>
                    </details>
                  ) : (
                    <p className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="text-ink-muted">{l.title}</span>
                      {min ? <span className="text-xs text-ink-muted">{min}</span> : null}
                      {l.is_required ? null : (
                        <span className="text-xs text-ink-muted">opcional</span>
                      )}
                      <span className="ml-auto text-xs text-ink-muted">
                        Requiere matrícula
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
            {m.lessons.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-muted">Sin lecciones todavía.</li>
            ) : null}
          </ul>
        </li>
      ))}
    </ol>
  );
}
