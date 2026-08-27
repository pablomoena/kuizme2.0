import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolveTenant } from '@/lib/tenant/resolve';

/**
 * Capa 1 · Borde.
 *
 * Hace dos cosas antes de que se ejecute cualquier página:
 *   1. Refresca la sesión de Supabase (único lugar donde se escriben cookies).
 *   2. Resuelve el tenant desde el hostname y lo pasa por cabecera interna.
 *
 * La organización activa se deriva del host, nunca de la cookie. Una sesión
 * válida en el subdominio de la organización A no puede operar sobre la B.
 */
export async function middleware(request: NextRequest) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost';
  const target = resolveTenant(request.headers.get('host'), rootDomain);

  if (target.kind === 'unknown') {
    return new NextResponse('Host no reconocido', { status: 404 });
  }

  // Cabeceras internas para los Server Components. Se limpian las que vengan de
  // fuera: un cliente no puede inyectar su propio tenant.
  const headers = new Headers(request.headers);
  headers.delete('x-kuizme-tenant-kind');
  headers.delete('x-kuizme-tenant-slug');
  headers.delete('x-kuizme-tenant-host');
  headers.set('x-kuizme-tenant-kind', target.kind);
  if (target.kind === 'tenant') headers.set('x-kuizme-tenant-slug', target.slug);
  if (target.kind === 'custom-domain') headers.set('x-kuizme-tenant-host', target.host);

  let response = NextResponse.next({ request: { headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, {
            ...options,
            // Compartida entre subdominios para que un usuario con varias
            // membresías no tenga que autenticarse en cada portal.
            domain: rootDomain === 'localhost' ? undefined : `.${rootDomain}`,
          });
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
