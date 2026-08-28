-- ============================================================================
-- D12 · Inscripción abierta, plazo y cupo
-- ============================================================================
-- Las tres columnas existían en la v1 y ninguna funcionaba: enrollment_open se
-- escribía fija en true, enrollment_deadline no se referenciaba en ninguna parte,
-- y max_students se guardaba sin que nada impidiera pasarse.
--
-- Se prueban las dos reglas distintas: abierta/plazo gobiernan solo la
-- auto-matrícula (la institución puede admitir tarde), y el cupo gobierna a
-- todos, institución incluida.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('ea100000-0000-0000-0000-000000000001', 'staff.i@test.cl'),
  ('ea100000-0000-0000-0000-000000000002', 'alumno.i1@test.cl'),
  ('ea100000-0000-0000-0000-000000000003', 'alumno.i2@test.cl'),
  ('ea100000-0000-0000-0000-000000000004', 'alumno.i3@test.cl');

insert into organizations (id, slug, name) values
  ('0e200000-0000-0000-0000-000000000001', 'instituto-i', 'Instituto I');

insert into memberships (user_id, organization_id, role) values
  ('ea100000-0000-0000-0000-000000000001', '0e200000-0000-0000-0000-000000000001', 'org_admin'),
  ('ea100000-0000-0000-0000-000000000002', '0e200000-0000-0000-0000-000000000001', 'student'),
  ('ea100000-0000-0000-0000-000000000003', '0e200000-0000-0000-0000-000000000001', 'student'),
  ('ea100000-0000-0000-0000-000000000004', '0e200000-0000-0000-0000-000000000001', 'student');

insert into courses (id, organization_id, slug, title, status, visibility,
                     enrollment_open, enrollment_deadline, max_students) values
  ('e1200000-0000-0000-0000-00000000000a', '0e200000-0000-0000-0000-000000000001',
   'abierto', 'Abierto sin límites', 'published', 'public', true, null, null),
  ('e1200000-0000-0000-0000-00000000000b', '0e200000-0000-0000-0000-000000000001',
   'cerrado', 'Inscripción cerrada', 'published', 'public', false, null, null),
  ('e1200000-0000-0000-0000-00000000000c', '0e200000-0000-0000-0000-000000000001',
   'vencido', 'Plazo vencido', 'published', 'public', true, now() - interval '1 day', null),
  ('e1200000-0000-0000-0000-00000000000d', '0e200000-0000-0000-0000-000000000001',
   'cupo-uno', 'Cupo de uno', 'published', 'public', true, null, 1);

insert into course_pricing (course_id, kind) values
  ('e1200000-0000-0000-0000-00000000000a', 'free'),
  ('e1200000-0000-0000-0000-00000000000b', 'free'),
  ('e1200000-0000-0000-0000-00000000000c', 'free'),
  ('e1200000-0000-0000-0000-00000000000d', 'free');
commit;

create or replace function test.i_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.i_ok(_label text, _got text, _want text) returns void
language plpgsql as $$
begin
  if _got is not distinct from _want then
    raise notice 'OK    % → %', rpad(_label, 46), coalesce(_got, 'null');
  else
    raise exception 'FALLA % → esperaba "%", obtuvo "%"', rpad(_label, 46),
      coalesce(_want, 'null'), coalesce(_got, 'null');
  end if;
end $$;

\echo ''
\echo '══ El motivo del bloqueo, no solo un sí/no ═════════════════════════════'
begin;
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000002');
do $$ begin
  perform test.i_ok('curso abierto',        self_enroll_blocker('e1200000-0000-0000-0000-00000000000a'), null);
  perform test.i_ok('inscripción cerrada',  self_enroll_blocker('e1200000-0000-0000-0000-00000000000b'), 'cerrada');
  perform test.i_ok('plazo vencido',        self_enroll_blocker('e1200000-0000-0000-0000-00000000000c'), 'plazo-vencido');
  perform test.i_ok('cupo libre todavía',   self_enroll_blocker('e1200000-0000-0000-0000-00000000000d'), null);
end $$;
rollback;

\echo ''
\echo '══ La política aplica esos motivos, no solo la pantalla ════════════════'
begin;
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000002');
do $$
declare
  rechazos int := 0;
  curso uuid;
begin
  foreach curso in array array[
    'e1200000-0000-0000-0000-00000000000b',   -- inscripción cerrada
    'e1200000-0000-0000-0000-00000000000c'    -- plazo vencido
  ]::uuid[] loop
    begin
      insert into enrollments (course_id, student_id, status)
        values (curso, 'ea100000-0000-0000-0000-000000000002', 'active');
      raise exception 'FALLA: se auto-matriculó en el curso bloqueado %', curso;
    exception when insufficient_privilege then rechazos := rechazos + 1;
    end;
  end loop;
  perform test.i_ok('cerrada y plazo vencido rechazan', rechazos::text, '2');
end $$;
rollback;

\echo ''
\echo '══ La institución SÍ puede admitir fuera de plazo ══════════════════════'
begin;
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000001');
do $$ begin
  -- Una admisión tardía o un convenio no deberían exigir reabrir el curso para
  -- todos. Por eso abierta/plazo solo gobiernan la auto-matrícula.
  insert into enrollments (course_id, student_id, status)
    values ('e1200000-0000-0000-0000-00000000000c', 'ea100000-0000-0000-0000-000000000002', 'active');
  perform test.i_ok('matriculó en curso con plazo vencido',
    (select status::text from enrollments
      where course_id = 'e1200000-0000-0000-0000-00000000000c'), 'active');

  insert into enrollments (course_id, student_id, status)
    values ('e1200000-0000-0000-0000-00000000000b', 'ea100000-0000-0000-0000-000000000003', 'active');
  perform test.i_ok('y en curso con inscripción cerrada',
    (select status::text from enrollments
      where course_id = 'e1200000-0000-0000-0000-00000000000b'), 'active');
end $$;
rollback;

\echo ''
\echo '══ El cupo gobierna a TODOS, institución incluida ══════════════════════'
begin;
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000001');
do $$ begin
  insert into enrollments (course_id, student_id, status)
    values ('e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000002', 'active');
  perform test.i_ok('primer alumno entra',
    (select count(*)::text from enrollments
      where course_id = 'e1200000-0000-0000-0000-00000000000d' and status = 'active'), '1');

  -- Un cupo es capacidad, no una regla sobre quién pide. Si hace falta más, se
  -- sube el cupo, y eso queda como un cambio explícito.
  begin
    insert into enrollments (course_id, student_id, status)
      values ('e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000003', 'active');
    raise exception 'FALLA: la institución se pasó del cupo';
  exception when check_violation then
    perform test.i_ok('la institución no se pasa del cupo', 'rechazado', 'rechazado');
  end;

  perform test.i_ok('y el alumno ve el motivo',
    self_enroll_blocker('e1200000-0000-0000-0000-00000000000d'), 'cupo-lleno');
end $$;
rollback;

\echo ''
\echo '══ Quien termina o se da de baja libera el cupo ════════════════════════'
begin;
insert into enrollments (course_id, student_id, status)
  values ('e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000002', 'active');
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000001');
do $$ begin
  update enrollments set status = 'completed'
   where course_id = 'e1200000-0000-0000-0000-00000000000d';
  perform test.i_ok('tras completar, el cupo se libera',
    self_enroll_blocker('e1200000-0000-0000-0000-00000000000d'), null);

  insert into enrollments (course_id, student_id, status)
    values ('e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000003', 'active');
  perform test.i_ok('y entra otro alumno',
    (select count(*)::text from enrollments
      where course_id = 'e1200000-0000-0000-0000-00000000000d' and status = 'active'), '1');

  -- Reactivar al primero volvería a pasarse: el trigger también cubre el UPDATE.
  begin
    update enrollments set status = 'active'
     where course_id = 'e1200000-0000-0000-0000-00000000000d'
       and student_id = 'ea100000-0000-0000-0000-000000000002';
    raise exception 'FALLA: reactivar una matrícula se pasó del cupo';
  exception when check_violation then
    perform test.i_ok('reactivar con cupo lleno se rechaza', 'rechazado', 'rechazado');
  end;
end $$;
rollback;

\echo ''
\echo '══ Aprobar una solicitud respeta el cupo ══════════════════════════════'
begin;
insert into enrollments (course_id, student_id, status)
  values ('e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000002', 'active');
insert into enrollment_requests (id, course_id, student_id)
  values ('e4200000-0000-0000-0000-000000000001',
          'e1200000-0000-0000-0000-00000000000d', 'ea100000-0000-0000-0000-000000000003');
set local role authenticated;
select test.i_as('ea100000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform approve_enrollment_request('e4200000-0000-0000-0000-000000000001');
    raise exception 'FALLA: aprobó una solicitud con el cupo lleno';
  exception when check_violation then
    perform test.i_ok('aprobación con cupo lleno rechazada', 'rechazado', 'rechazado');
  end;
end $$;
rollback;

\echo ''
\echo '── Controles de inscripción verificados ──'
