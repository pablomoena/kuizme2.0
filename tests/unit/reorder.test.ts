import { describe, expect, it } from 'vitest';
import { announce, moveById, moveByIndex, step } from '@/lib/courses/reorder';

const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const ids = (l: readonly { id: string }[]) => l.map((x) => x.id).join('');

describe('moveByIndex', () => {
  it('mueve hacia abajo sin el desajuste clásico de un puesto', () => {
    // El error habitual: tras quitar el elemento, los índices posteriores bajan
    // uno, y se inserta un puesto más allá del que el usuario pidió.
    expect(ids(moveByIndex(lista, 0, 2))).toBe('bcad');
    expect(ids(moveByIndex(lista, 0, 3))).toBe('bcda');
  });

  it('mueve hacia arriba', () => {
    expect(ids(moveByIndex(lista, 3, 0))).toBe('dabc');
    expect(ids(moveByIndex(lista, 2, 1))).toBe('acbd');
  });

  it('no cambia nada si el destino es el origen', () => {
    expect(ids(moveByIndex(lista, 1, 1))).toBe('abcd');
  });

  it('ignora índices fuera de rango en vez de romper la lista', () => {
    for (const [from, to] of [
      [-1, 2],
      [9, 0],
      [0, -1],
      [0, 9],
    ] as const) {
      expect(ids(moveByIndex(lista, from, to))).toBe('abcd');
    }
  });

  it('nunca pierde ni duplica elementos', () => {
    for (let from = 0; from < lista.length; from++) {
      for (let to = 0; to < lista.length; to++) {
        const r = moveByIndex(lista, from, to);
        expect(r).toHaveLength(lista.length);
        expect(new Set(r.map((x) => x.id)).size).toBe(lista.length);
      }
    }
  });

  it('no muta la lista original', () => {
    const original = [...lista];
    moveByIndex(lista, 0, 3);
    expect(lista).toEqual(original);
  });
});

describe('step', () => {
  it('un paso en cada sentido', () => {
    expect(ids(step(lista, 'b', 'up')!)).toBe('bacd');
    expect(ids(step(lista, 'b', 'down')!)).toBe('acbd');
  });

  it('devuelve null en los extremos, para poder deshabilitar el botón', () => {
    expect(step(lista, 'a', 'up')).toBeNull();
    expect(step(lista, 'd', 'down')).toBeNull();
  });

  it('devuelve null si el id no está', () => {
    expect(step(lista, 'z', 'up')).toBeNull();
  });
});

describe('moveById', () => {
  it('mueve a una posición absoluta', () => {
    expect(ids(moveById(lista, 'a', 2)!)).toBe('bcad');
  });

  it('null cuando no hay movimiento o el id no está', () => {
    expect(moveById(lista, 'a', 0)).toBeNull();
    expect(moveById(lista, 'z', 1)).toBeNull();
  });
});

describe('announce', () => {
  it('dice nombre y posición, que es lo que falta al usar teclado', () => {
    expect(announce('Módulo B', 2, 4)).toBe('Módulo B, posición 2 de 4.');
  });
});
