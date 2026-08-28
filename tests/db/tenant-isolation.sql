-- ============================================================================
-- Suite de aislamiento entre tenants
-- ============================================================================
-- Es el activo más importante del proyecto. Siembra DOS organizaciones con sus
-- propios usuarios y comprueba, tabla por tabla y con sesiones reales, que el
-- tenant A no puede leer, escribir ni borrar nada del tenant B.
--
-- Las sesiones son de verdad: `set local role authenticated` más el claim `sub`
-- del JWT, que es exactamente cómo Supabase evalúa auth.uid(). No se prueba la
-- intención de las políticas, se prueba su efecto.
--
-- Esto es lo que la v1 nunca tuvo, y por eso sus tres fallas P0 vivieron meses
-- sin que nadie las viera.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ── Semilla ────────────────────────────────────────────────────────────────
-- Se usa el rol dueño (omite RLS) solo para sembrar; las pruebas cambian de rol.
begin;

insert into auth.users (id, email) values
  ('aa000000-0000-0000-0000-000000000001', 'admin.a@test.cl'),
  ('aa000000-0000-0000-0000-000000000002', 'alumno.a@test.cl'),
  ('bb000000-0000-0000-0000-000000000001', 'admin.b@test.cl'),
  ('bb000000-0000-0000-0000-000000000002', 'alumno.b@test.cl'),
  ('cc000000-0000-0000-0000-000000000001', 'intruso@test.cl');

insert into organizations (id, slug, name) values
  ('0a000000-0000-0000-0000-000000000001', 'instituto-a', 'Instituto A'),
  ('0b000000-0000-0000-0000-000000000001', 'instituto-b', 'Instituto B');

insert into memberships (user_id, organization_id, role) values
  ('aa000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'org_admin'),
  ('aa000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000001', 'student'),
  ('bb000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'org_admin'),
  ('bb000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000001', 'student');
-- El intruso está autenticado pero no pertenece a ninguna organización.

insert into courses (id, organization_id, slug, title, status) values
  ('1a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'curso-a', 'Curso de A', 'published'),
  ('1b000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'curso-b', 'Curso de B', 'published');

insert into modules (id, course_id, title) values
  ('2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'Módulo A'),
  ('2b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'Módulo B');

insert into lessons (id, module_id, title) values
  ('3a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'Lección A'),
  ('3b000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', 'Lección B');

insert into question_banks (id, organization_id, title) values
  ('4a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'Banco A'),
  ('4b000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'Banco B');

insert into questions (id, bank_id, kind, prompt) values
  ('5a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 'true_false', 'Pregunta de A'),
  ('5b000000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-000000000001', 'true_false', 'Pregunta de B');

insert into question_keys (question_id, answer) values
  ('5a000000-0000-0000-0000-000000000001', '{"value":true}'),
  ('5b000000-0000-0000-0000-000000000001', '{"value":false}');

insert into exams (id, organization_id, course_id, title, status) values
  ('6a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'Examen A', 'published'),
  ('6b000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'Examen B', 'published');

insert into exam_attempts (id, exam_id, student_id, attempt_number, status, score, submitted_at) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', 1, 'graded', 55, now()),
  ('7b000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000002', 1, 'graded', 88, now());

commit;

-- ── Utilidades ─────────────────────────────────────────────────────────────
create or replace function test.test_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

-- Cuenta filas visibles de una tabla para el usuario actual.
create or replace function test.visible_count(_table text) returns bigint
language plpgsql as $$
declare _n bigint;
begin
  execute format('select count(*) from public.%I', _table) into _n;
  return _n;
end $$;

create or replace function test.expect_count(_table text, _expected bigint, _label text)
returns void language plpgsql as $$
declare _n bigint;
begin
  _n := test.visible_count(_table);
  if _n <> _expected then
    raise exception 'FALLO [%]: % ve % filas en %, esperaba %',
      _label, _label, _n, _table, _expected;
  end if;
  -- raise notice usa % como marcador simple: no admite %-34s, así que el
  -- alineado se hace con rpad.
  raise notice 'OK  % % ve % fila(s)', rpad(_table, 22), rpad(_label, 9), _n;
end $$;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' El admin del Instituto A solo ve lo suyo'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('aa000000-0000-0000-0000-000000000001');
select test.expect_count('organizations',   1, 'admin A');
select test.expect_count('courses',         1, 'admin A');
select test.expect_count('modules',         1, 'admin A');
select test.expect_count('lessons',         1, 'admin A');
select test.expect_count('question_banks',  1, 'admin A');
select test.expect_count('questions',       1, 'admin A');
select test.expect_count('exams',           1, 'admin A');
select test.expect_count('exam_attempts',   1, 'admin A');
-- Y que lo que ve es lo correcto, no una fila cualquiera:
do $$ begin
  if (select slug from organizations) <> 'instituto-a' then
    raise exception 'FALLO: el admin A ve la organización equivocada';
  end if;
  if (select title from courses) <> 'Curso de A' then
    raise exception 'FALLO: el admin A ve el curso equivocado';
  end if;
  raise notice 'OK  identidad de las filas visibles es la correcta';
end $$;
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' El alumno del Instituto B no ve nada del Instituto A'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('bb000000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from courses where organization_id = '0a000000-0000-0000-0000-000000000001') then
    raise exception 'FALLO CRÍTICO: fuga de cursos entre tenants';
  end if;
  if exists (select 1 from exam_attempts where student_id = 'aa000000-0000-0000-0000-000000000002') then
    raise exception 'FALLO CRÍTICO: fuga de notas entre tenants';
  end if;
  if exists (select 1 from questions where bank_id = '4a000000-0000-0000-0000-000000000001') then
    raise exception 'FALLO CRÍTICO: fuga de preguntas entre tenants';
  end if;
  raise notice 'OK  sin fuga de cursos, notas ni preguntas del tenant A';
end $$;
-- Un alumno tampoco ve las notas de un compañero de su propia organización.
do $$ begin
  if exists (select 1 from exam_attempts where student_id <> 'bb000000-0000-0000-0000-000000000002') then
    raise exception 'FALLO: un alumno ve intentos que no son suyos';
  end if;
  raise notice 'OK  el alumno solo ve sus propios intentos';
end $$;
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' D3 · Nadie autenticado alcanza la clave de respuestas'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('aa000000-0000-0000-0000-000000000001');   -- incluso siendo admin
do $$ begin
  perform 1 from question_keys limit 1;
  raise exception 'FALLO CRÍTICO: question_keys es alcanzable por authenticated';
exception when insufficient_privilege then
  raise notice 'OK  question_keys rechaza incluso al org_admin (sin GRANT)';
end $$;
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' D4 · El alumno no puede escribirse la nota'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('bb000000-0000-0000-0000-000000000002');
do $$ begin
  update exam_attempts set score = 100
   where id = '7b000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'FALLO CRÍTICO: el alumno alteró su propia nota';
  end if;
  raise notice 'OK  UPDATE del alumno sobre su intento no afecta ninguna fila';
exception when insufficient_privilege then
  raise notice 'OK  UPDATE del alumno rechazado por permisos';
end $$;
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' Un usuario sin membresía no ve absolutamente nada'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('cc000000-0000-0000-0000-000000000001');
select test.expect_count('organizations',  0, 'intruso');
select test.expect_count('courses',        0, 'intruso');
select test.expect_count('exams',          0, 'intruso');
select test.expect_count('exam_attempts',  0, 'intruso');
select test.expect_count('questions',      0, 'intruso');
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' El admin de B no puede escribir en el Instituto A'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role authenticated;
select test.test_as('bb000000-0000-0000-0000-000000000001');
do $$ begin
  insert into courses (organization_id, slug, title)
  values ('0a000000-0000-0000-0000-000000000001', 'intruso', 'Curso inyectado');
  raise exception 'FALLO CRÍTICO: el admin de B creó un curso en el tenant A';
exception when insufficient_privilege then
  raise notice 'OK  INSERT cruzado rechazado por RLS';
end $$;
do $$
declare _n int;
begin
  update courses set title = 'Secuestrado'
   where organization_id = '0a000000-0000-0000-0000-000000000001';
  get diagnostics _n = row_count;
  if _n > 0 then
    raise exception 'FALLO CRÍTICO: el admin de B modificó % curso(s) del tenant A', _n;
  end if;
  raise notice 'OK  UPDATE cruzado no afecta ninguna fila';
  delete from courses where organization_id = '0a000000-0000-0000-0000-000000000001';
  get diagnostics _n = row_count;
  if _n > 0 then
    raise exception 'FALLO CRÍTICO: el admin de B borró % curso(s) del tenant A', _n;
  end if;
  raise notice 'OK  DELETE cruzado no afecta ninguna fila';
end $$;
rollback;

\echo ''
\echo '══════════════════════════════════════════════════════════════'
\echo ' anon no alcanza ninguna tabla'
\echo '══════════════════════════════════════════════════════════════'
begin;
set local role anon;
do $$ begin
  perform 1 from organizations limit 1;
  raise exception 'FALLO: anon alcanzó organizations';
exception when insufficient_privilege then
  raise notice 'OK  anon rechazado (sin GRANT)';
end $$;
rollback;

\echo ''
\echo '── Aislamiento verificado ──'
