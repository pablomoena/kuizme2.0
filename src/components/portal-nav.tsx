import Link from 'next/link';
import { signOut } from '@/app/login/actions';
import { isStaff, type OrgRole } from '@/lib/auth/access';

const ETIQUETA_ROL: Record<OrgRole | 'platform_admin', string> = {
  org_admin: 'Administración',
  instructor: 'Docente',
  student: 'Alumno',
  platform_admin: 'Soporte Kuizme',
};

export function PortalNav({
  organizationName,
  email,
  role,
}: {
  organizationName: string;
  email: string | null;
  role: OrgRole | 'platform_admin';
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/panel" className="font-semibold tracking-tight">
          {organizationName}
        </Link>

        <nav aria-label="Secciones" className="flex items-center gap-4 text-sm">
          <Link href="/panel" className="text-ink-muted hover:text-ink">
            Panel
          </Link>
          {isStaff(role) ? (
            <Link href="/panel/cursos" className="text-ink-muted hover:text-ink">
              Cursos
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-ink-muted sm:inline">
            {email ?? 'Sesión activa'} · {ETIQUETA_ROL[role]}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-surface-muted"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
