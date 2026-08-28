import { describe, expect, it } from 'vitest';
import { describirPrecio, formatearPrecio } from '@/lib/courses/precio';

describe('formatearPrecio', () => {
  it('el peso chileno no lleva decimales: la unidad mínima es el peso', () => {
    // 49900 en CLP son 49.900 pesos, no 499. Dividir por 100 acá sería cobrar
    // cien veces menos de lo que dice la base.
    expect(formatearPrecio(49900, 'CLP')).toContain('49.900');
    expect(formatearPrecio(49900, 'CLP')).not.toContain(',00');
  });

  it('una moneda con decimales sí divide por cien', () => {
    expect(formatearPrecio(4990, 'USD')).toContain('49,90');
  });

  it('acepta el código en minúsculas o con espacios', () => {
    expect(formatearPrecio(1000, ' clp ')).toBe(formatearPrecio(1000, 'CLP'));
  });

  it('una moneda desconocida no rompe la página', () => {
    const salida = formatearPrecio(1234, 'XYZ');
    expect(salida).toContain('XYZ');
    expect(salida.length).toBeGreaterThan(3);
  });

  it('cero es un precio válido y se muestra', () => {
    expect(formatearPrecio(0, 'CLP')).toContain('0');
  });
});

describe('describirPrecio', () => {
  it('sin fila de precio no dice nada: no es "gratis"', () => {
    // Que un curso no tenga precio definido no significa que sea gratuito, y
    // decirlo sería una promesa que la base no respalda.
    expect(describirPrecio(null)).toBeNull();
  });

  it('gratis se dice gratis', () => {
    expect(describirPrecio({ kind: 'free', amountCents: null, currency: 'CLP' })).toBe('Gratis');
  });

  it('pago único muestra el monto', () => {
    expect(describirPrecio({ kind: 'one_time', amountCents: 49900, currency: 'CLP' })).toContain(
      '49.900',
    );
  });

  it('suscripción dice que es mensual', () => {
    const s = describirPrecio({ kind: 'subscription', amountCents: 9900, currency: 'CLP' });
    expect(s).toContain('9.900');
    expect(s).toContain('al mes');
  });

  it('un precio de pago sin monto no inventa una cifra', () => {
    expect(describirPrecio({ kind: 'one_time', amountCents: null, currency: 'CLP' })).toBeNull();
  });
});
