'use client';

import { useState, useTransition } from 'react';
import { setLessonUnlock } from '@/lib/courses/content-actions';
import type { ReleaseMode } from '@/lib/courses/release';

/**
 * Cuándo se abre esta lección. Solo aparece el campo que el modo del curso usa:
 * mostrar una fecha en un curso que libera por días sería ofrecer un ajuste que
 * no hace nada, y eso es peor que no ofrecerlo.
 */
export function AperturaLeccion({
  lessonId,
  courseSlug,
  releaseMode,
  unlockAt,
  unlockAfterDays,
}: {
  lessonId: string;
  courseSlug: string;
  releaseMode: ReleaseMode;
  unlockAt: string | null;
  unlockAfterDays: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (releaseMode === 'immediate') return null;

  function guardar(campo: 'unlock_at' | 'unlock_after_days', valor: string) {
    setError(null);
    startTransition(async () => {
      const r = await setLessonUnlock(lessonId, campo, valor === '' ? null : valor, courseSlug);
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {releaseMode === 'scheduled' ? (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Se abre el
          <input
            type="datetime-local"
            defaultValue={unlockAt ? unlockAt.slice(0, 16) : ''}
            disabled={pendiente}
            onBlur={(e) => guardar('unlock_at', e.target.value)}
            className="rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <span>(en blanco = abierta desde el inicio)</span>
        </label>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Se abre
          <input
            type="number"
            min={0}
            step={1}
            defaultValue={unlockAfterDays ?? ''}
            disabled={pendiente}
            onBlur={(e) => guardar('unlock_after_days', e.target.value)}
            className="w-20 rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          días después de la matrícula
          <span>(en blanco = abierta desde el inicio)</span>
        </label>
      )}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
