-- ============================================================================
-- D9 · Completar exige poder estudiar, y el progreso tiene una sola definición
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('fa000000-0000-0000-0000-000000000001', 'staff.p@test.cl'),
  ('fa000000-0000-0000-0000-000000000002', 'matriculado.p@test.cl'),
  ('fa000000-0000-0000-0000-000000000003', 'suelto.p@test.cl');

insert into organizations (id, slug, name) values
  ('0f100000-0000-0000-0000-000000000001', 'instituto-p', 'Instituto P');

insert into memberships (user_id, organization_id, role) values
  ('fa000000-0000-0000-0000-000000000001', '0f100000-0000-0000-0000-000000000001', 'org_admin'),
  ('fa000000-0000-0000-0000-000000000002', '0f100000-0000-0000-0000-000000000001', 'student'),
  ('fa000000-0000-0000-0000-000000000003', '0f100000-0000-0000-0000-000000000001', 'student');

insert into courses (id, organization_id, slug, title, status, visibility) values
  ('f1100000-0000-0000-0000-000000000001', '0f100000-0000-0000-0000-000000000001',
   'curso-con-progreso', 'Con progreso', 'published', 'private'),
  ('f1100000-0000-0000-0000-000000000002', '0f100000-0000-0000-0000-000000000001',
   'curso-borrador-p', 'Borrador', 'draft', 'private');

insert into modules (id, course_id, title) values
  ('f2100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'M1'),
  ('f2100000-0000-0000-0000-000000000002', 'f1100000-0000-0000-0000-000000000002', 'M2');

-- Tres obligatorias y una opcional: así se comprueba que el denominador son las
-- obligatorias y no el total de lecciones.
insert into lessons (id, module_id, title, is_required) values
  ('f3100000-0000-0000-0000-000000000001', 'f2100000-0000-0000-0000-000000000001', 'Oblig 1', true),
  ('f3100000-0000-0000-0000-000000000002', 'f2100000-0000-0000-0000-000000000001', 'Oblig 2', true),
  ('f3100000-0000-0000-0000-000000000003', 'f2100000-0000-0000-0000-000000000001', 'Oblig 3', true),
  ('f3100000-0000-0000-0000-000000000004', 'f2100000-0000-0000-0000-000000000001', 'Opcional', false),
  ('f3100000-0000-0000-0000-00000000000b', 'f2100000-0000-0000-0000-000000000002', 'Del borrador', true);

insert into enrollments (course_id, student_id, status) values
  ('f1100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002', 'active');
commit;

create or replace function test.p_ok(_label text, _got text, _want text) returns void
language plpgsql as $$
begin
  if _got = _want then
    raise notice 'OK    % → %', rpad(_label, 46), _got;
  else
    raise exception 'FALLA % → esperaba "%", obtuvo "%"', rpad(_label, 46), _want, _got;
  end if;
end $$;

create or replace function test.p_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

\echo ''
\echo '══ El alumno SIN matrícula no puede fabricar progreso ══════════════════'
begin;
set local role authenticated;
select test.p_as('fa000000-0000-0000-0000-000000000003');
do $$
declare rechazos int := 0;
begin
  -- Ni en un curso publicado donde no está matriculado…
  begin
    insert into lesson_completions (lesson_id, student_id)
      values ('f3100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000003');
    raise exception 'FALLA: marcó completada una lección sin matrícula';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  -- …ni en un curso en borrador.
  begin
    insert into lesson_completions (lesson_id, student_id)
      values ('f3100000-0000-0000-0000-00000000000b', 'fa000000-0000-0000-0000-000000000003');
    raise exception 'FALLA: marcó completada una lección de un borrador';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  perform test.p_ok('inserciones sin matrícula rechazadas', rechazos::text, '2');
  perform test.p_ok('completadas que quedó teniendo',
    (select count(*) from lesson_completions)::text, '0');
end $$;
rollback;

\echo ''
\echo '══ Nadie puede marcar completada una lección a nombre de otro ══════════'
begin;
set local role authenticated;
select test.p_as('fa000000-0000-0000-0000-000000000002');
do $$
begin
  begin
    insert into lesson_completions (lesson_id, student_id)
      values ('f3100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000003');
    raise exception 'FALLA: registró progreso a nombre de otro alumno';
  exception when insufficient_privilege then
    perform test.p_ok('inserción a nombre de otro rechazada', 'rechazada', 'rechazada');
  end;
end $$;
rollback;

\echo ''
\echo '══ El progreso: una sola definición, denominador visible ═══════════════'
begin;
set local role authenticated;
select test.p_as('fa000000-0000-0000-0000-000000000002');
do $$
declare t int; c int; p int;
begin
  select total, completed, percent into t, c, p
    from my_course_progress where course_id = 'f1100000-0000-0000-0000-000000000001';
  perform test.p_ok('total = obligatorias, no todas', t::text, '3');
  perform test.p_ok('completadas al empezar', c::text, '0');
  perform test.p_ok('porcentaje al empezar', p::text, '0');

  insert into lesson_completions (lesson_id, student_id)
    values ('f3100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002');

  select total, completed, percent into t, c, p
    from my_course_progress where course_id = 'f1100000-0000-0000-0000-000000000001';
  perform test.p_ok('una de tres', c || '/' || t || ' = ' || p || '%', '1/3 = 33%');

  -- La opcional NO mueve el progreso: si lo hiciera, el porcentaje pasaría de 100.
  insert into lesson_completions (lesson_id, student_id)
    values ('f3100000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000002');
  select total, completed, percent into t, c, p
    from my_course_progress where course_id = 'f1100000-0000-0000-0000-000000000001';
  perform test.p_ok('la opcional no cuenta', c || '/' || t || ' = ' || p || '%', '1/3 = 33%');

  insert into lesson_completions (lesson_id, student_id) values
    ('f3100000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002'),
    ('f3100000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000002');
  select total, completed, percent into t, c, p
    from my_course_progress where course_id = 'f1100000-0000-0000-0000-000000000001';
  perform test.p_ok('curso completo', c || '/' || t || ' = ' || p || '%', '3/3 = 100%');

  -- Deshacer un clic equivocado.
  delete from lesson_completions
   where lesson_id = 'f3100000-0000-0000-0000-000000000003'
     and student_id = 'fa000000-0000-0000-0000-000000000002';
  select completed, percent into c, p
    from my_course_progress where course_id = 'f1100000-0000-0000-0000-000000000001';
  perform test.p_ok('se puede deshacer', c || ' = ' || p || '%', '2 = 67%');
end $$;
rollback;

\echo ''
\echo '══ El progreso de cada uno es el suyo ═════════════════════════════════'
begin;
insert into lesson_completions (lesson_id, student_id)
  values ('f3100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.p_as('fa000000-0000-0000-0000-000000000003');
do $$
declare c int;
begin
  -- El alumno suelto ve el curso solo si es de catálogo; acá es privado, así que
  -- ni la fila de progreso le llega. Lo que importa: no hereda el avance de otro.
  select coalesce(sum(completed), 0) into c from my_course_progress;
  perform test.p_ok('no ve el avance de otro alumno', c::text, '0');
end $$;
rollback;

\echo ''
\echo '── Progreso verificado ──'
