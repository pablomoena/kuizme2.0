import { describe, expect, it } from 'vitest';
import {
  diasHasta,
  esBlocker,
  esReason,
  explicarBlocker,
  explicarBloqueo,
  MODOS,
} from '@/lib/courses/release';

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

describe('esBlocker', () => {
  it('reconoce los motivos que devuelve la base', () => {
    for (const b of [
      'no-existe', 'no-miembro', 'no-publicado', 'ya-matriculado',
      'no-gratis', 'cerrada', 'plazo-vencido', 'cupo-lleno',
    ] as const) {
      expect(esBlocker(b)).toBe(b);
    }
  });

  it('null significa que sí puede', () => {
    expect(esBlocker(null)).toBeNull();
  });

  it('un motivo desconocido NO se trata como "puede"', () => {
    // Si cayera en null, la interfaz mostraría un botón de matrícula que la
    // base va a rechazar. Fallar hacia el lado que no promete es lo correcto.
    expect(esBlocker('motivo-que-no-existe')).not.toBeNull();
  });
});

describe('explicarBlocker', () => {
  it('distingue cupo lleno de plazo vencido', () => {
    const cupo = explicarBlocker('cupo-lleno', 'Instituto X');
    const plazo = explicarBlocker('plazo-vencido', 'Instituto X');
    expect(cupo!.titulo).not.toBe(plazo!.titulo);
    expect(cupo!.titulo).toMatch(/cupo/i);
    expect(plazo!.titulo).toMatch(/plazo/i);
  });

  it('cada motivo ofrece la salida: solicitar', () => {
    for (const b of ['cerrada', 'plazo-vencido', 'cupo-lleno', 'no-gratis'] as const) {
      // /solic[ií]t/ y no /solicit/: en español el verbo lleva acento en
      // "solicítala", y la versión sin acento no coincidiría.
      expect(explicarBlocker(b, 'Instituto X')!.detalle).toMatch(/solic[ií]t/i);
    }
  });

  it('nombra a la institución cuando la decisión es suya', () => {
    expect(explicarBlocker('cerrada', 'Instituto Bíblico Miel')!.detalle).toContain(
      'Instituto Bíblico Miel',
    );
  });

  it('los estados que el alumno no debería alcanzar no se detallan', () => {
    for (const b of ['no-existe', 'no-miembro', 'no-publicado'] as const) {
      expect(explicarBlocker(b, 'X')!.detalle).toBeNull();
    }
  });

  it('quien ya está matriculado no recibe ningún aviso', () => {
    expect(explicarBlocker('ya-matriculado', 'X')).toBeNull();
  });
});
