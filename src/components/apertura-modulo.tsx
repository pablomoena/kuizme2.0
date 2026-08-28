'use client';

import { useState, useTransition } from 'react';
import { setModuleUnlock } from '@/lib/courses/content-actions';
import type { ReleaseMode } from '@/lib/courses/release';

/**
 * Cuándo se abre el MÓDULO completo (D13).
 *
 * Es el ajuste que faltaba: abrir "la semana 3" eran ocho fechas de lección, y
 * ocho sitios donde equivocarse. Acá es una.
 *
 * Dice explícitamente que es un suelo, porque es la parte que se malinterpreta:
 * poner una fecha acá no libera las lecciones que tengan la suya más adelante, y
 * tampoco las retiene si el módulo ya abrió.
 */
export function AperturaModulo({
  moduleId,
  courseSlug,
  releaseMode,
  unlockAt,
  unlockAfterDays,
  leccionesConFecha,
}: {
  moduleId: string;
  courseSlug: string;
  releaseMode: ReleaseMode;
  unlockAt: string | null;
  unlockAfterDays: number | null;
  /** Cuántas lecciones del módulo tienen su propia fecha o plazo. */
  leccionesConFecha: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (releaseMode === 'immediate') return null;

  function guardar(campo: 'unlock_at' | 'unlock_after_days', valor: string) {
    setError(null);
    startTransition(async () => {
      const r = await setModuleUnlock(moduleId, campo, valor === '' ? null : valor, courseSlug);
      if (r.error) setError(r.error);
    });
  }

  const puesto = releaseMode === 'scheduled' ? unlockAt !== null : unlockAfterDays !== null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-muted px-3 py-2">
      {releaseMode === 'scheduled' ? (
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">El módulo se abre el</span>
          <input
            type="datetime-local"
            defaultValue={unlockAt ? unlockAt.slice(0, 16) : ''}
            disabled={pendiente}
            onBlur={(e) => guardar('unlock_at', e.target.value)}
            className="rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <span className="text-ink-muted">(en blanco = abierto desde el inicio)</span>
        </label>
      ) : (
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">El módulo se abre</span>
          <input
            type="number"
            min={0}
            step={1}
            defaultValue={unlockAfterDays ?? ''}
            disabled={pendiente}
            onBlur={(e) => guardar('unlock_after_days', e.target.value)}
            className="w-20 rounded border border-line bg-surface px-2 py-1 text-xs"
          />
          <span>días después de la matrícula</span>
          <span className="text-ink-muted">(en blanco = abierto desde el inicio)</span>
        </label>
      )}

      {puesto ? (
        <p className="text-xs text-ink-muted">
          Ninguna lección de este módulo se abre antes de esa fecha, aunque tenga la suya
          puesta más atrás.
          {leccionesConFecha > 0
            ? ` ${leccionesConFecha} ${
                leccionesConFecha === 1 ? 'lección tiene' : 'lecciones tienen'
              } además su propio plazo, y se abren cuando llegue el más tardío de los dos.`
            : ''}
        </p>
      ) : null}

      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
