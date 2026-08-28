import type { Metadata } from 'next';
import { requirePortal } from '@/lib/auth/guard';
import { isStaff } from '@/lib/auth/access';

export const metadata: Metadata = { title: 'Panel' };

export default async function PanelPage() {
  // El layout ya lo exigió; acá se vuelve a pedir para tener la sesión a mano.
  // resolvePortal está memoizada por petición con cache() de React, así que esto
  // no repite consultas y evita pasar la sesión por props por todo el árbol.
  const session = await requirePortal();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.organization.name}
        </h1>
        <p className="text-ink-muted">
          Entraste como {session.email ?? 'usuario'}.
        </p>
      </header>

      <p className="text-ink-muted">
        {isStaff(session.role)
          ? 'Desde acá vas a administrar los cursos, las matrículas y las evaluaciones.'
          : 'Acá van a aparecer tus cursos y tus evaluaciones.'}
      </p>
    </div>
  );
}
