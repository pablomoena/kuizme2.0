'use client';

import { useState, useTransition } from 'react';
import { setEnrollmentControls } from '@/lib/courses/content-actions';

/**
 * Controles de inscripción del curso.
 *
 * Las tres cosas que la v1 tenía en pantalla y no aplicaba: abierta/cerrada,
 * plazo y cupo. Cada una dice qué alcanza y qué no, porque la distinción importa
 * y no es obvia: cerrar la inscripción no impide que la institución admita a
 * alguien a mano, pero el cupo sí la limita a ella también.
 */
export function InscripcionCurso({
  courseId,
  courseSlug,
  enrollmentOpen,
  enrollmentDeadline,
  maxStudents,
  activos,
}: {
  courseId: string;
  courseSlug: string;
  enrollmentOpen: boolean;
  enrollmentDeadline: string | null;
  maxStudents: number | null;
  activos: number;
}) {
  const [abierta, setAbierta] = useState(enrollmentOpen);
  const [plazo, setPlazo] = useState(enrollmentDeadline?.slice(0, 16) ?? '');
  const [cupo, setCupo] = useState(maxStudents === null ? '' : String(maxStudents));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function guardar(next: { abierta?: boolean; plazo?: string; cupo?: string }) {
    const a = next.abierta ?? abierta;
    const p = next.plazo ?? plazo;
    const c = next.cupo ?? cupo;
    setAbierta(a);
    setPlazo(p);
    setCupo(c);
    setError(null);
    setGuardado(false);

    startTransition(async () => {
      const r = await setEnrollmentControls(courseId, a, p || null, c || null, courseSlug);
      if (r.error) setError(r.error);
      else setGuardado(true);
    });
  }

  const cupoLleno = maxStudents !== null && activos >= maxStudents;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-medium">Inscripción</h2>
        {pendiente ? <span className="text-xs text-ink-muted">Guardando…</span> : null}
        {guardado && !pendiente ? <span className="text-xs text-success">Guardado</span> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <label className="flex gap-2.5">
        <input
          type="checkbox"
          checked={abierta}
          disabled={pendiente}
          onChange={(e) => guardar({ abierta: e.target.checked })}
          className="mt-1 shrink-0"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Inscripción abierta</span>
          <span className="text-sm text-ink-muted">
            Si la cierras, nadie se matricula solo. Tú puedes seguir matriculando a mano.
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Plazo para inscribirse</span>
        <input
          type="datetime-local"
          value={plazo}
          disabled={pendiente}
          onChange={(e) => setPlazo(e.target.value)}
          onBlur={(e) => guardar({ plazo: e.target.value })}
          className="self-start rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        <span className="text-sm text-ink-muted">
          En blanco, sin plazo. Tampoco te limita a ti: una admisión tardía sigue siendo posible.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Cupo máximo</span>
        <input
          type="number"
          min={1}
          step={1}
          value={cupo}
          disabled={pendiente}
          onChange={(e) => setCupo(e.target.value)}
          onBlur={(e) => guardar({ cupo: e.target.value })}
          placeholder="Sin límite"
          className="w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        <span className="text-sm text-ink-muted">
          Alumnos cursando a la vez. Quien termina o se da de baja libera su cupo.{' '}
          <strong className="font-medium text-ink">Este límite también te aplica a ti:</strong> para
          admitir a alguien más, súbelo.
        </span>
        <span className={`text-sm ${cupoLleno ? 'text-warning' : 'text-ink-muted'}`}>
          {maxStudents === null
            ? `${activos} ${activos === 1 ? 'alumno' : 'alumnos'} cursando`
            : `${activos} de ${maxStudents} ocupados${cupoLleno ? ' · cupo completo' : ''}`}
        </span>
      </label>
    </section>
  );
}
