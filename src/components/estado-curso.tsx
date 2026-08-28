import type { Enum } from '@/lib/db/types';

const ESTADO: Record<Enum<'course_status'>, { texto: string; clase: string }> = {
  draft: { texto: 'Borrador', clase: 'border-line text-ink-muted' },
  published: { texto: 'Publicado', clase: 'border-success/40 text-success' },
  archived: { texto: 'Archivado', clase: 'border-line text-ink-muted' },
};

const VISIBILIDAD: Record<Enum<'course_visibility'>, string> = {
  private: 'Solo matriculados',
  unlisted: 'Con enlace',
  public: 'En el catálogo',
};

/**
 * Estado y visibilidad son dos decisiones distintas y se muestran por separado.
 * En la v1 se mezclaban en una etiqueta, y nadie sabía si "público" significaba
 * publicado o visible en el catálogo — eran dos banderas y ninguna mandaba.
 */
export function EstadoCurso({
  status,
  visibility,
}: {
  status: Enum<'course_status'>;
  visibility: Enum<'course_visibility'>;
}) {
  const e = ESTADO[status];
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`rounded-full border px-2 py-0.5 font-medium ${e.clase}`}>{e.texto}</span>
      <span className="text-ink-muted">{VISIBILIDAD[visibility]}</span>
    </span>
  );
}
