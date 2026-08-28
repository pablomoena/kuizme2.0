import type { Enum } from '@/lib/db/types';

/**
 * Formato de precio. Aparte y puro porque un precio mal mostrado es un problema
 * comercial, no un detalle: en CLP no hay decimales, y mostrar "$49.900,00" o
 * "$499" en vez de "$49.900" son dos formas distintas de perder la venta.
 *
 * Los montos se guardan en la unidad mínima (amount_cents). En monedas sin
 * decimales, como el peso chileno, esa unidad mínima ES el peso.
 */

/** Monedas sin decimales que nos importan hoy. */
const SIN_DECIMALES = new Set(['CLP', 'JPY', 'PYG', 'KRW', 'ISK', 'VND']);

export function formatearPrecio(amountCents: number, currency: string): string {
  const codigo = currency.trim().toUpperCase();
  const decimales = SIN_DECIMALES.has(codigo) ? 0 : 2;
  const monto = decimales === 0 ? amountCents : amountCents / 100;

  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: codigo,
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(monto);
  } catch {
    // Una moneda que Intl no conozca no debe romper la página del curso.
    return `${monto.toLocaleString('es-CL')} ${codigo}`;
  }
}

export type Precio = { kind: Enum<'pricing_kind'>; amountCents: number | null; currency: string };

/** Lo que se muestra al alumno sobre el precio. Null si no hay nada que decir. */
export function describirPrecio(precio: Precio | null): string | null {
  if (!precio) return null;
  switch (precio.kind) {
    case 'free':
      return 'Gratis';
    case 'one_time':
      return precio.amountCents === null
        ? null
        : formatearPrecio(precio.amountCents, precio.currency);
    case 'subscription':
      return precio.amountCents === null
        ? null
        : `${formatearPrecio(precio.amountCents, precio.currency)} al mes`;
  }
}
