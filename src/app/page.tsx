import { currentTarget } from '@/lib/tenant/context';

export default async function Home() {
  const target = await currentTarget();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-brand">Kuizme</p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Fundaciones listas
      </h1>
      <p className="text-ink-muted">
        Next.js App Router, TypeScript estricto, Tailwind 4 y Supabase. La
        resolución de tenant funciona en el borde: este host resolvió a{' '}
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-sm">
          {target.kind}
          {target.kind === 'tenant' ? ` · ${target.slug}` : ''}
        </code>
        .
      </p>
    </main>
  );
}
