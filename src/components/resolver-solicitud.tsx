'use client';

import { useState, useTransition } from 'react';
import { approveRequest, rejectRequest } from '@/lib/courses/enroll-actions';

/**
 * Aprobar o rechazar una solicitud.
 *
 * Rechazar pide motivo antes de enviar, porque la base lo exige y porque decirlo
 * después de un error es peor experiencia. El motivo queda en el registro: una
 * decisión sobre una persona sin motivo registrado no se puede explicar más
 * tarde, ni a ella ni a quien la revise.
 */
export function ResolverSolicitud({ requestId }: { requestId: string }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function correr(accion: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {rechazando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => rejectRequest(requestId, motivo));
          }}
          className="flex flex-col gap-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Motivo del rechazo</span>
            <span className="text-xs text-ink-muted">
              Queda en el registro de la solicitud.
            </span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={5}
              autoFocus
              className="rounded-md border border-line bg-surface px-2.5 py-1.5"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pendiente ? 'Rechazando…' : 'Confirmar rechazo'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRechazando(false);
                setError(null);
              }}
              className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => approveRequest(requestId))}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-60"
          >
            {pendiente ? 'Aprobando…' : 'Aprobar y matricular'}
          </button>
          <button
            type="button"
            onClick={() => setRechazando(true)}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-muted"
          >
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}
