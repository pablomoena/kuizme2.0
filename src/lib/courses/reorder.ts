/**
 * Movimiento de elementos en una lista ordenada.
 *
 * Pura y aparte porque es donde viven los errores de un reordenamiento: el
 * desplazamiento al mover hacia abajo, los límites, y qué pasa cuando el
 * elemento no está. La interfaz de arrastre y los botones de teclado usan
 * exactamente esta función, así que ambos caminos producen el mismo resultado —
 * en la v1 el arrastre tenía su propia aritmética y el teclado no existía.
 */

/** Mueve el elemento de `from` a `to`. Fuera de rango o sin cambio: devuelve la misma lista. */
export function moveByIndex<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...list];
  if (from < 0 || from >= list.length) return [...list];
  if (to < 0 || to >= list.length) return [...list];

  const copy = [...list];
  const [item] = copy.splice(from, 1);
  // splice ya reindexó: insertar en `to` da la posición correcta en ambos
  // sentidos, sin el clásico ajuste de -1 al mover hacia abajo.
  copy.splice(to, 0, item as T);
  return copy;
}

export type Direction = 'up' | 'down';

/** Un paso arriba o abajo. Devuelve null si el elemento ya está en el extremo. */
export function step<T extends { id: string }>(
  list: readonly T[],
  id: string,
  direction: Direction,
): T[] | null {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1) return null;
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return null;
  return moveByIndex(list, from, to);
}

/** Mueve por id a una posición absoluta (lo que produce un arrastre). */
export function moveById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  to: number,
): T[] | null {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1) return null;
  if (from === to) return null;
  return moveByIndex(list, from, to);
}

/**
 * Texto para anunciar el movimiento a un lector de pantalla. Sin esto, quien
 * navega con teclado pulsa "bajar" y no recibe ninguna confirmación de que algo
 * pasó: la lista cambia visualmente y nada más.
 */
export function announce(nombre: string, posicion: number, total: number): string {
  return `${nombre}, posición ${posicion} de ${total}.`;
}
