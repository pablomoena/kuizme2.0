'use client';

import { useState, useTransition } from 'react';
import { cancelRequest, requestEnrollment, selfEnroll } from '@/lib/courses/enroll-actions';
import { describirPrecio, type Precio } from '@/lib/courses/precio';
import { explicarBlocker } from '@/lib/courses/release';
import type { StudentCourse } from '@/lib/courses/catalog';

/**
 * Cómo se matricula el alumno en ESTE curso.
 *
 * La vía la decidió la base (can_self_enroll), no esta pantalla: el botón de
 * matrícula directa aparece si y solo si la política la aceptaría. Antes había
 * un texto fijo que decía "las matrículas las gestiona la institución"; eso era
 * cierto pero ya no es todo.
 */
export function Matricularse({
  courseId,
  courseSlug,
  enroll,
  precio,
  organizationName,
}: {
  courseId: string;
  courseSlug: string;
  enroll: StudentCourse['enroll'];
  precio: Precio | null;
  organizationName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [pendiente, startTransition] = useTransition();
  const etiquetaPrecio = describirPrecio(precio);
  const aviso =
    enroll.via === 'solicitud' && enroll.motivo
      ? explicarBlocker(enroll.motivo, organizationName)
      : null;

  function correr(accion: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
    });
  }

  if (enroll.via === 'ya-matriculado') return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-muted px-4 py-4">
      {/* El motivo concreto en el título: "El curso completó su cupo" en vez de
          "No estás matriculado", que es cierto y no dice nada útil. */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="font-medium">{aviso?.titulo ?? 'No estás matriculado'}</p>
        {etiquetaPrecio ? <p className="text-sm text-ink-muted">{etiquetaPrecio}</p> : null}
      </div>

      {aviso?.detalle ? <p className="text-sm text-ink-muted">{aviso.detalle}</p> : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {enroll.via === 'directa' ? (
        <>
          <p className="text-sm text-ink-muted">
            Este curso es gratuito: puedes empezar ahora mismo.
          </p>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => selfEnroll(courseId, courseSlug))}
            className="self-start rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-60"
          >
            {pendiente ? 'Matriculando…' : 'Matricularme'}
          </button>
        </>
      ) : null}

      {enroll.via === 'solicitud' && enroll.pendiente ? (
        <>
          <p className="text-sm">
            Tu solicitud está enviada. {organizationName} te va a responder.
          </p>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => cancelRequest(enroll.pendiente!.id, courseSlug))}
            className="self-start rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-60"
          >
            {pendiente ? 'Retirando…' : 'Retirar la solicitud'}
          </button>
        </>
      ) : null}

      {enroll.via === 'solicitud' && !enroll.pendiente ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            correr(() => requestEnrollment(courseId, mensaje, courseSlug));
          }}
          className="flex flex-col gap-2"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="sr-only">Mensaje para {organizationName}</span>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Opcional: cuéntales por qué te interesa, o si necesitas alguna facilidad."
              className="rounded-md border border-line bg-surface px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={pendiente}
            className="self-start rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-60"
          >
            {pendiente ? 'Enviando…' : 'Solicitar matrícula'}
          </button>
        </form>
      ) : null}

      {enroll.via === 'ninguna' ? (
        <p className="text-sm text-ink-muted">
          Las matrículas de este curso las gestiona {organizationName}.
        </p>
      ) : null}
    </div>
  );
}
