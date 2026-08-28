import { describe, expect, it } from 'vitest';
import { PATTERN, checkSlug, describeSlugProblem, slugify } from '@/lib/courses/slug';

describe('slugify', () => {
  it('convierte títulos reales en direcciones usables', () => {
    expect(slugify('Introducción al Antiguo Testamento')).toBe(
      'introduccion-al-antiguo-testamento',
    );
    expect(slugify('Hermenéutica Bíblica II')).toBe('hermeneutica-biblica-ii');
    expect(slugify('  Teología   Sistemática  ')).toBe('teologia-sistematica');
  });

  it('no deja guiones al borde ni repetidos', () => {
    expect(slugify('--Hola--Mundo--')).toBe('hola-mundo');
    expect(slugify('¿Qué es la gracia?')).toBe('que-es-la-gracia');
    expect(slugify('A / B / C')).toBe('a-b-c');
  });

  it('recorta a 50 sin dejar el guión del corte', () => {
    const largo = slugify('a'.repeat(48) + ' palabra que sobra');
    expect(largo.length).toBeLessThanOrEqual(50);
    expect(largo.endsWith('-')).toBe(false);
  });

  it('todo lo que produce y tiene largo suficiente es válido para la base', () => {
    const titulos = [
      'Introducción al Antiguo Testamento',
      '¿Qué es la gracia?',
      'Griego Koiné — Nivel 1',
      'Historia de la Iglesia (siglos I–IV)',
      'Ñandú 2026',
      'a'.repeat(80),
    ];
    for (const t of titulos) {
      const s = slugify(t);
      if (s.length >= 3) expect(PATTERN.test(s)).toBe(true);
    }
  });

  it('un título sin caracteres usables da vacío, no basura', () => {
    expect(slugify('¿¡!?')).toBe('');
    expect(slugify('   ')).toBe('');
  });
});

describe('checkSlug', () => {
  it('acepta lo que la base acepta', () => {
    for (const s of ['abc', 'curso-1', 'a-b-c', 'x'.repeat(50)]) {
      expect(checkSlug(s)).toBeNull();
    }
  });

  it('nombra el problema en vez de decir solo "inválido"', () => {
    expect(checkSlug('')).toEqual({ kind: 'vacio' });
    expect(checkSlug('ab')).toEqual({ kind: 'corto', length: 2 });
    expect(checkSlug('x'.repeat(51))).toEqual({ kind: 'largo', length: 51 });
    expect(checkSlug('con espacios')).toEqual({ kind: 'caracteres' });
    expect(checkSlug('-empieza')).toEqual({ kind: 'caracteres' });
    expect(checkSlug('termina-')).toEqual({ kind: 'caracteres' });
    expect(checkSlug('con_guion_bajo')).toEqual({ kind: 'caracteres' });
  });

  it('normaliza antes de juzgar, igual que el trigger de la base', () => {
    expect(checkSlug('  Curso-DE-Prueba  ')).toBeNull();
  });

  it('cada problema tiene un mensaje distinto y concreto', () => {
    const mensajes = (
      [
        { kind: 'vacio' },
        { kind: 'corto', length: 2 },
        { kind: 'largo', length: 51 },
        { kind: 'caracteres' },
      ] as const
    ).map(describeSlugProblem);
    expect(new Set(mensajes).size).toBe(4);
    for (const m of mensajes) expect(m.length).toBeGreaterThan(10);
  });
});
