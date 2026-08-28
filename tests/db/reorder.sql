-- ============================================================================
-- Reordenar: atomicidad, permisos y movimiento entre módulos
-- ============================================================================
-- Lo más importante que se prueba acá: que un alumno que llame a estas funciones
-- reciba un ERROR y no un éxito silencioso. Con RLS, un UPDATE sin permiso no
-- falla — simplemente no toca filas. Si la función no lo comprueba, la interfaz
-- muestra el nuevo orden y la base guarda el viejo.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('9a000000-0000-0000-0000-000000000001', 'staff.r@test.cl'),
  ('9a000000-0000-0000-0000-000000000002', 'alumno.r@test.cl');

insert into organizations (id, slug, name) values
  ('09000000-0000-0000-0000-000000000001', 'instituto-r', 'Instituto R');

insert into memberships (user_id, organization_id, role) values
  ('9a000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', 'instructor'),
  ('9a000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000001', 'student');

insert into courses (id, organization_id, slug, title, status) values
  ('91000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001',
   'curso-r', 'Curso R', 'published');

insert into modules (id, course_id, title, order_index) values
  ('92000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 'Módulo A', 1),
  ('92000000-0000-0000-0000-00000000000b', '91000000-0000-0000-0000-000000000001', 'Módulo B', 2),
  ('92000000-0000-0000-0000-00000000000c', '91000000-0000-0000-0000-000000000001', 'Módulo C', 3);

insert into lessons (id, module_id, title, order_index) values
  ('93000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-00000000000a', 'Lección A1', 1),
  ('93000000-0000-0000-0000-00000000000b', '92000000-0000-0000-0000-00000000000a', 'Lección A2', 2),
  ('93000000-0000-0000-0000-00000000000c', '92000000-0000-0000-0000-00000000000b', 'Lección B1', 1);

-- Matrícula del alumno, para que pueda LEER el curso (D7) y así la prueba mida
-- el permiso de escritura y no el de lectura.
insert into enrollments (course_id, student_id, status) values
  ('91000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000002', 'active');
commit;

create or replace function test.r_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.r_orden(_course uuid) returns text
language sql as $$
  select string_agg(title, ',' order by order_index) from modules where course_id = _course;
$$;

create or replace function test.r_ok(_label text, _got text, _want text) returns void
language plpgsql as $$
begin
  if _got = _want then
    raise notice 'OK    % → %', rpad(_label, 44), _got;
  else
    raise exception 'FALLA % → esperaba "%", obtuvo "%"', rpad(_label, 44), _want, _got;
  end if;
end $$;

\echo ''
\echo '══ El staff reordena ═══════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.r_as('9a000000-0000-0000-0000-000000000001');
do $$
begin
  perform reorder_modules('91000000-0000-0000-0000-000000000001', array[
    '92000000-0000-0000-0000-00000000000c',
    '92000000-0000-0000-0000-00000000000a',
    '92000000-0000-0000-0000-00000000000b']::uuid[]);
  perform test.r_ok('orden nuevo aplicado',
    test.r_orden('91000000-0000-0000-0000-000000000001'), 'Módulo C,Módulo A,Módulo B');
end $$;
rollback;

\echo ''
\echo '══ El ALUMNO recibe error, no éxito silencioso ═════════════════════════'
begin;
set local role authenticated;
select test.r_as('9a000000-0000-0000-0000-000000000002');
do $$
declare sqlstate_visto text;
begin
  begin
    perform reorder_modules('91000000-0000-0000-0000-000000000001', array[
      '92000000-0000-0000-0000-00000000000c',
      '92000000-0000-0000-0000-00000000000a',
      '92000000-0000-0000-0000-00000000000b']::uuid[]);
    raise exception 'FALLA: el alumno reordenó el curso';
  exception
    when insufficient_privilege then
      sqlstate_visto := sqlstate;
  end;
  perform test.r_ok('alumno rechazado con insufficient_privilege', sqlstate_visto, '42501');
  -- Y el orden quedó intacto.
  perform test.r_ok('orden sin cambios tras el rechazo',
    test.r_orden('91000000-0000-0000-0000-000000000001'), 'Módulo A,Módulo B,Módulo C');
end $$;
rollback;

\echo ''
\echo '══ Listas mal formadas se rechazan enteras ═════════════════════════════'
begin;
set local role authenticated;
select test.r_as('9a000000-0000-0000-0000-000000000001');
do $$
declare
  casos text[] := array['parcial', 'repetidos', 'ajeno', 'vacia'];
  c text;
  rechazados int := 0;
begin
  foreach c in array casos loop
    begin
      perform reorder_modules('91000000-0000-0000-0000-000000000001',
        case c
          when 'parcial'   then array['92000000-0000-0000-0000-00000000000a']::uuid[]
          when 'repetidos' then array['92000000-0000-0000-0000-00000000000a',
                                      '92000000-0000-0000-0000-00000000000a',
                                      '92000000-0000-0000-0000-00000000000b']::uuid[]
          when 'ajeno'     then array['92000000-0000-0000-0000-00000000000a',
                                      '92000000-0000-0000-0000-00000000000b',
                                      '92000000-0000-0000-0000-0000000000ff']::uuid[]
          when 'vacia'     then array[]::uuid[]
        end);
      raise exception 'FALLA: se aceptó la lista "%"', c;
    exception
      when check_violation then rechazados := rechazados + 1;
    end;
  end loop;
  perform test.r_ok('listas inválidas rechazadas', rechazados::text, '4');
  perform test.r_ok('orden intacto tras los rechazos',
    test.r_orden('91000000-0000-0000-0000-000000000001'), 'Módulo A,Módulo B,Módulo C');
end $$;
rollback;

\echo ''
\echo '══ Mover una lección a otro módulo ═════════════════════════════════════'
begin;
set local role authenticated;
select test.r_as('9a000000-0000-0000-0000-000000000001');
do $$
declare destino text; origen text; curso uuid;
begin
  -- A1 pasa del módulo A al módulo B, en primera posición.
  perform move_lesson('93000000-0000-0000-0000-00000000000a',
                      '92000000-0000-0000-0000-00000000000b', 1);

  select string_agg(title, ',' order by order_index) into destino
    from lessons where module_id = '92000000-0000-0000-0000-00000000000b';
  perform test.r_ok('destino reindexado con la lección arriba', destino, 'Lección A1,Lección B1');

  select string_agg(title || ':' || order_index, ',' order by order_index) into origen
    from lessons where module_id = '92000000-0000-0000-0000-00000000000a';
  perform test.r_ok('origen sin huecos', origen, 'Lección A2:1');

  -- Y course_id siguió al módulo destino (mismo curso acá, pero el trigger corre).
  select course_id into curso from lessons where id = '93000000-0000-0000-0000-00000000000a';
  perform test.r_ok('course_id coherente',
    (curso = '91000000-0000-0000-0000-000000000001')::text, 'true');
end $$;
rollback;

\echo ''
\echo '── Reordenamiento verificado ──'
