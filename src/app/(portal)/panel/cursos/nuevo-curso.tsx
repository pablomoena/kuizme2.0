'use client';

import { useActionState, useState } from 'react';
import { createCourse, type FormResult } from '@/lib/courses/actions';
import { slugify } from '@/lib/courses/slug';

const initial: FormResult = { error: null };

/**
 * Crear curso. La dirección se propone desde el título mientras se escribe, pero
 * queda editable: en cuanto alguien la toca, deja de sobrescribirse. Ver la
 * dirección antes de guardar evita el curso llamado "curso-nuevo-2" del que
 * nadie se acuerda.
 */
export function NuevoCurso({ portalSlug }: { portalSlug: string | null }) {
  const [state, formAction, pending] = useActionState(createCourse, initial);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);

  const slugMostrado = slugEditado ? slug : slugify(title);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-medium">Crear un curso</h2>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Título</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          placeholder="Introducción al Antiguo Testamento"
          className="rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Dirección</span>
        <input
          name="slug"
          value={slugMostrado}
          onChange={(e) => {
            setSlugEditado(true);
            setSlug(e.target.value);
          }}
          maxLength={50}
          className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
          aria-describedby="ayuda-slug"
        />
        <span id="ayuda-slug" className="text-xs text-ink-muted">
          {portalSlug ? `${portalSlug}.kuizme.com` : 'tu-portal'}
          /cursos/<span className="font-mono">{slugMostrado || '…'}</span>
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear curso'}
      </button>
    </form>
  );
}
