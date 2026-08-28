import { requirePortal } from '@/lib/auth/guard';
import { PortalNav } from '@/components/portal-nav';

/**
 * Todo lo que vive bajo este layout exige sesión y membresía en la organización
 * del host. El guard corre en el servidor antes de renderizar nada: una página
 * de este grupo no puede olvidarse de comprobar el acceso.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortal();

  return (
    <div className="flex min-h-dvh flex-col">
      <PortalNav
        organizationName={session.organization.name}
        email={session.email}
        role={session.role}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
