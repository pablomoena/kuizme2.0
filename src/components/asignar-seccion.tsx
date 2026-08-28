'use client';

import { useState, useTransition } from 'react';
import { setLessonSection } from '@/lib/courses/content-actions';

/**
 * A qué sección pertenece esta lección (D13).
 *
 * Un <select>, no arrastre: mover entre grupos arrastrando es la parte del
 * editor de la v1 que tiene su propia aritmética y su propio conjunto de
 * errores, y aquí el objetivo es asignar, no ordenar. El orden de la lección
 * dentro del módulo lo sigue llevando el Ordenador, con teclado y arrastre.
 *
 * Solo aparece si el módulo tiene secciones: ofrecer "sin sección" como única
 * opción sería un control que no hace nada.
 */
export function AsignarSeccion({
  lessonId,
  courseSlug,
  sectionId,
  secciones,
}: {
  lessonId: string;
  courseSlug: string;
  sectionId: string | null;
  secciones: { id: string; title: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (secciones.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        Sección
        <select
          defaultValue={sectionId ?? ''}
          disabled={pendiente}
          onChange={(e) => {
            const valor = e.target.value;
            setError(null);
            startTransition(async () => {
              const r = await setLessonSection(lessonId, valor === '' ? null : valor, courseSlug);
              if (r.error) setError(r.error);
            });
          }}
          className="rounded border border-line bg-surface px-2 py-1 text-xs"
        >
          <option value="">Sin sección</option>
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
