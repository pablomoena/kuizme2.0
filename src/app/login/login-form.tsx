'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';

const initial: LoginState = { error: null };

export function LoginForm({ next }: { next: string | undefined }) {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/* El error va antes de los campos y con role=alert: quien usa lector de
          pantalla lo escucha al aparecer, sin tener que buscarlo. */}
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-brand px-4 py-2.5 font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
