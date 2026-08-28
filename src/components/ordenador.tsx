'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { announce, moveById, step, type Direction } from '@/lib/courses/reorder';

export type Ordenable = { id: string; title: string };

/**
 * Lista reordenable, con teclado Y arrastre.
 *
 * El teclado no es un añadido: es el camino principal y el que funciona siempre.
 * Cada elemento tiene botones reales de subir y bajar, que se deshabilitan en los
 * extremos, y cada movimiento se anuncia por aria-live con nombre y posición. En
 * la v1 solo había arrastre, así que reordenar un curso era imposible con
 * teclado, con lector de pantalla o en una pantalla táctil pequeña.
 *
 * El arrastre usa la MISMA función de movimiento que los botones, así que ambos
 * caminos no pueden divergir.
 *
 * El orden se aplica de forma optimista y se manda entero al servidor. Si el
 * servidor lo rechaza, se muestra el error y la lista vuelve al orden real: no se
 * deja al usuario creyendo que guardó algo que no se guardó.
 */
export function Ordenador<T extends Ordenable>({
  items,
  etiqueta,
  onReorder,
  children,
}: {
  items: T[];
  /** Singular, para los rótulos: "módulo", "lección". */
  etiqueta: string;
  onReorder: (orderedIds: string[]) => Promise<{ error: string | null }>;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const [optimistas, aplicar] = useOptimistic(items, (_actual, nuevos: T[]) => nuevos);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const arrastrado = useRef<string | null>(null);

  function guardar(nuevos: T[], movido: T) {
    const posicion = nuevos.findIndex((x) => x.id === movido.id) + 1;
    setError(null);
    setAviso(announce(movido.title, posicion, nuevos.length));

    startTransition(async () => {
      aplicar(nuevos);
      const r = await onReorder(nuevos.map((x) => x.id));
      if (r.error) {
        setError(r.error);
        // No se revierte a mano: al fallar, la transición termina y useOptimistic
        // vuelve al valor real que llega del servidor.
        setAviso('');
      }
    });
  }

  function mover(id: string, direction: Direction) {
    const nuevos = step(optimistas, id, direction);
    if (!nuevos) return;
    const movido = optimistas.find((x) => x.id === id);
    if (movido) guardar(nuevos, movido);
  }

  function soltarEn(destino: number) {
    const id = arrastrado.current;
    arrastrado.current = null;
    if (!id) return;
    const nuevos = moveById(optimistas, id, destino);
    if (!nuevos) return;
    const movido = optimistas.find((x) => x.id === id);
    if (movido) guardar(nuevos, movido);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Anuncio para lectores de pantalla. Visualmente oculto pero presente en
          el árbol de accesibilidad: sin esto, pulsar "bajar" no confirma nada. */}
      <p aria-live="polite" className="sr-only">
        {aviso}
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <ol className="flex flex-col gap-2">
        {optimistas.map((item, i) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => {
              arrastrado.current = item.id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => soltarEn(i)}
            className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3"
          >
            <div className="flex flex-col gap-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => mover(item.id, 'up')}
                disabled={i === 0 || pendiente}
                aria-label={`Subir ${etiqueta}: ${item.title}`}
                className="rounded px-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(item.id, 'down')}
                disabled={i === optimistas.length - 1 || pendiente}
                aria-label={`Bajar ${etiqueta}: ${item.title}`}
                className="rounded px-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            <div className="min-w-0 flex-1">{children(item, i)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
