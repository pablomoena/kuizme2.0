import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentTarget } from '@/lib/tenant/context';
import { resolvePortal } from '@/lib/auth/guard';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [target, { session }, params] = await Promise.all([
    currentTarget(),
    resolvePortal(),
    searchParams,
  ]);

  // Ya autenticado y con acceso: no tiene sentido mostrar el formulario.
  if (session) redirect(params.next ?? '/panel');

  // El nombre de la organización no se puede mostrar todavía: sin sesión, RLS no
  // la devuelve. Se muestra el subdominio, que ya está en la barra de
  // direcciones, así que no revela nada nuevo.
  const portal = target.kind === 'tenant' ? target.slug : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Kuizme</p>
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        {portal ? (
          <p className="text-sm text-ink-muted">
            Portal de <span className="font-medium text-ink">{portal}</span>
          </p>
        ) : null}
      </header>

      <LoginForm next={params.next} />
    </main>
  );
}
