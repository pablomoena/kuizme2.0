-- ============================================================================
-- D11 · Las dos vías de matrícula, y lo que el alumno NO puede hacer
-- ============================================================================
-- Lo interesante no es que un alumno pueda matricularse en un curso gratis. Es
-- todo lo que no puede hacer de paso: ponerse una nota, marcarse el curso
-- completado, entrar gratis en uno de pago, o aprobar su propia solicitud.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('ba000000-0000-0000-0000-000000000001', 'staff.m@test.cl'),
  ('ba000000-0000-0000-0000-000000000002', 'alumno.m@test.cl'),
  ('ba000000-0000-0000-0000-000000000003', 'ajeno.m@test.cl'),
  ('ba000000-0000-0000-0000-000000000004', 'soporte.m@test.cl');

insert into organizations (id, slug, name) values
  ('0a200000-0000-0000-0000-000000000001', 'instituto-m', 'Instituto M'),
  ('0a200000-0000-0000-0000-000000000002', 'instituto-otro', 'Otro Instituto');

insert into memberships (user_id, organization_id, role) values
  ('ba000000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-000000000001', 'org_admin'),
  ('ba000000-0000-0000-0000-000000000002', '0a200000-0000-0000-0000-000000000001', 'student'),
  ('ba000000-0000-0000-0000-000000000003', '0a200000-0000-0000-0000-000000000002', 'student');

-- Soporte de plataforma: PUEDE leer las solicitudes (request_read) pero no tiene
-- política de UPDATE. Es el único rol que llega a un UPDATE que afecta cero filas
-- en silencio, y por eso es el que hace verificable la comprobación de filas de
-- approve_enrollment_request. Con el alumno no se alcanza: su política viola
-- `with check` y lanza error antes.
insert into platform_admins (user_id, role) values
  ('ba000000-0000-0000-0000-000000000004', 'support');

insert into courses (id, organization_id, slug, title, status, visibility) values
  ('a1200000-0000-0000-0000-00000000000a', '0a200000-0000-0000-0000-000000000001',
   'curso-gratis', 'Gratis y publicado', 'published', 'public'),
  ('a1200000-0000-0000-0000-00000000000b', '0a200000-0000-0000-0000-000000000001',
   'curso-pago', 'De pago', 'published', 'public'),
  ('a1200000-0000-0000-0000-00000000000c', '0a200000-0000-0000-0000-000000000001',
   'curso-sin-precio', 'Sin fila de precio', 'published', 'public'),
  ('a1200000-0000-0000-0000-00000000000d', '0a200000-0000-0000-0000-000000000001',
   'curso-gratis-borrador', 'Gratis pero en borrador', 'draft', 'public'),
  -- Segundo curso gratis: los intentos indebidos van contra ESTE, para que lo
  -- único que pueda rechazarlos sean las guardas de nota, estado y fecha. Con el
  -- curso sin precio, los rechazaba can_self_enroll y la prueba pasaba por el
  -- motivo equivocado: quitar las guardas no la hacía fallar.
  ('a1200000-0000-0000-0000-00000000000e', '0a200000-0000-0000-0000-000000000001',
   'curso-gratis-2', 'Otro gratis y publicado', 'published', 'public');

insert into course_pricing (course_id, kind, amount_cents) values
  ('a1200000-0000-0000-0000-00000000000a', 'free', null),
  ('a1200000-0000-0000-0000-00000000000b', 'one_time', 4990000),
  ('a1200000-0000-0000-0000-00000000000d', 'free', null),
  ('a1200000-0000-0000-0000-00000000000e', 'free', null);
-- curso-sin-precio queda a propósito sin fila.
commit;

create or replace function test.m_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.m_ok(_label text, _got text, _want text) returns void
language plpgsql as $$
begin
  if _got = _want then
    raise notice 'OK    % → %', rpad(_label, 48), _got;
  else
    raise exception 'FALLA % → esperaba "%", obtuvo "%"', rpad(_label, 48), _want, _got;
  end if;
end $$;

\echo ''
\echo '══ can_self_enroll: solo gratis, publicado y con precio explícito ═══════'
begin;
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.m_ok('gratis y publicado',
    can_self_enroll('a1200000-0000-0000-0000-00000000000a')::text, 'true');
  perform test.m_ok('de pago',
    can_self_enroll('a1200000-0000-0000-0000-00000000000b')::text, 'false');
  -- La ausencia de precio no es "gratis": tiene que ser una decisión explícita.
  perform test.m_ok('sin fila de precio',
    can_self_enroll('a1200000-0000-0000-0000-00000000000c')::text, 'false');
  perform test.m_ok('gratis pero en borrador',
    can_self_enroll('a1200000-0000-0000-0000-00000000000d')::text, 'false');
end $$;
rollback;

\echo ''
\echo '══ Un alumno de OTRA institución no se matricula acá ═══════════════════'
begin;
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000003');
do $$ begin
  perform test.m_ok('curso gratis de otra institución',
    can_self_enroll('a1200000-0000-0000-0000-00000000000a')::text, 'false');
end $$;
rollback;

\echo ''
\echo '══ Se matricula solo, y NADA más ══════════════════════════════════════'
begin;
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000002');
do $$
declare rechazos int := 0;
begin
  insert into enrollments (course_id, student_id, status)
    values ('a1200000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-000000000002', 'active');
  perform test.m_ok('matriculado en el curso gratis',
    (select status::text from enrollments
      where course_id = 'a1200000-0000-0000-0000-00000000000a'
        and student_id = 'ba000000-0000-0000-0000-000000000002'), 'active');

  -- Con nota puesta.
  begin
    insert into enrollments (course_id, student_id, status, final_grade)
      values ('a1200000-0000-0000-0000-00000000000e', 'ba000000-0000-0000-0000-000000000002', 'active', 7.0);
    raise exception 'FALLA: se matriculó con una nota puesta';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  -- Marcándose el curso como completado.
  begin
    insert into enrollments (course_id, student_id, status, completed_at)
      values ('a1200000-0000-0000-0000-00000000000e', 'ba000000-0000-0000-0000-000000000002', 'completed', now());
    raise exception 'FALLA: se matriculó marcando el curso completado';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  -- En el curso de PAGO.
  begin
    insert into enrollments (course_id, student_id, status)
      values ('a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002', 'active');
    raise exception 'FALLA: se matriculó gratis en un curso de pago';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  -- A nombre de otro.
  begin
    insert into enrollments (course_id, student_id, status)
      values ('a1200000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-000000000003', 'active');
    raise exception 'FALLA: matriculó a otra persona';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  perform test.m_ok('intentos indebidos rechazados', rechazos::text, '4');
  -- Y que no haya quedado ninguna matrícula de los intentos.
  perform test.m_ok('matrículas del alumno tras los intentos',
    (select count(*)::text from enrollments
      where student_id = 'ba000000-0000-0000-0000-000000000002'), '1');
end $$;
rollback;

\echo ''
\echo '══ Puede darse de baja, pero no ponerse nota al hacerlo ════════════════'
begin;
insert into enrollments (course_id, student_id, status) values
  ('a1200000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-000000000002', 'active');
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000002');
do $$
declare filas int;
begin
  update enrollments set status = 'cancelled'
   where course_id = 'a1200000-0000-0000-0000-00000000000a'
     and student_id = 'ba000000-0000-0000-0000-000000000002';
  perform test.m_ok('se dio de baja',
    (select status::text from enrollments
      where course_id = 'a1200000-0000-0000-0000-00000000000a'
        and student_id = 'ba000000-0000-0000-0000-000000000002'), 'cancelled');

  -- Y no puede aprobarse a sí mismo por la vía del update.
  update enrollments set status = 'completed', final_grade = 7.0
   where student_id = 'ba000000-0000-0000-0000-000000000002';
  get diagnostics filas = row_count;
  perform test.m_ok('aprobarse por update no afecta filas', filas::text, '0');
end $$;
rollback;

\echo ''
\echo '══ Solicitudes: el alumno pide, la institución resuelve ════════════════'
begin;
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000002');
do $$
declare rechazos int := 0;
begin
  insert into enrollment_requests (course_id, student_id, message)
    values ('a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002',
            'Me interesa, ¿hay beca?');
  perform test.m_ok('solicitud creada, pendiente',
    (select status::text from enrollment_requests
      where course_id = 'a1200000-0000-0000-0000-00000000000b'), 'pending');
  perform test.m_ok('organización derivada por trigger',
    (select (organization_id = '0a200000-0000-0000-0000-000000000001')::text
      from enrollment_requests where course_id = 'a1200000-0000-0000-0000-00000000000b'), 'true');

  -- Dos veces no: el índice parcial lo impide.
  begin
    insert into enrollment_requests (course_id, student_id)
      values ('a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002');
    raise exception 'FALLA: creó dos solicitudes pendientes del mismo curso';
  exception when unique_violation then rechazos := rechazos + 1;
  end;

  -- Aprobarse a sí mismo, por update directo. Se captura SOLO la negación
  -- esperada: un `when others` habría capturado también el propio raise de
  -- fallo, y la prueba habría contado el agujero como si fuera un rechazo.
  begin
    update enrollment_requests set status = 'approved', resolved_at = now()
     where student_id = 'ba000000-0000-0000-0000-000000000002';
    -- Si no lanzó, hay que mirar el efecto: RLS puede no afectar filas en
    -- silencio, y eso también sería correcto.
    if (select status::text from enrollment_requests
         where course_id = 'a1200000-0000-0000-0000-00000000000b') = 'approved' then
      raise exception 'FALLA: el alumno aprobó su propia solicitud por update';
    end if;
    rechazos := rechazos + 1;
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  -- Y por la función.
  begin
    perform approve_enrollment_request(
      (select id from enrollment_requests where course_id = 'a1200000-0000-0000-0000-00000000000b'));
    raise exception 'FALLA: el alumno aprobó su solicitud por la función';
  exception when insufficient_privilege then rechazos := rechazos + 1;
  end;

  perform test.m_ok('intentos de auto-aprobación rechazados', rechazos::text, '3');
  -- Lo que de verdad importa es el efecto: la solicitud sigue pendiente y no
  -- apareció ninguna matrícula. Contar errores no basta — un error puede venir
  -- de otro sitio y la prueba pasaría por el motivo equivocado.
  perform test.m_ok('la solicitud siguió pendiente',
    (select status::text from enrollment_requests
      where course_id = 'a1200000-0000-0000-0000-00000000000b'), 'pending');
  perform test.m_ok('y no se creó matrícula en el curso de pago',
    (select count(*)::text from enrollments
      where course_id = 'a1200000-0000-0000-0000-00000000000b'
        and student_id = 'ba000000-0000-0000-0000-000000000002'), '0');
end $$;
rollback;

\echo ''
\echo '══ El alumno no aprueba su solicitud ni en un curso GRATIS ═════════════'
-- Este caso existe porque el de pago no bastaba. Ahí, quitar la comprobación de
-- filas de approve_enrollment_request no cambiaba nada: el insert final lo
-- bloqueaba can_self_enroll igual. En un curso gratis el insert SÍ pasaría, así
-- que lo único que impide que la función informe un éxito falso —solicitud
-- pendiente para alguien ya matriculado— es esa comprobación.
begin;
insert into enrollment_requests (id, course_id, student_id)
  values ('a4200000-0000-0000-0000-00000000000f',
          'a1200000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000002');
do $$ begin
  begin
    perform approve_enrollment_request('a4200000-0000-0000-0000-00000000000f');
    raise exception 'FALLA: el alumno aprobó su solicitud de un curso gratis';
  exception when insufficient_privilege then
    perform test.m_ok('rechazado en curso gratis', 'rechazado', 'rechazado');
  end;

  perform test.m_ok('la solicitud siguió pendiente',
    (select status::text from enrollment_requests
      where id = 'a4200000-0000-0000-0000-00000000000f'), 'pending');
  perform test.m_ok('y no quedó matrícula creada por la función',
    (select count(*)::text from enrollments
      where course_id = 'a1200000-0000-0000-0000-00000000000a'
        and student_id = 'ba000000-0000-0000-0000-000000000002'), '0');
end $$;
rollback;

\echo ''
\echo '══ Soporte de plataforma: falla fuerte, no en silencio ═════════════════'
begin;
insert into enrollment_requests (id, course_id, student_id)
  values ('a4200000-0000-0000-0000-000000000010',
          'a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000004');
do $$ begin
  -- Ve la solicitud pero no puede resolverla. Sin la comprobación de filas, la
  -- función informaría éxito habiendo dejado la solicitud pendiente.
  perform test.m_ok('soporte ve la solicitud',
    (select count(*)::text from enrollment_requests
      where id = 'a4200000-0000-0000-0000-000000000010'), '1');
  begin
    perform approve_enrollment_request('a4200000-0000-0000-0000-000000000010');
    raise exception 'FALLA: la función informó éxito sin aprobar nada';
  exception when insufficient_privilege then
    perform test.m_ok('rechazado con error explícito', 'rechazado', 'rechazado');
  end;
  perform test.m_ok('la solicitud siguió pendiente',
    (select status::text from enrollment_requests
      where id = 'a4200000-0000-0000-0000-000000000010'), 'pending');
end $$;
rollback;

\echo ''
\echo '══ La institución aprueba: solicitud y matrícula, juntas ═══════════════'
begin;
insert into enrollment_requests (id, course_id, student_id)
  values ('a4200000-0000-0000-0000-000000000001',
          'a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000001');
do $$
declare e uuid;
begin
  e := approve_enrollment_request('a4200000-0000-0000-0000-000000000001');
  perform test.m_ok('solicitud aprobada',
    (select status::text from enrollment_requests where id = 'a4200000-0000-0000-0000-000000000001'), 'approved');
  perform test.m_ok('y quedó registrado quién la resolvió',
    (select (resolved_by = 'ba000000-0000-0000-0000-000000000001' and resolved_at is not null)::text
      from enrollment_requests where id = 'a4200000-0000-0000-0000-000000000001'), 'true');
  perform test.m_ok('matrícula creada en el mismo paso',
    (select status::text from enrollments where id = e), 'active');
  perform test.m_ok('y es del curso y alumno correctos',
    (select (course_id = 'a1200000-0000-0000-0000-00000000000b'
             and student_id = 'ba000000-0000-0000-0000-000000000002')::text
      from enrollments where id = e), 'true');

  -- Aprobar dos veces no crea dos matrículas.
  begin
    perform approve_enrollment_request('a4200000-0000-0000-0000-000000000001');
    raise exception 'FALLA: aprobó una solicitud ya resuelta';
  exception when check_violation then
    perform test.m_ok('no se aprueba dos veces', 'rechazado', 'rechazado');
  end;
end $$;
rollback;

\echo ''
\echo '══ Rechazar exige motivo ══════════════════════════════════════════════'
begin;
insert into enrollment_requests (id, course_id, student_id)
  values ('a4200000-0000-0000-0000-000000000002',
          'a1200000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-000000000002');
set local role authenticated;
select test.m_as('ba000000-0000-0000-0000-000000000001');
do $$ begin
  -- Sin motivo, el CHECK lo impide: una decisión sobre una persona sin motivo
  -- registrado no se puede explicar después (mismo criterio que D5).
  begin
    update enrollment_requests set status = 'rejected', resolved_at = now()
     where id = 'a4200000-0000-0000-0000-000000000002';
    raise exception 'FALLA: rechazó sin motivo';
  exception when check_violation then
    perform test.m_ok('rechazo sin motivo bloqueado', 'rechazado', 'rechazado');
  end;

  update enrollment_requests
     set status = 'rejected', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'El curso ya cerró su cupo este semestre.'
   where id = 'a4200000-0000-0000-0000-000000000002';
  perform test.m_ok('con motivo, se rechaza',
    (select status::text from enrollment_requests where id = 'a4200000-0000-0000-0000-000000000002'), 'rejected');
end $$;
rollback;

\echo ''
\echo '── Matrícula verificada ──'
