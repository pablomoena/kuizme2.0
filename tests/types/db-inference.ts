/**
 * Guarda en tiempo de compilación de la inferencia de tipos de las consultas.
 *
 * Esto existe por un fallo que costó encontrar: postgrest-js exige que cada
 * tabla del tipo Database traiga `Relationships`, y el generador no las emitía.
 * Sin esa clave la tabla no satisface GenericTable y TODA consulta resuelve a
 * `never` — sin un solo error de compilación. El código seguía tipando, los
 * tests seguían pasando, y `select('role')` devolvía un valor sin forma.
 *
 * Se midió qué claves hacen falta de verdad, quitando cada una y contando
 * errores de compilación:
 *
 *   Relationships (por tabla)  →  5 errores   obligatoria
 *   Views                      →  4 errores   obligatoria
 *   Functions                  →  4 errores   obligatoria
 *   CompositeTypes             →  0 errores   no la exige esta versión
 *
 * `interface` en vez de `type` tampoco rompe nada acá, aunque lo supuse al
 * principio: GenericSchema solo pide Tables, Views y Functions.
 *
 * Las afirmaciones de abajo fallan la compilación si vuelve a pasar cualquiera
 * de las tres. No hay nada que ejecutar: el chequeo es `npm run typecheck`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, DatabaseUsuario } from '@/lib/db/types';

type Client = SupabaseClient<Database>;

export type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Resolves<T> = IsNever<T> extends true ? false : IsAny<T> extends true ? false : true;

declare const db: Client;

// Consultas escritas como las usa la aplicación. Si la inferencia se cae, estos
// tipos pasan a ser `null` (fila = never) y las afirmaciones fallan.
// Existen solo por su tipo: nada de esto se ejecuta, `db` es un declare const.
/* eslint-disable @typescript-eslint/no-unused-vars */
const membership = db.from('memberships').select('role').maybeSingle();
const organization = db.from('organizations').select('id, slug, name, status').maybeSingle();
const tree = db.from('courses').select('id, title, modules(id, title, lessons(id, title))');

// Y una vista, que es una forma distinta en el tipo Database (Row sin Insert ni
// Update). Si Views vuelve a emitirse vacío, esta consulta deja de tipar.
const progreso = db.from('my_course_progress').select('course_id, total, completed, percent');

type Data<T> = Awaited<T> extends { data: infer D } ? D : never;

export type _MembershipResolves = Assert<Resolves<NonNullable<Data<typeof membership>>>>;
export type _OrganizationResolves = Assert<Resolves<NonNullable<Data<typeof organization>>>>;
export type _JoinResolves = Assert<Resolves<NonNullable<Data<typeof tree>>>>;
export type _ViewResolves = Assert<Resolves<NonNullable<Data<typeof progreso>>>>;

// Y la forma concreta, no solo que "resuelva a algo".
export type _RoleIsTheEnum = Assert<
  NonNullable<Data<typeof membership>>['role'] extends Database['public']['Enums']['org_role']
    ? true
    : false
>;
export type _JoinIsNested = Assert<
  NonNullable<Data<typeof tree>>[number]['modules'][number]['lessons'] extends unknown[]
    ? true
    : false
>;

// El esquema tiene que satisfacer lo que postgrest-js espera de un esquema.
type SchemaShape = {
  Tables: Record<string, { Row: Record<string, unknown>; Relationships: unknown[] }>;
  Views: Record<string, unknown>;
  Functions: Record<string, unknown>;
};
export type _SchemaSatisfiesPostgrest = Assert<
  Database['public'] extends SchemaShape ? true : false
>;

// Y cada tabla trae Relationships. Sin esto, `never` silencioso.
export type _EveryTableHasRelationships = Assert<
  Database['public']['Tables'][keyof Database['public']['Tables']] extends {
    Relationships: unknown[];
  }
    ? true
    : false
>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * D14 · Las tablas de servidor no existen para un cliente de usuario.
 *
 * `DatabaseUsuario` quita las tablas que ningún rol de usuario alcanza
 * (question_keys, reserved_slugs, integration_secrets, oauth_states). Sin esto,
 * una consulta del cliente compilaba y fallaba en tiempo de ejecución con
 * "permission denied" — o pasaba inadvertida, porque nadie mira ese log.
 *
 * Es la misma idea que el doble candado de la base, una capa más arriba: RLS sin
 * políticas y sin GRANT lo impiden al ejecutar; esto lo impide al compilar.
 */
type ClienteUsuario = SupabaseClient<DatabaseUsuario>;
type TablasDelUsuario = keyof DatabaseUsuario['public']['Tables'];

// Las que el usuario SÍ tiene.
export type _usuario_ve_courses = Assert<'courses' extends TablasDelUsuario ? true : false>;
export type _usuario_ve_integrations =
  Assert<'integrations' extends TablasDelUsuario ? true : false>;

// Y las que NO. Si alguna reapareciera, estas afirmaciones fallan la compilación.
export type _sin_secretos =
  Assert<'integration_secrets' extends TablasDelUsuario ? false : true>;
export type _sin_states = Assert<'oauth_states' extends TablasDelUsuario ? false : true>;
export type _sin_claves = Assert<'question_keys' extends TablasDelUsuario ? false : true>;
export type _sin_slugs = Assert<'reserved_slugs' extends TablasDelUsuario ? false : true>;

// El cliente de servidor sí las tiene: es el que escribe los tokens.
export type _admin_ve_secretos =
  Assert<'integration_secrets' extends keyof Database['public']['Tables'] ? true : false>;

// Y las consultas del usuario siguen infiriendo bien con el esquema recortado:
// quitar tablas no puede romper la inferencia de las que quedan.
declare const dbUsuario: ClienteUsuario;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const integracion = dbUsuario.from('integrations').select('status, account_label').maybeSingle();
export type _integracion_infiere = Assert<Resolves<typeof integracion extends
  PromiseLike<{ data: infer D }> ? D : never>>;
