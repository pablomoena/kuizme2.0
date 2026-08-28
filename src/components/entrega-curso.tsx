'use client';

import { useState, useTransition } from 'react';
import { setRelease } from '@/lib/courses/content-actions';
import { MODOS, type ReleaseMode } from '@/lib/courses/release';

/**
 * Cómo se entrega este curso. Cada modo lleva su explicación en pantalla: quien
 * crea un curso decide esto una vez y no debería tener que adivinar qué hace
 * "relative".
 */
export function EntregaCurso({
  courseId,
  courseSlug,
  releaseMode,
  sequential,
}: {
  courseId: string;
  courseSlug: string;
  releaseMode: ReleaseMode;
  sequential: boolean;
}) {
  const [modo, setModo] = useState<ReleaseMode>(releaseMode);
  const [orden, setOrden] = useState(sequential);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function guardar(nuevoModo: ReleaseMode, nuevoOrden: boolean) {
    setModo(nuevoModo);
    setOrden(nuevoOrden);
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const r = await setRelease(courseId, nuevoModo, nuevoOrden, courseSlug);
      if (r.error) setError(r.error);
      else setGuardado(true);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-medium">Cómo se entrega</h2>
        {pendiente ? <span className="text-xs text-ink-muted">Guardando…</span> : null}
        {guardado && !pendiente ? (
          <span className="text-xs text-success">Guardado</span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">Modo de entrega</legend>
        {MODOS.map((m) => (
          <label key={m.valor} className="flex gap-2.5">
            <input
              type="radio"
              name="release_mode"
              value={m.valor}
              checked={modo === m.valor}
              disabled={pendiente}
              onChange={() => guardar(m.valor, orden)}
              className="mt-1 shrink-0"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{m.titulo}</span>
              <span className="text-sm text-ink-muted">{m.detalle}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex gap-2.5 border-t border-line pt-3">
        <input
          type="checkbox"
          checked={orden}
          disabled={pendiente}
          onChange={(e) => guardar(modo, e.target.checked)}
          className="mt-1 shrink-0"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Además, en orden</span>
          <span className="text-sm text-ink-muted">
            No se abre una lección mientras quede alguna obligatoria anterior sin completar. Se
            combina con cualquiera de los modos de arriba.
          </span>
        </span>
      </label>
    </section>
  );
}
