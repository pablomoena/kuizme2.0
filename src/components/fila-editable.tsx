'use client';

import { useState, useTransition } from 'react';

/**
 * Título con renombrar y borrar. Una pieza pequeña porque se usa para módulos y
 * para lecciones, y porque así se puede razonar sobre su comportamiento: el
 * estado es "viendo" o "editando", y el borrado pide confirmación explícita.
 *
 * Borrar un módulo se lleva sus lecciones por cascada, así que la confirmación
 * dice cuántas. En la v1 el botón de borrar no advertía nada.
 */
export function FilaEditable({
  title,
  subtitulo,
  advertenciaBorrado,
  onRename,
  onDelete,
}: {
  title: string;
  subtitulo?: string;
  advertenciaBorrado: string;
  onRename: (nuevo: string) => Promise<{ error: string | null }>;
  onDelete: () => Promise<{ error: string | null }>;
}) {
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [valor, setValor] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function ejecutar(accion: () => Promise<{ error: string | null }>, alTerminar?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
      else alTerminar?.();
    });
  }

  if (editando) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(() => onRename(valor), () => setEditando(false));
        }}
        className="flex flex-col gap-2"
      >
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
            required
            minLength={2}
            maxLength={200}
            aria-label="Nuevo título"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-60"
          >
            {pendiente ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setValor(title);
              setError(null);
              setEditando(false);
            }}
            className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{title}</span>
        {subtitulo ? <span className="text-sm text-ink-muted">{subtitulo}</span> : null}

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            Renombrar
          </button>
          <button
            type="button"
            onClick={() => setBorrando(true)}
            className="rounded px-2 py-1 text-sm text-ink-muted hover:bg-danger/10 hover:text-danger"
          >
            Borrar
          </button>
        </span>
      </div>

      {borrando ? (
        <div
          role="alertdialog"
          aria-label={`Confirmar borrado de ${title}`}
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2"
        >
          <p className="text-sm">{advertenciaBorrado}</p>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(onDelete, () => setBorrando(false))}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pendiente ? 'Borrando…' : 'Sí, borrar'}
            </button>
            <button
              type="button"
              onClick={() => setBorrando(false)}
              className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
            >
              Cancelar
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
