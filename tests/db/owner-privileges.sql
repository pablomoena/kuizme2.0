-- ============================================================================
-- El diseño no depende de que el rol dueño se salte RLS
-- ============================================================================
-- is_member_of() y has_org_role() son `security definer`: corren como el DUEÑO
-- de la función, no como el usuario. Si ese rol queda sujeto a RLS, ninguna
-- política le aplica (están declaradas `to authenticated`) y los helpers
-- devuelven false para todo: la aplicación se queda en blanco.
--
-- En local y en CI el dueño es superusuario, y los superusuarios se saltan RLS
-- siempre, así que el problema es invisible. En Supabase el dueño es otro rol y
-- su configuración no la controlamos. Esta prueba traspasa tablas y funciones a
-- un rol `nosuperuser nobypassrls` y comprueba que todo sigue funcionando.
--
-- Es la misma lección que los default privileges: si el entorno de prueba es
-- más permisivo que el real, la prueba pasa y la producción está distinta.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kuizme_norls') then
    create role kuizme_norls nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema auth to kuizme_norls;
grant select on all tables in schema auth to kuizme_norls;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I owner to kuizme_norls', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' loop
    execute format('alter function %s owner to kuizme_norls', r.sig);
  end loop;
end $$;

-- Semilla mínima: una organización, un admin, un curso.
insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'dueno@test.cl');
insert into organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'instituto-e', 'Instituto E');
insert into memberships (user_id, organization_id, role) values
  ('ee000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'org_admin');
insert into courses (id, organization_id, slug, title) values
  ('e1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'curso-e', 'Curso de E');

set client_min_messages = notice;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'ee000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
declare n int;
begin
  select count(*) into n from organizations;
  if n <> 1 then
    raise exception 'FALLA: con dueño sin bypassrls, organizations devuelve % filas (esperaba 1). '
                    'Los helpers security definer quedaron sujetos a RLS.', n;
  end if;
  raise notice 'OK    organizations legible con dueño sin bypassrls → % fila(s)', n;

  select count(*) into n from courses;
  if n <> 1 then
    raise exception 'FALLA: courses devuelve % filas (esperaba 1)', n;
  end if;
  raise notice 'OK    courses legible con dueño sin bypassrls      → % fila(s)', n;

  -- Y sigue aislado: un usuario sin membresía no ve nada.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ee000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')::text, true);
  select count(*) into n from courses;
  if n <> 0 then
    raise exception 'FALLA: un usuario sin membresía ve % curso(s)', n;
  end if;
  raise notice 'OK    sin membresía no ve nada                     → % fila(s)', n;
end $$;
rollback;

\echo ''
\echo '── Independencia de los privilegios del dueño verificada ──'
