-- ============================================================================
-- D10 · La entrega configurada por curso, aplicada en la base
-- ============================================================================
-- Lo que se prueba: que el bloqueo NO sea decorativo. Un alumno matriculado que
-- pida directamente el contenido de una lección todavía no liberada no debe
-- recibir nada, sin importar lo que muestre la pantalla.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('ca000000-0000-0000-0000-000000000001', 'staff.c@test.cl'),
  ('ca000000-0000-0000-0000-000000000002', 'alumno.c@test.cl');

insert into organizations (id, slug, name) values
  ('0c100000-0000-0000-0000-000000000001', 'instituto-c', 'Instituto C');

insert into memberships (user_id, organization_id, role) values
  ('ca000000-0000-0000-0000-000000000001', '0c100000-0000-0000-0000-000000000001', 'instructor'),
  ('ca000000-0000-0000-0000-000000000002', '0c100000-0000-0000-0000-000000000001', 'student');

-- Cuatro cursos: uno por modo, más uno secuencial.
insert into courses (id, organization_id, slug, title, status, visibility, release_mode, sequential) values
  ('c1100000-0000-0000-0000-00000000000a', '0c100000-0000-0000-0000-000000000001',
   'curso-inmediato', 'Todo abierto', 'published', 'private', 'immediate', false),
  ('c1100000-0000-0000-0000-00000000000b', '0c100000-0000-0000-0000-000000000001',
   'curso-fechas', 'Por fechas', 'published', 'private', 'scheduled', false),
  ('c1100000-0000-0000-0000-00000000000c', '0c100000-0000-0000-0000-000000000001',
   'curso-dias', 'Por días', 'published', 'private', 'relative', false),
  ('c1100000-0000-0000-0000-00000000000d', '0c100000-0000-0000-0000-000000000001',
   'curso-secuencial', 'En orden', 'published', 'private', 'immediate', true);

insert into modules (id, course_id, title, order_index) values
  ('c2100000-0000-0000-0000-00000000000a', 'c1100000-0000-0000-0000-00000000000a', 'M', 1),
  ('c2100000-0000-0000-0000-00000000000b', 'c1100000-0000-0000-0000-00000000000b', 'M', 1),
  ('c2100000-0000-0000-0000-00000000000c', 'c1100000-0000-0000-0000-00000000000c', 'M', 1),
  ('c2100000-0000-0000-0000-00000000000d', 'c1100000-0000-0000-0000-00000000000d', 'M1', 1),
  ('c2100000-0000-0000-0000-00000000000e', 'c1100000-0000-0000-0000-00000000000d', 'M2', 2);

insert into lessons (id, module_id, title, order_index, is_required, unlock_at, unlock_after_days) values
  -- Inmediato: nada restringe.
  ('c3100000-0000-0000-0000-00000000000a', 'c2100000-0000-0000-0000-00000000000a', 'Libre', 1, true, null, null),
  -- Fechas: una ya abierta, una futura.
  ('c3100000-0000-0000-0000-00000000000b', 'c2100000-0000-0000-0000-00000000000b', 'Ya abierta', 1, true, now() - interval '1 day', null),
  ('c3100000-0000-0000-0000-00000000000f', 'c2100000-0000-0000-0000-00000000000b', 'Futura', 2, true, now() + interval '30 days', null),
  -- Días: día 0 y día 7.
  ('c3100000-0000-0000-0000-00000000000c', 'c2100000-0000-0000-0000-00000000000c', 'Día 0', 1, true, null, 0),
  ('c3100000-0000-0000-0000-000000000010', 'c2100000-0000-0000-0000-00000000000c', 'Día 7', 2, true, null, 7),
  -- Secuencial: dos en el módulo 1 y una en el módulo 2, para cruzar módulos.
  ('c3100000-0000-0000-0000-00000000000d', 'c2100000-0000-0000-0000-00000000000d', 'Paso 1', 1, true, null, null),
  ('c3100000-0000-0000-0000-00000000000e', 'c2100000-0000-0000-0000-00000000000d', 'Paso 2', 2, true, null, null),
  ('c3100000-0000-0000-0000-000000000011', 'c2100000-0000-0000-0000-00000000000e', 'Paso 3', 1, true, null, null);

insert into lesson_contents (lesson_id, body)
select id, 'CONTENIDO de ' || title from lessons
where course_id in (
  'c1100000-0000-0000-0000-00000000000a','c1100000-0000-0000-0000-00000000000b',
  'c1100000-0000-0000-0000-00000000000c','c1100000-0000-0000-0000-00000000000d');

insert into enrollments (course_id, student_id, status) values
  ('c1100000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-000000000002', 'active'),
  ('c1100000-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-000000000002', 'active'),
  ('c1100000-0000-0000-0000-00000000000c', 'ca000000-0000-0000-0000-000000000002', 'active'),
  ('c1100000-0000-0000-0000-00000000000d', 'ca000000-0000-0000-0000-000000000002', 'active');

-- Matrícula de hace 3 días, para que el día 7 aún no llegue y el día 0 sí.
update enrollments set enrolled_at = now() - interval '3 days'
where student_id = 'ca000000-0000-0000-0000-000000000002';
commit;

create or replace function test.c_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

-- Comprueba las DOS cosas a la vez: la puerta y el contenido que llega de
-- verdad. Que can_open_lesson diga false pero el contenido llegue igual sería
-- justo el fallo que esto busca.
create or replace function test.c_ok(_label text, _leccion uuid, _abierta boolean) returns void
language plpgsql as $$
declare puerta boolean; filas int;
begin
  puerta := can_open_lesson(_leccion);
  select count(*) into filas from lesson_contents where lesson_id = _leccion;
  if puerta = _abierta and filas = (case when _abierta then 1 else 0 end) then
    raise notice 'OK    % → puerta %, contenido % fila(s)', rpad(_label, 40), puerta, filas;
  else
    raise exception 'FALLA % → esperaba abierta=%, obtuvo puerta=% y % fila(s) de contenido',
      rpad(_label, 40), _abierta, puerta, filas;
  end if;
end $$;

\echo ''
\echo '══ immediate · nada restringe ══════════════════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.c_ok('lección de curso inmediato', 'c3100000-0000-0000-0000-00000000000a', true);
end $$;
rollback;

\echo ''
\echo '══ scheduled · por fecha fija ══════════════════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.c_ok('con fecha pasada: abierta',  'c3100000-0000-0000-0000-00000000000b', true);
  perform test.c_ok('con fecha futura: cerrada',  'c3100000-0000-0000-0000-00000000000f', false);
end $$;
rollback;

\echo ''
\echo '══ relative · por días desde SU matrícula ══════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$ begin
  -- Matriculado hace 3 días.
  perform test.c_ok('día 0: abierta',   'c3100000-0000-0000-0000-00000000000c', true);
  perform test.c_ok('día 7: cerrada',   'c3100000-0000-0000-0000-000000000010', false);
end $$;
rollback;

\echo ''
\echo '══ sequential · en orden, cruzando módulos ═════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.c_ok('paso 1: abierta',                'c3100000-0000-0000-0000-00000000000d', true);
  perform test.c_ok('paso 2: cerrada sin el 1',       'c3100000-0000-0000-0000-00000000000e', false);
  perform test.c_ok('paso 3 (otro módulo): cerrada',  'c3100000-0000-0000-0000-000000000011', false);

  -- Completar el 1 abre el 2, y el 3 sigue cerrado.
  insert into lesson_completions (lesson_id, student_id)
    values ('c3100000-0000-0000-0000-00000000000d', 'ca000000-0000-0000-0000-000000000002');
  perform test.c_ok('tras completar 1: el 2 abre',    'c3100000-0000-0000-0000-00000000000e', true);
  perform test.c_ok('y el 3 sigue cerrado',           'c3100000-0000-0000-0000-000000000011', false);

  -- Completar el 2 abre el 3, que está en el módulo siguiente.
  insert into lesson_completions (lesson_id, student_id)
    values ('c3100000-0000-0000-0000-00000000000e', 'ca000000-0000-0000-0000-000000000002');
  perform test.c_ok('tras completar 2: el 3 abre',    'c3100000-0000-0000-0000-000000000011', true);
end $$;
rollback;

\echo ''
\echo '══ No se puede completar una lección cerrada ═══════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$
declare rechazos int := 0;
begin
  -- Si se pudiera, el bloqueo secuencial se saltaría a sí mismo: completo el
  -- paso 3 sin leerlo y me abro el camino.
  begin
    insert into lesson_completions (lesson_id, student_id)
      values ('c3100000-0000-0000-0000-000000000011', 'ca000000-0000-0000-0000-000000000002');
    raise exception 'FALLA: completó una lección bloqueada por secuencia';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  begin
    insert into lesson_completions (lesson_id, student_id)
      values ('c3100000-0000-0000-0000-00000000000f', 'ca000000-0000-0000-0000-000000000002');
    raise exception 'FALLA: completó una lección bloqueada por fecha';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  if rechazos <> 2 then
    raise exception 'FALLA: se rechazaron % de 2', rechazos;
  end if;
  raise notice 'OK    completar lecciones cerradas: 2 rechazos';
end $$;
rollback;

\echo ''
\echo '══ El staff ve todo, sin importar el modo ══════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000001');
do $$ begin
  perform test.c_ok('fecha futura, para el instructor', 'c3100000-0000-0000-0000-00000000000f', true);
  perform test.c_ok('día 7, para el instructor',        'c3100000-0000-0000-0000-000000000010', true);
  perform test.c_ok('paso 3, para el instructor',       'c3100000-0000-0000-0000-000000000011', true);
end $$;
rollback;

\echo ''
\echo '══ La vista explica sin decidir ════════════════════════════════════════'
begin;
set local role authenticated;
select test.c_as('ca000000-0000-0000-0000-000000000002');
do $$
declare r record; n int;
begin
  select is_open, reason, opens_at is not null as tiene_fecha into r
  from my_lesson_availability where lesson_id = 'c3100000-0000-0000-0000-00000000000f';
  if r.is_open or r.reason <> 'fecha' or not r.tiene_fecha then
    raise exception 'FALLA: la vista dice is_open=%, reason=%, fecha=%', r.is_open, r.reason, r.tiene_fecha;
  end if;
  raise notice 'OK    lección futura: reason=fecha y trae opens_at';

  select reason into r from my_lesson_availability
  where lesson_id = 'c3100000-0000-0000-0000-000000000010';
  if r.reason <> 'dias' then
    raise exception 'FALLA: se esperaba reason=dias, llegó %', r.reason;
  end if;
  raise notice 'OK    lección por días: reason=dias';

  -- La vista no puede mostrar más lecciones que las visibles: hereda RLS.
  select count(*) into n from my_lesson_availability
  where course_id = 'c1100000-0000-0000-0000-00000000000d';
  if n <> 3 then
    raise exception 'FALLA: la vista muestra % lecciones del curso secuencial, esperaba 3', n;
  end if;
  raise notice 'OK    la vista hereda la visibilidad del temario';
end $$;
rollback;

\echo ''
\echo '── Modos de entrega verificados ──'
