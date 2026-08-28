import 'server-only';
import { headers } from 'next/headers';
import type { TenantTarget } from './resolve';

/**
 * Lee el tenant que el borde (src/proxy.ts) resolvió. Los Server Components usan esto y
 * nunca vuelven a mirar el host por su cuenta: una sola fuente de verdad.
 */
export async function currentTarget(): Promise<TenantTarget> {
  const h = await headers();
  const kind = h.get('x-kuizme-tenant-kind');

  switch (kind) {
    case 'marketing':
      return { kind: 'marketing' };
    case 'platform':
      return { kind: 'platform' };
    case 'tenant': {
      const slug = h.get('x-kuizme-tenant-slug');
      return slug ? { kind: 'tenant', slug } : { kind: 'unknown', host: '' };
    }
    case 'custom-domain': {
      const host = h.get('x-kuizme-tenant-host');
      return host ? { kind: 'custom-domain', host } : { kind: 'unknown', host: '' };
    }
    default:
      return { kind: 'unknown', host: h.get('host') ?? '' };
  }
}
