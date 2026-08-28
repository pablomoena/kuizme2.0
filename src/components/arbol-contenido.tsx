'use client';

import { Ordenador } from './ordenador';
import { FilaEditable } from './fila-editable';
import { AgregarInline } from './agregar-inline';
import { MarcaMuestra } from './marca-muestra';
import { AperturaLeccion } from './apertura-leccion';
import { AperturaModulo } from './apertura-modulo';
import { AsignarSeccion } from './asignar-seccion';
import type { ReleaseMode } from '@/lib/courses/release';
import { seccionesContiguas } from '@/lib/courses/agrupar';
import {
  createLesson,
  createModule,
  createSection,
  deleteItem,
  renameItem,
  reorder,
} from '@/lib/courses/content-actions';
import type { CourseDetail } from '@/lib/courses/queries';

type Modulo = CourseDetail['modules'][number];

/**
 * El árbol de contenido del curso: módulos, secciones y lecciones, todo editable.
 *
 * Se compone de piezas pequeñas —Ordenador, FilaEditable, AgregarInline— en vez
 * de ser un componente único. En la v1 el editor de curso era un archivo de más
 * de mil líneas donde el arrastre, el guardado y el estado del formulario
 * estaban entrelazados, y no se podía cambiar una cosa sin romper otra.
 *
 * Las secciones (D13) agrupan; NO reordenan. El módulo tiene una sola secuencia
 * de lecciones y es la que gobierna el avance, así que el Ordenador de lecciones
 * sigue siendo uno por módulo. Si hubiera un ordenador por sección habría dos
 * ordenamientos y uno de los dos mentiría — y el que mentiría sería el de la
 * pantalla, porque el bloqueo secuencial usa el del módulo.
 */
export function ArbolContenido({
  courseId,
  courseSlug,
  modules,
  releaseMode,
}: {
  courseId: string;
  courseSlug: string;
  modules: CourseDetail['modules'];
  releaseMode: ReleaseMode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {modules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-ink-muted">
          Este curso todavía no tiene módulos. Añade el primero abajo.
        </p>
      ) : (
        <Ordenador
          items={modules}
          etiqueta="módulo"
          onReorder={(ids) => reorder('modules', courseId, ids, courseSlug)}
        >
          {(modulo, i) => (
            <div className="flex flex-col gap-3">
              <FilaEditable
                title={`${i + 1}. ${modulo.title}`}
                subtitulo={resumenModulo(modulo)}
                advertenciaBorrado={advertenciaModulo(modulo)}
                onRename={(nuevo) => renameItem('modules', modulo.id, nuevo, courseSlug)}
                onDelete={() => deleteItem('modules', modulo.id, courseSlug)}
              />

              <AperturaModulo
                moduleId={modulo.id}
                courseSlug={courseSlug}
                releaseMode={releaseMode}
                unlockAt={modulo.unlock_at}
                unlockAfterDays={modulo.unlock_after_days}
                leccionesConFecha={
                  modulo.lessons.filter(
                    (l) => l.unlock_at !== null || l.unlock_after_days !== null,
                  ).length
                }
              />

              <div className="flex flex-col gap-2 border-l border-line pl-4">
                <AvisoEntrelazado modulo={modulo} />

                {modulo.lessons.length > 0 ? (
                  <Ordenador
                    items={modulo.lessons}
                    etiqueta="lección"
                    onReorder={(ids) => reorder('lessons', modulo.id, ids, courseSlug)}
                  >
                    {(leccion) => (
                      <div className="flex flex-col gap-1">
                        <FilaEditable
                          title={leccion.title}
                          subtitulo={leccion.is_required ? undefined : 'opcional'}
                          advertenciaBorrado={`Se borrará la lección "${leccion.title}".`}
                          onRename={(nuevo) => renameItem('lessons', leccion.id, nuevo, courseSlug)}
                          onDelete={() => deleteItem('lessons', leccion.id, courseSlug)}
                        />
                        <AsignarSeccion
                          lessonId={leccion.id}
                          courseSlug={courseSlug}
                          sectionId={leccion.section_id}
                          secciones={modulo.sections}
                        />
                        <MarcaMuestra
                          lessonId={leccion.id}
                          isPreview={leccion.is_preview}
                          courseSlug={courseSlug}
                        />
                        <AperturaLeccion
                          lessonId={leccion.id}
                          courseSlug={courseSlug}
                          releaseMode={releaseMode}
                          unlockAt={leccion.unlock_at}
                          unlockAfterDays={leccion.unlock_after_days}
                        />
                      </div>
                    )}
                  </Ordenador>
                ) : null}

                <AgregarInline
                  action={createLesson}
                  campos={{ moduleId: modulo.id, courseSlug }}
                  etiqueta="Añadir lección"
                  placeholder="Título de la lección"
                />

                <SeccionesDelModulo modulo={modulo} courseSlug={courseSlug} />
              </div>
            </div>
          )}
        </Ordenador>
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        <AgregarInline
          action={createModule}
          campos={{ courseId, courseSlug }}
          etiqueta="Añadir módulo"
          placeholder="Título del módulo"
        />
      </div>
    </div>
  );
}

/**
 * Aviso cuando las lecciones de una sección no están juntas.
 *
 * No es un error de datos: el orden del módulo sigue siendo válido y la base lo
 * permite. Pero la sección se ve DOS veces en el temario, porque la pantalla
 * sigue el orden del módulo y no reagrupa. Se avisa acá, donde se arregla —
 * subiendo o bajando las lecciones hasta que queden seguidas— en vez de esconder
 * el síntoma reordenando la pantalla, que era la forma de tener dos órdenes.
 */
function AvisoEntrelazado({ modulo }: { modulo: Modulo }) {
  if (modulo.sections.length === 0 || seccionesContiguas(modulo.lessons)) return null;

  return (
    <p
      role="status"
      className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs"
    >
      Las lecciones de una sección no están seguidas, así que esa sección se verá más de una
      vez en el temario. Súbelas o bájalas hasta que queden juntas.
    </p>
  );
}

/**
 * Las secciones del módulo, para nombrarlas, ordenarlas y borrarlas.
 *
 * Va debajo de las lecciones y no encima: la lista de lecciones es lo que el
 * docente edita a diario, y las secciones se tocan una vez al armar el curso.
 *
 * Borrar una sección NO borra sus lecciones —la clave es `on delete set null`—
 * y la advertencia lo dice, porque lo contrario es lo que uno teme al pulsar.
 */
function SeccionesDelModulo({
  modulo,
  courseSlug,
}: {
  modulo: Modulo;
  courseSlug: string;
}) {
  return (
    <details className="rounded-md border border-line" open={modulo.sections.length > 0}>
      <summary className="cursor-pointer px-3 py-2 text-sm text-ink-muted">
        Secciones{modulo.sections.length > 0 ? ` (${modulo.sections.length})` : ''}
      </summary>

      <div className="flex flex-col gap-2 border-t border-line p-3">
        <p className="text-xs text-ink-muted">
          Agrupan las lecciones del módulo para mostrarlas. No cambian el orden en que se
          avanza ni cuándo se abre cada una: eso es el orden del módulo y su fecha. Cada
          sección se ve donde están sus lecciones, así que el orden de esta lista solo afecta
          a la lista de aquí y al desplegable de cada lección.
        </p>

        {modulo.sections.length > 0 ? (
          <Ordenador
            items={modulo.sections}
            etiqueta="sección"
            onReorder={(ids) => reorder('sections', modulo.id, ids, courseSlug)}
          >
            {(seccion) => {
              const dentro = modulo.lessons.filter((l) => l.section_id === seccion.id);
              return (
                <FilaEditable
                  title={seccion.title}
                  subtitulo={
                    dentro.length === 0
                      ? 'sin lecciones'
                      : dentro.length === 1
                        ? '1 lección'
                        : `${dentro.length} lecciones`
                  }
                  advertenciaBorrado={
                    dentro.length === 0
                      ? `Se borrará la sección "${seccion.title}".`
                      : `Se borrará la sección "${seccion.title}". Sus ${dentro.length} ${
                          dentro.length === 1 ? 'lección' : 'lecciones'
                        } NO se borran: vuelven a colgar del módulo.`
                  }
                  onRename={(nuevo) => renameItem('sections', seccion.id, nuevo, courseSlug)}
                  onDelete={() => deleteItem('sections', seccion.id, courseSlug)}
                />
              );
            }}
          </Ordenador>
        ) : null}

        <AgregarInline
          action={createSection}
          campos={{ moduleId: modulo.id, courseSlug }}
          etiqueta="Añadir sección"
          placeholder="Título de la sección"
        />
      </div>
    </details>
  );
}

function resumenModulo(modulo: Modulo): string {
  const lecciones =
    modulo.lessons.length === 1 ? '1 lección' : `${modulo.lessons.length} lecciones`;
  if (modulo.sections.length === 0) return lecciones;
  const secciones =
    modulo.sections.length === 1 ? '1 sección' : `${modulo.sections.length} secciones`;
  return `${lecciones} en ${secciones}`;
}

/**
 * Borrar un módulo sí se lleva sus lecciones por cascada, y también sus
 * secciones. La advertencia cuenta las dos cosas: en la v1 el botón no advertía
 * nada.
 */
function advertenciaModulo(modulo: Modulo): string {
  const partes: string[] = [];
  if (modulo.lessons.length > 0) {
    partes.push(
      `${modulo.lessons.length} ${modulo.lessons.length === 1 ? 'lección' : 'lecciones'}`,
    );
  }
  if (modulo.sections.length > 0) {
    partes.push(
      `${modulo.sections.length} ${modulo.sections.length === 1 ? 'sección' : 'secciones'}`,
    );
  }

  if (partes.length === 0) return `Se borrará el módulo "${modulo.title}".`;
  return `Se borrará "${modulo.title}" y ${partes.join(' y ')}. No se puede deshacer.`;
}
