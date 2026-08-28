'use client';

import { Ordenador } from './ordenador';
import { FilaEditable } from './fila-editable';
import { AgregarInline } from './agregar-inline';
import {
  createLesson,
  createModule,
  deleteItem,
  renameItem,
  reorder,
} from '@/lib/courses/content-actions';
import type { CourseDetail } from '@/lib/courses/queries';

/**
 * El árbol de contenido del curso: módulos con sus lecciones, todo editable.
 *
 * Se compone de piezas pequeñas —Ordenador, FilaEditable, AgregarInline— en vez
 * de ser un componente único. En la v1 el editor de curso era un archivo de más
 * de mil líneas donde el arrastre, el guardado y el estado del formulario
 * estaban entrelazados, y no se podía cambiar una cosa sin romper otra.
 */
export function ArbolContenido({
  courseId,
  courseSlug,
  modules,
}: {
  courseId: string;
  courseSlug: string;
  modules: CourseDetail['modules'];
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
                subtitulo={
                  modulo.lessons.length === 1
                    ? '1 lección'
                    : `${modulo.lessons.length} lecciones`
                }
                advertenciaBorrado={
                  modulo.lessons.length === 0
                    ? `Se borrará el módulo "${modulo.title}".`
                    : `Se borrará "${modulo.title}" y sus ${modulo.lessons.length} ${
                        modulo.lessons.length === 1 ? 'lección' : 'lecciones'
                      }. No se puede deshacer.`
                }
                onRename={(nuevo) => renameItem('modules', modulo.id, nuevo, courseSlug)}
                onDelete={() => deleteItem('modules', modulo.id, courseSlug)}
              />

              <div className="flex flex-col gap-2 border-l border-line pl-4">
                {modulo.lessons.length > 0 ? (
                  <Ordenador
                    items={modulo.lessons}
                    etiqueta="lección"
                    onReorder={(ids) => reorder('lessons', modulo.id, ids, courseSlug)}
                  >
                    {(leccion) => (
                      <FilaEditable
                        title={leccion.title}
                        subtitulo={leccion.is_required ? undefined : 'opcional'}
                        advertenciaBorrado={`Se borrará la lección "${leccion.title}".`}
                        onRename={(nuevo) => renameItem('lessons', leccion.id, nuevo, courseSlug)}
                        onDelete={() => deleteItem('lessons', leccion.id, courseSlug)}
                      />
                    )}
                  </Ordenador>
                ) : null}

                <AgregarInline
                  action={createLesson}
                  campos={{ moduleId: modulo.id, courseSlug }}
                  etiqueta="Añadir lección"
                  placeholder="Título de la lección"
                />
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
