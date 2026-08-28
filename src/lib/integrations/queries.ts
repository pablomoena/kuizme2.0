import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { QueryResult } from '@/lib/courses/queries';
import {
  fichaDe,
  PROVEEDORES,
  type EstadoIntegracion,
  type FichaProveedor,
  type Proveedor,
} from './proveedores';

/**
 * Lo que la pantalla de integraciones necesita.
 *
 * Se lee con el token del usuario, así que RLS decide: la política de
 * `integrations` solo la abre al org_admin de esa organización. La comprobación
 * de rol en la página es la conveniencia; ésta es la garantía.
 *
 * No hay ninguna consulta a integration_secrets acá, y no puede haberla: el tipo
 * del cliente de usuario no incluye esa tabla, así que no compilaría.
 */

export type IntegracionEnPantalla = {
  ficha: FichaProveedor;
  estado: EstadoIntegracion;
  /** Con qué cuenta quedó conectada, para que el administrador la reconozca. */
  cuenta: string | null;
  conectadaEl: string | null;
  expiraEn: string | null;
  ultimoError: string | null;
};

export async function listarIntegraciones(
  organizationId: string,
): Promise<QueryResult<IntegracionEnPantalla[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('provider, status, account_label, connected_at, expires_at, last_error')
    .eq('organization_id', organizationId);

  if (error) return { data: null, error: error.message };

  const porProveedor = new Map(data.map((i) => [i.provider, i]));

  // Se recorre el CATÁLOGO, no lo que devolvió la base: un proveedor sin fila es
  // "sin conectar", que es el estado inicial de todos. Recorrer las filas dejaría
  // la pantalla vacía la primera vez, y entonces no habría desde dónde conectar.
  return {
    data: PROVEEDORES.map((ficha) => {
      const fila = porProveedor.get(ficha.id);
      return {
        ficha,
        estado: fila?.status ?? ('disconnected' as EstadoIntegracion),
        cuenta: fila?.account_label ?? null,
        conectadaEl: fila?.connected_at ?? null,
        expiraEn: fila?.expires_at ?? null,
        ultimoError: fila?.last_error ?? null,
      };
    }),
    error: null,
  };
}

/**
 * Si un proveedor está conectado, para el resto de la aplicación.
 *
 * Pasa por la función de la base y no por la tabla porque un instructor no puede
 * leer la fila: necesita saber si puede programar una clase en vivo, no con qué
 * cuenta ni cuándo vence el token.
 */
export async function estaConectado(proveedor: Proveedor): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('integration_conectada', { _provider: proveedor });
  if (error) return false;
  return data === true;
}

export { fichaDe };
