import Link from 'next/link';
import type { StudentCourse } from '@/lib/courses/catalog';
import { explicarBloqueo } from '@/lib/courses/release';
import { agrupar } from '@/lib/courses/agrupar';

type Leccion = StudentCourse['modules'][number]['lessons'][number];

function duracion(segundos: number | null): string | null {
  if (segundos === null || segundos <= 0) return null;
  const min = Math.round(segundos / 60);
  return min < 1 ? 'menos de 1 min' : `${min} min`;
}

/**
 * El temario que ve el alumno.
 *
 * Las lecciones legibles enlazan al lector; las cerradas se muestran como texto
 * con el motivo. Se muestran igual: enseñar el temario completo es el punto de
 * la página, y lo que no viaja al navegador es el cuerpo.
 *
 * Cada lección muestra su título siempre, y su contenido solo si llegó de la
 * base. Se usa `readable`, que es "la fila llegó", no una regla reimplementada
 * acá: si la interfaz decidiera por su cuenta quién puede leer qué, tendríamos
 * dos fuentes de verdad y una de ellas se equivocaría tarde o temprano.
 *
 * Las secciones (D13) agrupan con el MISMO agrupar() que usa el editor, y ese
 * agrupar respeta el orden del módulo: la pantalla no puede quedar en un orden
 * distinto al que usa la puerta secuencial de la base. Un módulo sin secciones
 * —el caso normal— se ve exactamente como antes.
 */
export function Temario({
  modules,
  enrolled,
  courseSlug,
}: {
  modules: StudentCourse['modules'];
  enrolled: boolean;
  courseSlug: string;
}) {
  if (modules.length === 0) {
    return <p className="text-ink-muted">Este curso todavía no tiene contenido publicado.</p>;
  }

  return (
    <ol className="flex flex-col gap-5">
      {modules.map((m, i) => {
        const grupos = agrupar(m.lessons, m.sections);

        return (
          <li key={m.id} className="flex flex-col gap-2">
            <h3 className="font-medium">
              <span className="text-ink-muted">Módulo {i + 1} · </span>
              {m.title}
            </h3>
            {m.description ? <p className="text-sm text-ink-muted">{m.description}</p> : null}

            {m.lessons.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-muted">Sin lecciones todavía.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {grupos.map((g) =>
                  g.tipo === 'suelta' ? (
                    <ul key={g.leccion.id} className="flex flex-col gap-1.5">
                      <Fila
                        leccion={g.leccion}
                        enrolled={enrolled}
                        courseSlug={courseSlug}
                      />
                    </ul>
                  ) : (
                    // La clave lleva la primera lección y no solo el id de la
                    // sección: una sección con lecciones no contiguas produce dos
                    // grupos, y con la clave repetida React los confundiría.
                    <div
                      key={`${g.seccion.id}-${g.lecciones[0]?.id ?? ''}`}
                      className="flex flex-col gap-1.5"
                    >
                      <h4 className="text-sm font-medium text-ink-muted">{g.seccion.title}</h4>
                      <ul className="flex flex-col gap-1.5">
                        {g.lecciones.map((l) => (
                          <Fila
                            key={l.id}
                            leccion={l}
                            enrolled={enrolled}
                            courseSlug={courseSlug}
                          />
                        ))}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Fila({
  leccion: l,
  enrolled,
  courseSlug,
}: {
  leccion: Leccion;
  enrolled: boolean;
  courseSlug: string;
}) {
  const min = duracion(l.duration_seconds);

  return (
    <li className="rounded-md border border-line bg-surface">
      {l.readable ? (
        <Link
          href={`/cursos/${courseSlug}/${l.id}`}
          className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
        >
          <span className="font-medium">{l.title}</span>
          {l.is_preview && !enrolled ? (
            <span className="rounded-full border border-success/40 px-2 py-0.5 text-xs text-success">
              Muestra gratis
            </span>
          ) : null}
          {min ? <span className="text-xs text-ink-muted">{min}</span> : null}
          {l.completed ? <span className="ml-auto text-xs text-success">Completada</span> : null}
        </Link>
      ) : (
        <p className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="text-ink-muted">{l.title}</span>
          {min ? <span className="text-xs text-ink-muted">{min}</span> : null}
          {l.is_required ? null : <span className="text-xs text-ink-muted">opcional</span>}
          {/* El motivo concreto: una fecha, un plazo, o qué hacer. Y si lo que
              falta es que abra el módulo, lo dice — esperar una lección que ya
              tiene su fecha cumplida es esperar la cosa equivocada. */}
          <span className="ml-auto text-xs text-ink-muted">
            {explicarBloqueo(l.reason, l.opensAt ? new Date(l.opensAt) : null)}
          </span>
        </p>
      )}
    </li>
  );
}
