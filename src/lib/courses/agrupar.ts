/**
 * Agrupar las lecciones de un módulo en sus secciones.
 *
 * Puro y aparte porque acá es donde se pierde el orden.
 *
 * La regla, y es la que evita toda una clase de errores: **el orden de la
 * pantalla es el orden del módulo**. Se recorren las lecciones por su
 * `order_index` y se abre un grupo cada vez que cambia la sección. No se
 * reagrupa, no se hoistea nada, no se reordena por `sections.order_index`.
 *
 * Por qué importa: la base tiene UNA secuencia por módulo —`lessons.order_index`,
 * la que usa la puerta secuencial de can_open_lesson— y si la pantalla mostrara
 * otra, el "completa la lección anterior" señalaría a una lección que se ve
 * después, y el "siguiente" del lector saltaría hacia atrás. Con esta regla
 * `aplanar(agrupar(l, s))` es exactamente `l`, así que no hay dos órdenes que
 * puedan discrepar: hay uno.
 *
 * `sections.order_index` sirve para la lista de secciones del editor y para
 * colocar una sección nueva al final. No decide dónde se ve: eso lo decide dónde
 * están sus lecciones. Si una sección tiene lecciones no contiguas, aparece dos
 * veces —lo que la pantalla muestra es lo que los datos dicen, y esa repetición
 * es justamente la señal de que el orden del módulo quedó entrelazado.
 *
 * Lo que esta función NO hace: decidir acceso. Eso es can_open_lesson() en la
 * base, y llega hasta acá como `readable` / `reason` en cada lección.
 */

export type ConSeccion = { id: string; section_id: string | null };
export type SeccionBase = { id: string; title: string };

export type Grupo<L, S> =
  | { tipo: 'suelta'; leccion: L }
  | { tipo: 'seccion'; seccion: S; lecciones: L[] };

/**
 * Recorre `lecciones` en el orden del módulo y abre un grupo por cada tramo con
 * la misma sección.
 *
 * Una lección cuya sección no está en `secciones` se trata como suelta en vez de
 * desaparecer: perder contenido en pantalla es peor que mostrarlo sin agrupar, y
 * el trigger de la base ya impide que ese caso llegue por escritura legítima.
 */
export function agrupar<L extends ConSeccion, S extends SeccionBase>(
  lecciones: readonly L[],
  secciones: readonly S[],
): Grupo<L, S>[] {
  const porId = new Map(secciones.map((s) => [s.id, s]));
  const grupos: Grupo<L, S>[] = [];

  for (const leccion of lecciones) {
    const seccion = leccion.section_id === null ? undefined : porId.get(leccion.section_id);

    if (seccion === undefined) {
      grupos.push({ tipo: 'suelta', leccion });
      continue;
    }

    const ultimo = grupos[grupos.length - 1];
    if (ultimo !== undefined && ultimo.tipo === 'seccion' && ultimo.seccion.id === seccion.id) {
      ultimo.lecciones.push(leccion);
    } else {
      grupos.push({ tipo: 'seccion', seccion, lecciones: [leccion] });
    }
  }

  return grupos;
}

/**
 * La secuencia plana, que por construcción es la lista que entró. Existe para
 * poder afirmar esa ley en una prueba: si algún día agrupar reordenara algo,
 * `aplanar(agrupar(l, s))` deja de ser `l` y el test lo dice.
 */
export function aplanar<L extends ConSeccion, S extends SeccionBase>(
  grupos: readonly Grupo<L, S>[],
): L[] {
  return grupos.flatMap((g) => (g.tipo === 'suelta' ? [g.leccion] : g.lecciones));
}

/**
 * ¿Las lecciones de cada sección están juntas?
 *
 * Si no lo están, la sección se ve más de una vez. No es un error de datos —la
 * base lo permite y el orden del módulo sigue siendo válido— pero el editor
 * necesita poder avisarlo, porque en pantalla parece un fallo.
 */
export function seccionesContiguas<L extends ConSeccion>(lecciones: readonly L[]): boolean {
  const vistas = new Set<string>();
  let anterior: string | null = null;

  for (const l of lecciones) {
    const actual = l.section_id;
    if (actual !== null && actual !== anterior && vistas.has(actual)) return false;
    if (actual !== null) vistas.add(actual);
    anterior = actual;
  }

  return true;
}
