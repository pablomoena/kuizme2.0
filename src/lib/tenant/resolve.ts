/**
 * Resolución de tenant desde el hostname.
 *
 * Es una función pura a propósito: es la decisión de seguridad más importante
 * del borde y tiene que ser testeable sin levantar un servidor. La organización
 * activa se deriva SIEMPRE del host, nunca de la cookie de sesión — así una
 * sesión válida en el subdominio de una organización no puede operar sobre otra.
 */

/** Subdominios de sistema que no son tenants. Espeja `reserved_slugs` en la BD. */
export const RESERVED_SLUGS = new Set([
  'app', 'www', 'api', 'admin', 'static', 'assets', 'cdn', 'mail',
  'smtp', 'ftp', 'blog', 'docs', 'help', 'support', 'status', 'billing',
  'login', 'auth', 'dashboard', 'kuizme', 'test', 'staging', 'dev',
]);

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

export type TenantTarget =
  /** Sitio de marketing: kuizme.com */
  | { kind: 'marketing' }
  /** Plano de control de plataforma: app.kuizme.com */
  | { kind: 'platform' }
  /** Portal de un tenant por subdominio: {slug}.kuizme.com */
  | { kind: 'tenant'; slug: string }
  /** Portal de un tenant por dominio propio: portal.instituto.cl */
  | { kind: 'custom-domain'; host: string }
  /** Host que no sabemos resolver. El middleware responde 404, no adivina. */
  | { kind: 'unknown'; host: string };

/** Quita el puerto y normaliza a minúsculas. */
export function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return '';
  const host = rawHost.trim().toLowerCase();
  // IPv6 entre corchetes: [::1]:3000
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(0, close + 1);
  }
  const colon = host.lastIndexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

/**
 * @param rawHost   cabecera Host de la petición
 * @param rootDomain dominio raíz de la app (p. ej. "kuizme.com" o "localhost")
 */
export function resolveTenant(
  rawHost: string | null | undefined,
  rootDomain: string,
): TenantTarget {
  const host = normalizeHost(rawHost);
  const root = normalizeHost(rootDomain);

  if (!host || !root) return { kind: 'unknown', host };

  if (host === root) return { kind: 'marketing' };

  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));

    // Solo un nivel de subdominio. "a.b.kuizme.com" no es un tenant válido.
    if (sub.includes('.')) return { kind: 'unknown', host };

    if (sub === 'www') return { kind: 'marketing' };
    if (sub === 'app') return { kind: 'platform' };
    if (RESERVED_SLUGS.has(sub)) return { kind: 'unknown', host };
    if (!SLUG_PATTERN.test(sub)) return { kind: 'unknown', host };

    return { kind: 'tenant', slug: sub };
  }

  // Cualquier otro host se trata como candidato a dominio propio. Que exista o
  // no lo decide la base de datos, no esta función.
  return { kind: 'custom-domain', host };
}

/** ¿Este destino requiere que exista una organización en la base? */
export function requiresOrganization(target: TenantTarget): boolean {
  return target.kind === 'tenant' || target.kind === 'custom-domain';
}
