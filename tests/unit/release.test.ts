import { describe, expect, it } from 'vitest';
import { diasHasta, esReason, explicarBloqueo, MODOS } from '@/lib/courses/release';

const ahora = new Date('2026-09-01T12:00:00Z');

describe('esReason', () => {
  it('acepta los motivos que devuelve la vista', () => {
    for (const r of ['abierta', 'sin-matricula', 'fecha', 'dias', 'secuencia'] as const) {
      expect(esReason(r)).toBe(r);
    }
  });

  it('un motivo desconocido cae en el MÁS restrictivo, no en abierto', () => {
    // Si un motivo nuevo cayera en 'abierta', la interfaz mostraría contenido
    // cerrado como disponible. Fallar hacia el lado seguro es la única opción.
    expect(esReason('modo-que-no-existe')).toBe('sin-matricula');
    expect(esReason(null)).toBe('sin-matricula');
  });
});

describe('diasHasta', () => {
  it('cuenta días completos hacia arriba', () => {
    expect(diasHasta(new Date('2026-09-02T12:00:00Z'), ahora)).toBe(1);
    expect(diasHasta(new Date('2026-09-05T12:00:00Z'), ahora)).toBe(4);
    // Faltan horas, no un día entero: sigue siendo "1 día" y no "0".
    expect(diasHasta(new Date('2026-09-01T23:00:00Z'), ahora)).toBe(1);
  });

  it('una fecha pasada o presente da 0', () => {
    expect(diasHasta(new Date('2026-08-30T12:00:00Z'), ahora)).toBe(0);
    expect(diasHasta(ahora, ahora)).toBe(0);
  });
});

describe('explicarBloqueo', () => {
  it('da una fecha concreta cuando la hay', () => {
    expect(explicarBloqueo('fecha', new Date('2026-09-15T12:00:00Z'), ahora)).toBe(
      'Se abre el 15 de septiembre',
    );
  });

  it('cuenta los días en singular y plural, y dice hoy', () => {
    expect(explicarBloqueo('dias', new Date('2026-09-02T12:00:00Z'), ahora)).toBe('Se abre mañana');
    expect(explicarBloqueo('dias', new Date('2026-09-08T12:00:00Z'), ahora)).toBe('Se abre en 7 días');
    expect(explicarBloqueo('dias', new Date('2026-09-01T10:00:00Z'), ahora)).toBe('Se abre hoy');
  });

  it('no se queda en "no disponible" cuando falta la fecha', () => {
    expect(explicarBloqueo('fecha', null, ahora)).toBe('Se abre más adelante');
    expect(explicarBloqueo('dias', null, ahora)).toBe('Se abre más adelante');
  });

  it('la secuencia dice qué hacer, no solo que está cerrada', () => {
    expect(explicarBloqueo('secuencia', null, ahora)).toBe('Completa la lección anterior');
  });

  it('una lección abierta no lleva explicación', () => {
    expect(explicarBloqueo('abierta', null, ahora)).toBe('');
  });
});

describe('MODOS', () => {
  it('cubre los tres modos del esquema, con explicación', () => {
    expect(MODOS.map((m) => m.valor)).toEqual(['immediate', 'scheduled', 'relative']);
    for (const m of MODOS) {
      expect(m.titulo.length).toBeGreaterThan(5);
      expect(m.detalle.length).toBeGreaterThan(20);
    }
  });
});
