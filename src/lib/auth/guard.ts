import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentTarget } from '@/lib/tenant/context';
import type { TenantTarget } from '@/lib/tenant/resolve';
import { decideAccess, type AccessDecision, type OrgRole } from './access';
import type { Enum } from '@/lib/db/types';

/**
 * Capa 2 · El guard del portal.
 *
 * Plomería alrededor de decideAccess(): resolver el tenant del host, buscar la
 * organización y la membresía, y delegar la decisión. Todo con el token del
 * usuario, así que RLS sigue aplicando: si esta consulta tuviera un error, la
 * base seguiría negando.
 *
 * La organización se deriva del HOST, nunca de la sesión. Un usuario con
 * membresía en dos institutos ve la que corresponde al subdominio por el que
 * entró, y no puede cambiarla manipulando una cookie.
 */

export type Organization = {
  id: string;
  slug: string;
  name: string;
  status: Enum<'org_status'>;
};

export type PortalSession = {
  userId: string;
  email: string | null;
  organization: Organization;
  role: OrgRole | 'platform_admin';
};

/**
 * Resuelve la sesión del portal sin redirigir. Para páginas que se adaptan.
 *
 * Envuelto en cache() de React: el layout y la página del mismo render piden la
 * sesión por separado, y sin esto serían cuatro consultas repetidas por
 * navegación. Con cache() se resuelve una vez por petición.
 */
export const resolvePortal = cache(async (): Promise<
  { decision: AccessDecision; session: PortalSession | null }
> => {
  const target = await currentTarget();
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user ?? null;

  // Si no hay sesión no se consulta nada más: sin token, RLS no devolvería la
  // organización de todos modos, y así no se filtra qué subdominios existen.
  if (!user) {
    return { decision: decideAccess({ target, userId: null, organization: null, role: null, isPlatformAdmin: false }), session: null };
  }

  const organization = await fetchOrganization(supabase, target);
  const role = organization ? await fetchRole(supabase, organization.id, user.id) : null;

  const { data: platformAdmin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const decision = decideAccess({
    target,
    userId: user.id,
    organization,
    role,
    isPlatformAdmin: platformAdmin !== null,
  });

  if (decision.kind !== 'allow' || !organization) {
    return { decision, session: null };
  }

  return {
    decision,
    session: {
      userId: user.id,
      email: user.email ?? null,
      organization,
      role: decision.role,
    },
  };
});


type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** La organización sale del host. Con RLS, una de la que no eres miembro llega
 *  como null, así que esta consulta es también parte de la autorización. */
async function fetchOrganization(
  supabase: ServerClient,
  target: TenantTarget,
): Promise<Organization | null> {
  const query = supabase.from('organizations').select('id, slug, name, status');

  const { data } =
    target.kind === 'tenant'
      ? await query.eq('slug', target.slug).maybeSingle()
      : target.kind === 'custom-domain'
        ? await query.eq('custom_domain', target.host).maybeSingle()
        : { data: null };

  return data;
}

async function fetchRole(
  supabase: ServerClient,
  organizationId: string,
  userId: string,
): Promise<OrgRole | null> {
  const { data } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

/**
 * Exige una sesión válida en el portal de este host. Si no la hay, corta el
 * render: al login, o a la página de acceso denegado.
 */
export async function requirePortal(): Promise<PortalSession> {
  const { decision, session } = await resolvePortal();
  if (session) return session;

  switch (decision.kind) {
    case 'sign-in':
      redirect('/login');
    case 'not-a-portal':
      redirect('/');
    case 'forbidden':
      redirect(`/sin-acceso?motivo=${decision.reason}`);
    default:
      // 'allow' sin sesión no debería ocurrir; si ocurre, no se adivina.
      throw new Error('Estado de acceso inconsistente');
  }
}

/** Exige además que el usuario pueda editar contenido. */
export async function requireStaff(): Promise<PortalSession> {
  const session = await requirePortal();
  if (session.role === 'student') redirect('/sin-acceso?motivo=solo-staff');
  return session;
}

/**
 * Exige ser administrador de la organización (o de la plataforma).
 *
 * Distinto de requireStaff: un instructor edita contenido pero no conecta la
 * cuenta de Zoom del instituto ni ve con qué correo quedó conectada. Es la misma
 * frontera que la política de lectura de `integrations` (D14) — y por eso ésta se
 * apoya en la base y no la reemplaza: si esta comprobación se olvidara en una
 * página nueva, RLS seguiría devolviendo cero filas.
 */
export async function requireOrgAdmin(): Promise<PortalSession> {
  const session = await requirePortal();
  if (session.role !== 'org_admin' && session.role !== 'platform_admin') {
    redirect('/sin-acceso?motivo=solo-admin');
  }
  return session;
}
