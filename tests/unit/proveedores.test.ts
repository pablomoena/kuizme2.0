import { describe, expect, it } from 'vitest';
import {
  explicarEstado,
  fichaDe,
  PROVEEDORES,
  rutaInternaSegura,
  type EstadoIntegracion,
} from '@/lib/integrations/proveedores';

const ahora = new Date('2026-09-01T12:00:00Z');

describe('PROVEEDORES', () => {
  it('cada proveedor dice para qué sirve y qué permisos pide', () => {
    for (const p of PROVEEDORES) {
      expect(p.nombre.length).toBeGreaterThan(0);
      expect(p.paraQue.length).toBeGreaterThan(20);
      // Pedir permisos sin decir cuáles es lo que hace que nadie los lea.
      if (p.disponible) expect(p.permisos.length).toBeGreaterThan(0);
    }
  });

  it('un proveedor no disponible explica por qué', () => {
    // Un botón inerte sin motivo es peor que no mostrar nada.
    for (const p of PROVEEDORES) {
      if (!p.disponible) expect(p.porQueNo).toBeTruthy();
      else expect(p.porQueNo).toBeNull();
    }
  });

  it('no hay identificadores repetidos', () => {
    expect(new Set(PROVEEDORES.map((p) => p.id)).size).toBe(PROVEEDORES.length);
  });
});

describe('fichaDe', () => {
  it('encuentra los que conoce', () => {
    expect(fichaDe('zoom').nombre).toBe('Zoom');
  });

  it('un proveedor desconocido no deja la pantalla en blanco', () => {
    // Pasa si la base tiene un valor del enum que este despliegue no conoce.
    // @ts-expect-error probamos a propósito un valor fuera del enum
    const f = fichaDe('proveedor_del_futuro');
    expect(f.disponible).toBe(false);
    expect(f.nombre).toBe('proveedor_del_futuro');
    expect(f.porQueNo).toBeTruthy();
  });
});

describe('explicarEstado', () => {
  it('conectada y con tiempo: no dice nada de más', () => {
    const r = explicarEstado('connected', new Date('2026-09-01T13:00:00Z'), ahora);
    expect(r.tono).toBe('ok');
    expect(r.detalle).toBeNull();
  });

  it('conectada con el token por renovar no alarma', () => {
    // En Zoom el access token dura una hora. Avisar de eso sería alarmar por el
    // funcionamiento normal.
    const r = explicarEstado('connected', new Date('2026-09-01T11:00:00Z'), ahora);
    expect(r.tono).toBe('ok');
    expect(r.detalle).toMatch(/no hace falta que hagas nada/i);
  });

  it('separa "caducó" de "falló"', () => {
    // Piden cosas distintas: una se arregla reconectando, la otra hay que mirarla.
    expect(explicarEstado('expired', null, ahora).tono).toBe('aviso');
    expect(explicarEstado('error', null, ahora).tono).toBe('error');
    expect(explicarEstado('expired', null, ahora).titulo).not.toBe(
      explicarEstado('error', null, ahora).titulo,
    );
  });

  it('revocada desde el proveedor no se presenta como un fallo nuestro', () => {
    const r = explicarEstado('revoked', null, ahora);
    expect(r.detalle).toMatch(/desde la cuenta del proveedor/i);
    expect(r.tono).toBe('aviso');
  });

  it('cubre todos los estados del esquema', () => {
    const todos: EstadoIntegracion[] = [
      'disconnected',
      'connected',
      'expired',
      'revoked',
      'error',
    ];
    for (const e of todos) {
      expect(explicarEstado(e, null, ahora).titulo.length).toBeGreaterThan(0);
    }
  });
});

describe('rutaInternaSegura', () => {
  it('acepta rutas internas', () => {
    expect(rutaInternaSegura('/panel/integraciones', '/panel')).toBe('/panel/integraciones');
    expect(rutaInternaSegura('/panel/cursos/algo?x=1', '/panel')).toBe('/panel/cursos/algo?x=1');
  });

  it('cae al valor por defecto cuando no hay destino', () => {
    expect(rutaInternaSegura(null, '/panel')).toBe('/panel');
    expect(rutaInternaSegura(undefined, '/panel')).toBe('/panel');
    expect(rutaInternaSegura('', '/panel')).toBe('/panel');
  });

  it('rechaza URL absolutas: un redirect abierto roba el código de autorización', () => {
    for (const malo of [
      'https://atacante.cl',
      'http://atacante.cl',
      'javascript:alert(1)',
      'panel/sin-barra',
    ]) {
      expect(rutaInternaSegura(malo, '/panel')).toBe('/panel');
    }
  });

  it('rechaza la doble barra, que es el caso que se olvida', () => {
    // `//atacante.cl` es una URL absoluta con el esquema implícito: el navegador
    // la resuelve como https://atacante.cl. Empieza por barra, así que un chequeo
    // de "empieza por /" la deja pasar.
    expect(rutaInternaSegura('//atacante.cl', '/panel')).toBe('/panel');
    expect(rutaInternaSegura('//atacante.cl/robo', '/panel')).toBe('/panel');
  });

  it('rechaza /\\ , que algunos navegadores normalizan a //', () => {
    expect(rutaInternaSegura('/\\atacante.cl', '/panel')).toBe('/panel');
  });
});
