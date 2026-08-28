import type { Enum } from '@/lib/db/types';

/**
 * Textos y reglas de presentación de los modos de entrega.
 *
 * Puro y aparte para poder probarlo: decir "se abre el 15 de septiembre" o "se
 * abre en 4 días" mal es el tipo de error que nadie nota en una revisión de
 * código y todos notan en pantalla.
 *
 * Nada de esto DECIDE acceso. La puerta es can_open_lesson() en la base.
 */

export type ReleaseMode = Enum<'course_release_mode'>;

export const MODOS: { valor: ReleaseMode; titulo: string; detalle: string }[] = [
  {
    valor: 'immediate',
    titulo: 'Todo disponible al matricularse',
    detalle: 'El alumno recibe el curso completo y avanza a su ritmo.',
  },
  {
    valor: 'scheduled',
    titulo: 'Por fechas fijas',
    detalle:
      'Cada lección se abre en la fecha que le pongas, igual para todos. Para cursos donde el grupo avanza junto.',
  },
  {
    valor: 'relative',
    titulo: 'Por días desde su matrícula',
    detalle:
      'Cada lección se abre X días después de que ese alumno se inscribió. Cada uno con su propio calendario.',
  },
];

/** Motivos que devuelve la vista my_lesson_availability. */
export type Reason = 'abierta' | 'sin-matricula' | 'fecha' | 'dias' | 'secuencia';

export function esReason(valor: string | null): Reason {
  switch (valor) {
    case 'abierta':
    case 'sin-matricula':
    case 'fecha':
    case 'dias':
    case 'secuencia':
      return valor;
    default:
      // Un motivo desconocido se trata como el más restrictivo, no como abierto.
      return 'sin-matricula';
  }
}

/** Días completos que faltan para una fecha. 0 si ya pasó o es hoy. */
export function diasHasta(opensAt: Date, ahora: Date): number {
  const ms = opensAt.getTime() - ahora.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

const FECHA = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long' });

/**
 * Qué se le dice al alumno sobre una lección que no puede abrir. Concreto
 * siempre que se pueda: una fecha o un plazo, no "no disponible".
 */
export function explicarBloqueo(
  reason: Reason,
  opensAt: Date | null,
  ahora: Date = new Date(),
): string {
  switch (reason) {
    case 'abierta':
      return '';
    case 'sin-matricula':
      return 'Requiere matrícula';
    case 'fecha':
      return opensAt ? `Se abre el ${FECHA.format(opensAt)}` : 'Se abre más adelante';
    case 'dias': {
      if (!opensAt) return 'Se abre más adelante';
      const dias = diasHasta(opensAt, ahora);
      if (dias === 0) return 'Se abre hoy';
      return dias === 1 ? 'Se abre mañana' : `Se abre en ${dias} días`;
    }
    case 'secuencia':
      return 'Completa la lección anterior';
  }
}
