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

/**
 * Motivos que devuelve la vista my_lesson_availability.
 *
 * D13 separa el bloqueo del MÓDULO del de la lección. No es un detalle cosmético:
 * "se abre el 15" dicho de una lección suelta invita a esperar esa lección,
 * cuando lo que falta es que abra la semana entera. Saberlo cambia qué hace el
 * alumno con la información.
 */
export type Reason =
  | 'abierta'
  | 'sin-matricula'
  | 'fecha'
  | 'fecha-modulo'
  | 'dias'
  | 'dias-modulo'
  | 'secuencia';

export function esReason(valor: string | null): Reason {
  switch (valor) {
    case 'abierta':
    case 'sin-matricula':
    case 'fecha':
    case 'fecha-modulo':
    case 'dias':
    case 'dias-modulo':
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
    case 'fecha-modulo':
      // Se nombra el módulo para que el alumno no espere esta lección en
      // particular: lo que falta es que abra el módulo completo.
      return opensAt
        ? `El módulo se abre el ${FECHA.format(opensAt)}`
        : 'El módulo se abre más adelante';
    case 'dias':
    case 'dias-modulo': {
      const prefijo = reason === 'dias-modulo' ? 'El módulo se abre' : 'Se abre';
      if (!opensAt) return `${prefijo} más adelante`;
      const dias = diasHasta(opensAt, ahora);
      if (dias === 0) return `${prefijo} hoy`;
      return dias === 1 ? `${prefijo} mañana` : `${prefijo} en ${dias} días`;
    }
    case 'secuencia':
      return 'Completa la lección anterior';
  }
}

/**
 * Por qué un alumno no puede auto-matricularse. Los valores vienen de
 * self_enroll_blocker() en la base, que es la autoridad; esto solo los traduce.
 *
 * Aparte y puro porque decir "cupo agotado" cuando en realidad venció el plazo
 * hace que el alumno insista por el camino equivocado.
 */
export type EnrollBlocker =
  | 'no-existe'
  | 'no-miembro'
  | 'no-publicado'
  | 'ya-matriculado'
  | 'no-gratis'
  | 'cerrada'
  | 'plazo-vencido'
  | 'cupo-lleno';

export function esBlocker(valor: string | null): EnrollBlocker | null {
  if (valor === null) return null;
  const conocidos: EnrollBlocker[] = [
    'no-existe', 'no-miembro', 'no-publicado', 'ya-matriculado',
    'no-gratis', 'cerrada', 'plazo-vencido', 'cupo-lleno',
  ];
  // Un motivo que no conocemos no se trata como "puede matricularse": eso
  // mostraría un botón que la base va a rechazar.
  return conocidos.includes(valor as EnrollBlocker) ? (valor as EnrollBlocker) : 'no-gratis';
}

/** Qué se le dice al alumno. null cuando el motivo no le corresponde ver. */
export function explicarBlocker(
  blocker: EnrollBlocker,
  organizationName: string,
): { titulo: string; detalle: string | null } | null {
  switch (blocker) {
    case 'ya-matriculado':
      return null;
    case 'cerrada':
      return {
        titulo: 'Las inscripciones están cerradas',
        detalle: `${organizationName} decidirá cuándo reabrirlas. Puedes solicitar tu matrícula igualmente.`,
      };
    case 'plazo-vencido':
      return {
        titulo: 'El plazo de inscripción venció',
        detalle: `Aún puedes solicitarla: ${organizationName} resuelve las admisiones fuera de plazo.`,
      };
    case 'cupo-lleno':
      return {
        titulo: 'El curso completó su cupo',
        detalle: 'Puedes solicitar tu matrícula y quedar en la lista para el próximo cupo.',
      };
    case 'no-gratis':
      return {
        titulo: 'Este curso requiere matrícula',
        detalle: `Solicítala y ${organizationName} te responde.`,
      };
    case 'no-publicado':
    case 'no-existe':
    case 'no-miembro':
      // No se detalla: son estados que el alumno no debería alcanzar, y
      // describirlos revelaría más de lo necesario.
      return { titulo: 'Este curso no está disponible', detalle: null };
  }
}
