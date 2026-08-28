'use client';

import { useState, useTransition } from 'react';
import { setPreview } from '@/lib/courses/content-actions';

/**
 * Interruptor de "lección de muestra".
 *
 * Se explica lo que hace en la propia interfaz, porque abrir contenido es una
 * decisión de negocio y no una preferencia: quien la marca tiene que entender
 * que esa lección se leerá sin pagar, y que solo esa.
 */
export function MarcaMuestra({
  lessonId,
  isPreview,
  courseSlug,
}: {
  lessonId: string;
  isPreview: boolean;
  courseSlug: string;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={isPreview}
          disabled={pendiente}
          onChange={(e) => {
            const valor = e.target.checked;
            setError(null);
            startTransition(async () => {
              const r = await setPreview(lessonId, valor, courseSlug);
              if (r.error) setError(r.error);
            });
          }}
        />
        Muestra gratis
      </label>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
