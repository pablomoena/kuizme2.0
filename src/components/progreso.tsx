import type { Progress } from '@/lib/courses/reader';

/**
 * Barra de progreso. Muestra SIEMPRE el denominador —"3 de 8"— y no solo el
 * porcentaje.
 *
 * En la v1 una pantalla recibía únicamente el porcentaje y reconstruía el total
 * dividiendo, así que el total cambiaba al navegar. El porcentaje sin
 * denominador es un dato incompleto: quien lo recibe acaba inventando el resto.
 */
export function Progreso({ progress, className = '' }: { progress: Progress; className?: string }) {
  const { completed, total, percent } = progress;

  if (total === 0) {
    return (
      <p className={`text-sm text-ink-muted ${className}`}>
        Este curso no tiene lecciones obligatorias todavía.
      </p>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">
          {completed} de {total} {total === 1 ? 'lección' : 'lecciones'}
        </span>
        <span className="text-ink-muted">{percent}%</span>
      </div>
      {/* role=img con aria-label en vez de progressbar: el texto de arriba ya da
          el dato, y un progressbar lo haría anunciar dos veces. */}
      <div
        role="img"
        aria-label={`${percent}% del curso completado: ${completed} de ${total} lecciones obligatorias.`}
        className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
