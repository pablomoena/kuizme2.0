'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { setCompleted } from '@/lib/courses/progress-actions';

/**
 * Marcar la lección como completada.
 *
 * Optimista, pero con el error visible: si la base lo rechaza —típicamente por
 * falta de matrícula— se dice, y la casilla vuelve a su estado real. Marcar algo
 * y que no se guarde en silencio es peor que no poder marcarlo.
 */
export function CompletarLeccion({
  lessonId,
  completed,
  courseSlug,
}: {
  lessonId: string;
  completed: boolean;
  courseSlug: string;
}) {
  const [optimista, aplicar] = useOptimistic(completed, (_a, v: boolean) => v);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={optimista}
          disabled={pendiente}
          onChange={(e) => {
            const valor = e.target.checked;
            setError(null);
            startTransition(async () => {
              aplicar(valor);
              const r = await setCompleted(lessonId, valor, courseSlug);
              if (r.error) setError(r.error);
            });
          }}
        />
        <span className="font-medium">
          {optimista ? 'Lección completada' : 'Marcar como completada'}
        </span>
      </label>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
