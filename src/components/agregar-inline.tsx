'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { FormResult } from '@/lib/courses/content-actions';

const initial: FormResult = { error: null };

/**
 * Formulario de una línea para añadir un elemento. Se limpia y mantiene el foco
 * al terminar, para poder escribir varios seguidos sin volver a hacer clic —
 * cargar un curso son muchos añadidos consecutivos, no uno.
 */
export function AgregarInline({
  action,
  campos,
  etiqueta,
  placeholder,
}: {
  action: (prev: FormResult, formData: FormData) => Promise<FormResult>;
  /** Campos ocultos: el padre y el slug del curso para revalidar. */
  campos: Record<string, string>;
  etiqueta: string;
  placeholder: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const input = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state.error === null) {
      formulario.current?.reset();
      input.current?.focus();
    }
  }, [pending, state]);

  return (
    <form ref={formulario} action={formAction} className="flex flex-col gap-1.5">
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(campos).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input
          ref={input}
          name="title"
          required
          minLength={2}
          maxLength={200}
          placeholder={placeholder}
          aria-label={etiqueta}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
        >
          {pending ? 'Añadiendo…' : etiqueta}
        </button>
      </div>
    </form>
  );
}
