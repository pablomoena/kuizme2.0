-- ============================================================================
-- D14 · Integraciones por tenant: que los secretos NO se puedan alcanzar
-- ============================================================================
-- Lo que se prueba acá no es que la aplicación funcione: es que no exista
-- ninguna forma de leer un token desde una sesión de usuario. En la v1 sí
-- existe —`select zoom_refresh_token from organization_secrets` con una sesión
-- de super_admin— y no por descuido: hay una política que lo permite y un GRANT
-- que lo respalda. Así que cada camino se intenta de verdad.
--
-- Y la máquina del OAuth: un state de un solo uso, con vencimiento, consumido
-- por su hash. El callback de la v1 cae, cuando falta el state, a "el más
-- reciente sin usar de los últimos 10 minutos" sin filtrar por organización. Eso
-- también tiene su comprobación, escrita como lo contrario: con un state
-- pendiente y válido, un hash equivocado no devuelve NADA.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('1e000000-0000-0000-0000-000000000001', 'admin.int@test.cl'),
  ('1e000000-0000-0000-0000-000000000002', 'profe.int@test.cl'),
  ('1e000000-0000-0000-0000-000000000003', 'alumno.int@test.cl'),
  ('1e000000-0000-0000-0000-000000000004', 'admin.otra@test.cl');

insert into organizations (id, slug, name) values
  ('1e100000-0000-0000-0000-000000000001', 'instituto-int',  'Instituto Int'),
  ('1e100000-0000-0000-0000-000000000002', 'instituto-int2', 'Instituto Int 2');

insert into memberships (user_id, organization_id, role) values
  ('1e000000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', 'org_admin'),
  ('1e000000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000001', 'instructor'),
  ('1e000000-0000-0000-0000-000000000003', '1e100000-0000-0000-0000-000000000001', 'student'),
  ('1e000000-0000-0000-0000-000000000004', '1e100000-0000-0000-0000-000000000002', 'org_admin');

-- Instituto Int tiene Zoom conectado; Instituto Int 2 no.
insert into integrations (id, organization_id, provider, status, account_label, account_ref,
                          scopes, expires_at, connected_at, connected_by) values
  ('1e200000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001',
   'zoom', 'connected', 'zoom@instituto-int.cl', 'ZM-999',
   array['meeting:write','user:read'], now() + interval '55 minutes', now(),
   '1e000000-0000-0000-0000-000000000001'),
  ('1e200000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000002',
   'zoom', 'disconnected', null, null, '{}', null, null, null);

-- El token "cifrado". Acá da igual el algoritmo: lo que se prueba es que nadie
-- lo alcanza. El texto es reconocible a propósito, para que si alguna consulta
-- lo devolviera se vea en el resultado.
insert into integration_secrets (integration_id, access_token_encrypted, refresh_token_encrypted) values
  ('1e200000-0000-0000-0000-000000000001',
   convert_to('TOKEN-QUE-NADIE-DEBE-VER', 'utf8'),
   convert_to('REFRESH-QUE-NADIE-DEBE-VER', 'utf8'));

insert into oauth_states (id, organization_id, provider, state_hash, created_by, redirect_to, expires_at) values
  ('1e300000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001',
   'zoom', 'hash-vigente', '1e000000-0000-0000-0000-000000000001', '/panel/integraciones',
   now() + interval '10 minutes'),
  ('1e300000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000001',
   'zoom', 'hash-vencido', '1e000000-0000-0000-0000-000000000001', '/panel/integraciones',
   now() - interval '1 minute'),
  ('1e300000-0000-0000-0000-000000000003', '1e100000-0000-0000-0000-000000000001',
   'zoom', 'hash-usado', '1e000000-0000-0000-0000-000000000001', '/panel/integraciones',
   now() + interval '10 minutes');
update oauth_states set used_at = now() where state_hash = 'hash-usado';
commit;

create or replace function test.i_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.i_igual(_label text, _obtenido anyelement, _esperado anyelement) returns void
language plpgsql as $$
begin
  if _obtenido is not distinct from _esperado then
    raise notice 'OK    % → %', rpad(_label, 50), _obtenido;
  else
    raise exception 'FALLA % → esperaba %, obtuvo %', rpad(_label, 50), _esperado, _obtenido;
  end if;
end $$;

/**
 * Un intento de lectura que tiene que fracasar, por CUALQUIERA de las dos vías:
 * sin GRANT da error de permisos, y con GRANT pero sin política da cero filas.
 * Las dos son "no lo alcanza". Lo que NO se acepta es que devuelva una fila.
 */
create or replace function test.i_inalcanzable(_label text, _sql text) returns void
language plpgsql as $$
declare n int;
begin
  begin
    execute _sql into n;
  exception when insufficient_privilege or undefined_table then
    raise notice 'OK    % → sin permiso: %', rpad(_label, 50), left(sqlerrm, 40);
    return;
  end;

  if n = 0 then
    raise notice 'OK    % → 0 filas (RLS sin políticas)', rpad(_label, 50);
  else
    raise exception 'FALLA % → devolvió % fila(s). ES ALCANZABLE.', rpad(_label, 50), n;
  end if;
end $$;

create or replace function test.i_rechaza(_label text, _sql text) returns void
language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    raise notice 'OK    % → rechazado: %', rpad(_label, 50), left(sqlerrm, 45);
    return;
  end;
  raise exception 'FALLA % → fue ACEPTADO y debía fallar', rpad(_label, 50);
end $$;

/**
 * Una escritura que tiene que fracasar, exigiendo que LANCE.
 *
 * i_rechaza no basta para un UPDATE: sin GRANT lanza, pero con GRANT y sin
 * política RLS lo deja en cero filas y no lanza nada. Las dos cosas dejan la
 * base intacta, pero solo una impide que la aplicación crea que guardó. Esta
 * versión exige el error Y comprueba que la fila no cambió — la primera versión
 * de la migración pasaba por aquí porque el UPDATE no tocaba nada en silencio.
 */
create or replace function test.i_sin_permiso(_label text, _sql text) returns void
language plpgsql as $$
begin
  begin
    execute _sql;
  exception when insufficient_privilege then
    raise notice 'OK    % → sin permiso (lanza, no silencio)', rpad(_label, 50);
    return;
  when others then
    raise exception 'FALLA % → falló, pero no por permisos: % (%)',
      rpad(_label, 50), sqlerrm, sqlstate;
  end;
  raise exception 'FALLA % → NO lanzó. Con RLS eso es éxito silencioso.', rpad(_label, 50);
end $$;

\echo ''
\echo '══ 1 · El agujero de la v1: leer el token con sesión de administrador ═══'
-- En la v1 esto devuelve el refresh token. Se intenta con el rol MÁS alto que
-- existe dentro de un tenant, que es justo el que la política de la v1 autoriza.
begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000001');   -- org_admin
do $$ begin
  perform test.i_inalcanzable('org_admin: contar integration_secrets',
    'select count(*)::int from integration_secrets');
  perform test.i_inalcanzable('org_admin: el token de SU PROPIA organización',
    $q$select count(*)::int from integration_secrets
        where integration_id = '1e200000-0000-0000-0000-000000000001'$q$);
  perform test.i_inalcanzable('org_admin: por join desde integrations',
    $q$select count(*)::int from integrations i
        join integration_secrets s on s.integration_id = i.id$q$);
  perform test.i_inalcanzable('org_admin: contar oauth_states',
    'select count(*)::int from oauth_states');
  perform test.i_rechaza('org_admin: borrar secretos (la v1 lo permite)',
    'delete from integration_secrets');
end $$;
rollback;

\echo ''
\echo '══ 2 · El doble candado: sin GRANT, no solo sin política ════════════════'
do $$
declare sobran text;
begin
  select string_agg(format('%s→%s(%s)', table_name, grantee, privilege_type), ', ')
    into sobran
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('integration_secrets', 'oauth_states')
    and grantee in ('anon', 'authenticated');

  -- Supabase concede TODA tabla nueva a authenticated por default privileges, así
  -- que este revoke tiene que ser explícito. Sin él, la tabla queda alcanzable en
  -- cuanto alguien añada una política pensando que ayuda.
  perform test.i_igual('ningún GRANT para anon ni authenticated', sobran, null::text);

  perform test.i_igual('service_role sí llega a los secretos',
    (select count(distinct table_name)::int from information_schema.role_table_grants
      where table_schema='public' and grantee='service_role'
        and table_name in ('integration_secrets','oauth_states')), 2);

  perform test.i_igual('integration_secrets no tiene ninguna política',
    (select count(*)::int from pg_policies
      where schemaname='public' and tablename='integration_secrets'), 0);
  perform test.i_igual('oauth_states no tiene ninguna política',
    (select count(*)::int from pg_policies
      where schemaname='public' and tablename='oauth_states'), 0);
  perform test.i_igual('y las dos tienen RLS activo',
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relrowsecurity
        and c.relname in ('integration_secrets','oauth_states')), 2);
end $$;

\echo ''
\echo '══ 3 · Quién ve el estado de la conexión ════════════════════════════════'
begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000001');   -- org_admin de Int
do $$ begin
  perform test.i_igual('org_admin ve la integración de su organización',
    (select count(*)::int from integrations), 1);
  perform test.i_igual('y es la suya',
    (select account_label from integrations),
    'zoom@instituto-int.cl');
end $$;
rollback;

begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000002');   -- instructor
do $$ begin
  -- account_label es un correo, y conectar la cuenta es un acto administrativo.
  perform test.i_igual('el instructor NO ve la fila', (select count(*)::int from integrations), 0);
  -- Pero sí necesita saber si puede programar una clase en vivo.
  perform test.i_igual('sí sabe que Zoom está conectado',
    integration_conectada('zoom'), true);
  perform test.i_igual('y que Mercado Pago no', integration_conectada('mercado_pago'), false);
end $$;
rollback;

begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000003');   -- alumno
do $$ begin
  perform test.i_igual('el alumno no ve ninguna fila',
    (select count(*)::int from integrations), 0);
  perform test.i_igual('y para él no hay nada conectado',
    integration_conectada('zoom'), false);
end $$;
rollback;

begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000004');   -- org_admin de la OTRA
do $$ begin
  perform test.i_igual('el admin de la otra ve solo la suya',
    (select count(*)::int from integrations), 1);
  perform test.i_igual('y no la de Instituto Int',
    (select count(*)::int from integrations
      where organization_id = '1e100000-0000-0000-0000-000000000001'), 0);
  perform test.i_igual('para él Zoom no está conectado',
    integration_conectada('zoom'), false);
end $$;
rollback;

\echo ''
\echo '══ 4 · Nadie finge una conexión ═════════════════════════════════════════'
-- Sin esto, un administrador pondría status='connected' y la pantalla mostraría
-- una integración activa que no existe. El estado lo escribe quien habló con el
-- proveedor, y ese es el servidor.
begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000001');
do $$ begin
  perform test.i_sin_permiso('org_admin no marca conectada la de otro',
    $q$update integrations set status = 'connected'
        where organization_id = '1e100000-0000-0000-0000-000000000002'$q$);
  perform test.i_sin_permiso('org_admin no crea una integración',
    $q$insert into integrations (organization_id, provider, status)
        values ('1e100000-0000-0000-0000-000000000001', 'hubspot', 'connected')$q$);
  perform test.i_sin_permiso('org_admin no cambia la SUYA',
    $q$update integrations set account_label = 'otro@correo.cl'
        where organization_id = '1e100000-0000-0000-0000-000000000001'$q$);
  perform test.i_sin_permiso('org_admin no borra la suya',
    $q$delete from integrations
        where organization_id = '1e100000-0000-0000-0000-000000000001'$q$);

  -- Y la fila sigue como estaba. Un "no lanzó" con la fila intacta sería el éxito
  -- silencioso; un "lanzó" con la fila cambiada sería peor todavía.
  perform test.i_igual('la suya quedó intacta',
    (select account_label from integrations
      where organization_id = '1e100000-0000-0000-0000-000000000001'),
    'zoom@instituto-int.cl');
end $$;
rollback;

\echo ''
\echo '══ 5 · consume_oauth_state no la ejecuta ningún usuario ═════════════════'
begin;
set local role authenticated;
select test.i_as('1e000000-0000-0000-0000-000000000001');
do $$ begin
  perform test.i_rechaza('org_admin no puede consumir un state',
    $q$select * from consume_oauth_state('hash-vigente', 'zoom')$q$);
end $$;
rollback;

\echo ''
\echo '══ 6 · La máquina del state ═════════════════════════════════════════════'
-- Como el servidor. `consume_oauth_state` devuelve la organización en vez de
-- recibirla, así que quien llega al callback no elige tenant.
begin;
do $$
declare r record; n int;
begin
  select * into r from consume_oauth_state('hash-vigente', 'zoom');
  perform test.i_igual('un state vigente devuelve SU organización',
    r.organization_id, '1e100000-0000-0000-0000-000000000001'::uuid);
  perform test.i_igual('y a dónde volver', r.redirect_to, '/panel/integraciones');

  -- De un solo uso: el segundo intento no encuentra nada.
  select count(*)::int into n from consume_oauth_state('hash-vigente', 'zoom');
  perform test.i_igual('el mismo state por segunda vez: 0 filas', n, 0);

  select count(*)::int into n from consume_oauth_state('hash-vencido', 'zoom');
  perform test.i_igual('un state vencido: 0 filas', n, 0);

  select count(*)::int into n from consume_oauth_state('hash-usado', 'zoom');
  perform test.i_igual('un state ya usado: 0 filas', n, 0);

  -- El proveedor es parte de la llave: un state pedido para Zoom no sirve para
  -- conectar Mercado Pago.
  select count(*)::int into n from consume_oauth_state('hash-usado', 'mercado_pago');
  perform test.i_igual('el proveedor tiene que coincidir: 0 filas', n, 0);
end $$;
rollback;

\echo ''
\echo '══ 7 · Lo contrario del fallback de la v1 ═══════════════════════════════'
-- La v1, si falta el state, toma "el más reciente sin usar de los últimos 10
-- minutos" SIN filtrar por organización: la cuenta de quien llegue al callback
-- queda atada a la institución que empezó un flujo hace un rato.
--
-- Escrito como su negación: con un state pendiente y VÁLIDO en la tabla, un hash
-- que no corresponde no devuelve nada. No hay puerta de atrás.
begin;
do $$
declare n int; pendientes int;
begin
  select count(*)::int into pendientes from oauth_states
   where used_at is null and expires_at > now();
  perform test.i_igual('hay un state pendiente y válido', pendientes, 1);

  select count(*)::int into n from consume_oauth_state('hash-inventado', 'zoom');
  perform test.i_igual('un hash inventado NO lo agarra', n, 0);

  select count(*)::int into n from consume_oauth_state('', 'zoom');
  perform test.i_igual('un hash vacío tampoco', n, 0);

  select count(*)::int into n from consume_oauth_state(null, 'zoom');
  perform test.i_igual('y un hash nulo tampoco', n, 0);

  -- Y sigue pendiente: ningún intento fallido lo quemó.
  perform test.i_igual('el state legítimo sigue disponible',
    (select count(*)::int from oauth_states
      where state_hash = 'hash-vigente' and used_at is null), 1);
end $$;
rollback;

-- Un hash, un state. Si dos filas compartieran hash, el `update ... where
-- state_hash = _hash` de consume_oauth_state actualizaría las DOS y devolvería
-- dos organizaciones para un solo state: el callback elegiría una, y con suerte
-- la correcta. La restricción de unicidad es lo que hace imposible ese caso, así
-- que se afirma en vez de darse por supuesta.
begin;
do $$ begin
  perform test.i_rechaza('dos states con el mismo hash: rechazado',
    $q$insert into oauth_states (organization_id, provider, state_hash, created_by)
        values ('1e100000-0000-0000-0000-000000000001', 'zoom', 'hash-vigente',
                '1e000000-0000-0000-0000-000000000001')$q$);

  -- Y el mismo hash para OTRO proveedor tampoco: la unicidad es del hash solo, no
  -- del par. Un state es un secreto de un solo uso; reutilizar su valor entre
  -- proveedores sería reutilizar el secreto.
  perform test.i_rechaza('el mismo hash para otro proveedor: rechazado',
    $q$insert into oauth_states (organization_id, provider, state_hash, created_by)
        values ('1e100000-0000-0000-0000-000000000001', 'hubspot', 'hash-vigente',
                '1e000000-0000-0000-0000-000000000001')$q$);
end $$;
rollback;

\echo ''
\echo '══ 8 · El token no viaja por ninguna función accesible ══════════════════'
-- Un secreto inalcanzable por la tabla pero devuelto por una función SECURITY
-- DEFINER que authenticated puede ejecutar volvería a estar alcanzable. Esto
-- comprueba que ninguna función ejecutable por el usuario menciona las columnas
-- cifradas.
do $$
declare culpables text;
begin
  select string_agg(p.proname, ', ') into culpables
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.prosrc ~* '(access_token_encrypted|refresh_token_encrypted|integration_secrets)';

  perform test.i_igual('ninguna función de usuario toca los secretos', culpables, null::text);
end $$;

\echo ''
\echo '══ Todo verde ══════════════════════════════════════════════════════════'
