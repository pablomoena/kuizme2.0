import { describe, expect, it } from 'vitest';
import { agrupar, aplanar, seccionesContiguas } from '@/lib/courses/agrupar';

const L = (id: string, section_id: string | null = null) => ({ id, section_id });
const S = (id: string, title: string) => ({ id, title });

/** Cómo queda la pantalla, en una línea legible. */
const forma = (g: ReturnType<typeof agrupar>) =>
  g
    .map((x) =>
      x.tipo === 'suelta'
        ? x.leccion.id
        : `${x.seccion.id}[${x.lecciones.map((l) => l.id).join('')}]`,
    )
    .join(' ');

describe('agrupar', () => {
  it('sin secciones deja las lecciones tal cual', () => {
    expect(forma(agrupar([L('a'), L('b'), L('c')], []))).toBe('a b c');
  });

  it('abre un grupo por cada tramo con la misma sección', () => {
    const lecciones = [L('a', 's1'), L('b', 's1'), L('c', 's2')];
    expect(forma(agrupar(lecciones, [S('s1', 'Semana 1'), S('s2', 'Semana 2')]))).toBe(
      's1[ab] s2[c]',
    );
  });

  it('una lección suelta se queda en SU sitio, no se adelanta', () => {
    // Adelantar las sueltas al principio era el error: dejaba la pantalla en un
    // orden distinto al de la base, y el "completa la anterior" del bloqueo
    // secuencial señalaba a una lección que se ve después.
    const lecciones = [L('a', 's1'), L('intro'), L('b', 's1')];
    expect(forma(agrupar(lecciones, [S('s1', 'Semana 1')]))).toBe('s1[a] intro s1[b]');
  });

  it('no reordena por el order_index de la sección', () => {
    // La sección se ve donde están sus lecciones. Colocarla por su propio índice
    // sería un segundo criterio de orden, y dos criterios acaban discrepando.
    const lecciones = [L('a', 's2'), L('b', 's1')];
    expect(forma(agrupar(lecciones, [S('s1', 'Semana 1'), S('s2', 'Semana 2')]))).toBe(
      's2[a] s1[b]',
    );
  });

  it('una sección con lecciones no contiguas aparece dos veces', () => {
    // Es lo que los datos dicen. Esconderlo agrupando a la fuerza cambiaría el
    // orden; mostrarlo es la señal de que hay que reordenar el módulo.
    const lecciones = [L('a', 's1'), L('b', 's2'), L('c', 's1')];
    expect(forma(agrupar(lecciones, [S('s1', 'Uno'), S('s2', 'Dos')]))).toBe('s1[a] s2[b] s1[c]');
  });

  it('una sección sin lecciones no aparece', () => {
    // En el temario del alumno un título vacío no dice nada. El editor las lista
    // aparte, desde modules.sections, porque ahí sí hay que poder nombrarlas.
    expect(forma(agrupar([], [S('s1', 'Vacía')]))).toBe('');
  });

  it('una lección con sección desconocida se muestra suelta, no desaparece', () => {
    const g = agrupar([L('a', 'fantasma'), L('b', 's1')], [S('s1', 'S')]);
    expect(forma(g)).toBe('a s1[b]');
  });

  it('LEY: aplanar(agrupar(l, s)) es exactamente l', () => {
    // Con esto no puede haber dos órdenes que discrepen: hay uno, el del módulo.
    for (const lecciones of [
      [L('a'), L('b'), L('c')],
      [L('a', 's1'), L('b'), L('c', 's1')],
      [L('a', 's2'), L('b', 's1'), L('c', 's2'), L('d')],
      [L('a', 'fantasma'), L('b', 's1')],
      [],
    ]) {
      const planas = aplanar(agrupar(lecciones, [S('s1', 'Uno'), S('s2', 'Dos')]));
      expect(planas.map((l) => l.id)).toEqual(lecciones.map((l) => l.id));
    }
  });

  it('no muta las listas que recibe', () => {
    const lecciones = [L('a', 's1'), L('b', 's1')];
    const antes = JSON.stringify(lecciones);
    agrupar(lecciones, [S('s1', 'Uno')]);
    expect(JSON.stringify(lecciones)).toBe(antes);
  });
});

describe('seccionesContiguas', () => {
  it('lo normal es contiguo', () => {
    expect(seccionesContiguas([L('a', 's1'), L('b', 's1'), L('c', 's2')])).toBe(true);
    expect(seccionesContiguas([L('a'), L('b'), L('c')])).toBe(true);
    expect(seccionesContiguas([])).toBe(true);
  });

  it('una suelta en medio de una sección la parte', () => {
    // Y eso hace que la sección se vea dos veces, que es lo que hay que avisar.
    expect(seccionesContiguas([L('a', 's1'), L('intro'), L('b', 's1')])).toBe(false);
  });

  it('detecta el entrelazado entre dos secciones', () => {
    expect(seccionesContiguas([L('a', 's1'), L('b', 's2'), L('c', 's1')])).toBe(false);
  });

  it('una sección repetida seguida no es entrelazado', () => {
    expect(seccionesContiguas([L('a', 's1'), L('b', 's1'), L('c', 's1')])).toBe(true);
  });
});
