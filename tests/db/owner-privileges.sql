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

-- Semilla: un admin Y un alumno matriculado en un curso privado publicado.
--
-- El alumno es la parte que importa. La primera versión de esta prueba usaba
-- solo el administrador, que llega por has_org_role → memberships, y pasaba
-- mientras el camino del alumno —is_enrolled_in → enrollments— estaba roto:
-- devolvía false y el alumno no veía nada. Una prueba que solo cubre el camino
-- fácil da una confianza que no corresponde.
insert into auth.users (id, email) values
  ('ee000000-0000-0000-0000-000000000001', 'dueno@test.cl'),
  ('ee000000-0000-0000-0000-000000000002', 'alumno.dueno@test.cl');
insert into organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'instituto-e', 'Instituto E');
insert into memberships (user_id, organization_id, role) values
  ('ee000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'org_admin'),
  ('ee000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000001', 'student');
insert into courses (id, organization_id, slug, title, status, visibility) values
  ('e1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'curso-e', 'Curso de E', 'published', 'private');
insert into modules (id, course_id, title) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Módulo de E');
insert into lessons (id, module_id, title) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'Lección de E');
insert into lesson_contents (lesson_id, body) values
  ('e3000000-0000-0000-0000-000000000001', 'CONTENIDO DE E');
insert into enrollments (course_id, student_id, status) values
  ('e1000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000002', 'active');

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

  -- El camino del ALUMNO: is_enrolled_in lee enrollments como el dueño. Si esa
  -- tabla tiene FORCE, devuelve false y el alumno se queda sin nada.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'ee000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);

  if not is_enrolled_in('e1000000-0000-0000-0000-000000000001') then
    raise exception 'FALLA: is_enrolled_in devuelve false para un alumno matriculado. '
                    'La tabla enrollments quedó con `force row level security`.';
  end if;
  raise notice 'OK    is_enrolled_in funciona para el matriculado';

  select count(*) into n from courses;
  if n <> 1 then
    raise exception 'FALLA: el alumno matriculado ve % curso(s), esperaba 1', n;
  end if;
  raise notice 'OK    el alumno matriculado ve su curso            → % fila(s)', n;

  select count(*) into n from lesson_contents;
  if n <> 1 then
    raise exception 'FALLA: el alumno matriculado alcanza % contenido(s), esperaba 1', n;
  end if;
  raise notice 'OK    y alcanza el contenido                      → % fila(s)', n;

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

-- ── Y los triggers, que también son SECURITY DEFINER ───────────────────────
-- set_organization_id() lee la tabla padre como el dueño. Con FORCE ahí, cada
-- inserción falla con "No se puede derivar organization_id".
begin;
do $$
declare org uuid;
begin
  insert into lessons (id, module_id, title)
    values ('e3000000-0000-0000-0000-0000000000aa', 'e2000000-0000-0000-0000-000000000001', 'Derivada');
  select organization_id into org from lessons where id = 'e3000000-0000-0000-0000-0000000000aa';
  if org is distinct from '0e000000-0000-0000-0000-000000000001' then
    raise exception 'FALLA: el trigger no derivó organization_id con dueño sin bypassrls';
  end if;
  raise notice 'OK    los triggers derivan sus claves';
end $$;
rollback;

\echo ''
\echo '── Independencia de los privilegios del dueño verificada ──'
