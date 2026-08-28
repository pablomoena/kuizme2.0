import type { Enum } from '@/lib/db/types';
import type { TenantTarget } from '@/lib/tenant/resolve';

/**
 * La decisión de acceso, aislada y pura.
 *
 * El guard de verdad tiene que leer cabeceras y consultar la base, así que no se
 * puede probar sin un servidor. Esta función concentra el razonamiento —quién
 * entra, quién no y por qué— para poder probarlo caso por caso. El guard queda
 * como plomería: resolver el tenant, buscar la membresía, delegar acá.
 */

export type OrgRole = Enum<'org_role'>;

export type AccessInput = {
  target: TenantTarget;
  /** null si no hay sesión. */
  userId: string | null;
  /** La organización que resolvió el host, o null si no se encontró. */
  organization: { id: string; slug: string; name: string; status: Enum<'org_status'> } | null;
  /** El rol del usuario en esa organización, o null si no es miembro. */
  role: OrgRole | null;
  /** Administrador de la plataforma Kuizme (no de una organización). */
  isPlatformAdmin: boolean;
};

export type AccessDecision =
  | { kind: 'allow'; role: OrgRole | 'platform_admin' }
  /** Sin sesión: al login, guardando a dónde quería ir. */
  | { kind: 'sign-in' }
  /** El host no corresponde a un portal de organización. */
  | { kind: 'not-a-portal' }
  /** Hay sesión pero no da acceso a este portal. */
  | { kind: 'forbidden'; reason: 'no-membership' | 'organization-suspended' };

export function decideAccess(input: AccessInput): AccessDecision {
  const { target, userId, organization, role, isPlatformAdmin } = input;

  // El portal de una organización solo existe en un host de tenant. En el sitio
  // de marketing o en un host desconocido no hay nada que autorizar.
  if (target.kind !== 'tenant' && target.kind !== 'custom-domain') {
    return { kind: 'not-a-portal' };
  }

  // Sin sesión primero: no se filtra si la organización existe a quien no ha
  // entrado. Evita usar el portal como directorio de instituciones.
  if (!userId) return { kind: 'sign-in' };

  // Con RLS, una organización de la que no eres miembro no se puede leer: llega
  // como null. Por eso "no existe" y "no eres miembro" son la misma respuesta.
  if (!organization) return { kind: 'forbidden', reason: 'no-membership' };

  if (isPlatformAdmin) return { kind: 'allow', role: 'platform_admin' };

  if (!role) return { kind: 'forbidden', reason: 'no-membership' };

  // Una organización suspendida o cancelada no atiende a nadie salvo soporte de
  // la plataforma, que ya salió arriba.
  if (organization.status === 'suspended' || organization.status === 'cancelled') {
    return { kind: 'forbidden', reason: 'organization-suspended' };
  }

  return { kind: 'allow', role };
}

/** ¿Este rol puede editar el contenido de la organización? */
export function isStaff(role: OrgRole | 'platform_admin'): boolean {
  return role === 'org_admin' || role === 'instructor' || role === 'platform_admin';
}
