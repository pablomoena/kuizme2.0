-- ============================================================================
-- D7 · Acceso a contenido dentro de una misma organización
-- ============================================================================
-- La suite de aislamiento prueba que el tenant A no alcanza al tenant B. Esta
-- prueba lo que falta: que DENTRO de una organización, un alumno solo alcanza
-- lo que le corresponde. Ese era el agujero: membresía daba lectura de todo.
--
-- Sesiones reales (`set local role authenticated` + claim sub), igual que la
-- suite de aislamiento. No se prueba la intención de las políticas, su efecto.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ── Semilla ────────────────────────────────────────────────────────────────
begin;

insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'staff.d@test.cl'),
  ('dd000000-0000-0000-0000-000000000002', 'matriculado@test.cl'),
  ('dd000000-0000-0000-0000-000000000003', 'suelto@test.cl');

insert into organizations (id, slug, name) values
  ('0d000000-0000-0000-0000-000000000001', 'instituto-d', 'Instituto D');

insert into memberships (user_id, organization_id, role) values
  ('dd000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'org_admin'),
  ('dd000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001', 'student'),
  ('dd000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000001', 'student');

-- Cuatro cursos que cubren las cuatro combinaciones que importan.
insert into courses (id, organization_id, slug, title, status, visibility) values
  ('d1000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
   'curso-matriculado', 'Publicado, y el alumno está matriculado', 'published', 'private'),
  ('d1000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001',
   'curso-borrador',    'En borrador, nadie fuera del staff',      'draft',     'private'),
  ('d1000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000001',
   'curso-catalogo',    'Publicado y público: se ve en catálogo',  'published', 'public'),
  ('d1000000-0000-0000-0000-000000000004', '0d000000-0000-0000-0000-000000000001',
   'curso-ajeno',       'Publicado pero privado y sin matrícula',  'published', 'private');

insert into modules (id, course_id, title) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Módulo del curso matriculado'),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'Módulo del borrador'),
  ('d2000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'Módulo del catálogo'),
  ('d2000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'Módulo ajeno');

insert into lessons (id, module_id, title, body) values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Lección matriculada', 'CONTENIDO PAGADO'),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Lección borrador',    'BORRADOR'),
  ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003', 'Lección catálogo',    'CONTENIDO DE CATÁLOGO'),
  ('d3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000004', 'Lección ajena',       'CONTENIDO AJENO');

insert into enrollments (course_id, student_id, status) values
  ('d1000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002', 'active');

-- Material de evaluación: nada de esto debe alcanzar un alumno por SQL.
insert into question_banks (id, organization_id, title) values
  ('d4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Banco de D');
insert into questions (id, bank_id, kind, prompt) values
  ('d5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'multiple_choice', 'ENUNCIADO SECRETO');
insert into question_options (question_id, label, order_index) values
  ('d5000000-0000-0000-0000-000000000001', 'ALTERNATIVA SECRETA', 1);
insert into exams (id, organization_id, course_id, title, status) values
  ('d6000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001', 'Examen del curso matriculado', 'published');
insert into exam_questions (exam_id, question_id, order_index) values
  ('d6000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 1);

commit;

-- ── Utilidades ─────────────────────────────────────────────────────────────
create or replace function d_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function d_expect(_label text, _got bigint, _want bigint) returns void
language plpgsql as $$
begin
  if _got = _want then
    raise notice 'OK    % → % ', rpad(_label, 46), _got;
  else
    raise exception 'FALLA % → esperaba %, obtuvo %', rpad(_label, 46), _want, _got;
  end if;
end $$;

create or replace function d_count(_table text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', _table) into n;
  return n;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '══ Alumno MATRICULADO en un curso publicado ════════════════════════════'
begin;
set local role authenticated;
select d_as('dd000000-0000-0000-0000-000000000002');
do $$
begin
  -- Ve el curso donde está matriculado y el del catálogo. No el borrador ni el ajeno.
  perform d_expect('cursos visibles',              d_count('courses'), 2);
  perform d_expect('cursos en borrador',
    (select count(*) from courses where status = 'draft'), 0);
  -- Contenido solo del curso matriculado. El del catálogo no se estudia sin matrícula.
  perform d_expect('módulos visibles',             d_count('modules'), 1);
  perform d_expect('lecciones visibles',           d_count('lessons'), 1);
  perform d_expect('cuerpos de lección alcanzables',
    (select count(*) from lessons where body is not null), 1);
  perform d_expect('la lección visible es la suya',
    (select count(*) from lessons where id = 'd3000000-0000-0000-0000-000000000001'), 1);
  -- Material de evaluación: cero por SQL.
  perform d_expect('bancos de preguntas',          d_count('question_banks'), 0);
  perform d_expect('enunciados de pregunta',       d_count('questions'), 0);
  perform d_expect('alternativas',                 d_count('question_options'), 0);
  perform d_expect('armado de exámenes',           d_count('exam_questions'), 0);
  -- El examen que le toca dar sí, con sus reglas.
  perform d_expect('exámenes visibles',            d_count('exams'), 1);
end $$;
rollback;

\echo ''
\echo '══ Alumno SIN matrícula, misma organización ════════════════════════════'
begin;
set local role authenticated;
select d_as('dd000000-0000-0000-0000-000000000003');
do $$
begin
  perform d_expect('cursos visibles (solo catálogo)', d_count('courses'), 1);
  perform d_expect('módulos visibles',                d_count('modules'), 0);
  perform d_expect('lecciones visibles',              d_count('lessons'), 0);
  perform d_expect('exámenes visibles',               d_count('exams'), 0);
  perform d_expect('bancos de preguntas',             d_count('question_banks'), 0);
end $$;
rollback;

\echo ''
\echo '══ Staff de la organización: ve y edita todo lo suyo ═══════════════════'
begin;
set local role authenticated;
select d_as('dd000000-0000-0000-0000-000000000001');
do $$
begin
  perform d_expect('cursos visibles',        d_count('courses'), 4);
  perform d_expect('módulos visibles',       d_count('modules'), 4);
  perform d_expect('lecciones visibles',     d_count('lessons'), 4);
  perform d_expect('bancos de preguntas',    d_count('question_banks'), 1);
  perform d_expect('enunciados de pregunta', d_count('questions'), 1);
  perform d_expect('armado de exámenes',     d_count('exam_questions'), 1);
end $$;
rollback;

\echo ''
\echo '══ course_id denormalizado: se deriva y se mantiene ════════════════════'
begin;
do $$
declare c uuid;
begin
  -- Se deriva en el INSERT sin pasarlo.
  insert into lessons (id, module_id, title)
    values ('d3000000-0000-0000-0000-0000000000aa', 'd2000000-0000-0000-0000-000000000001', 'Derivada');
  select course_id into c from lessons where id = 'd3000000-0000-0000-0000-0000000000aa';
  perform d_expect('course_id derivado del módulo',
    (select count(*) where c = 'd1000000-0000-0000-0000-000000000001'), 1);

  -- Y se corrige al mover la lección a un módulo de otro curso. Si no, la fila
  -- quedaría visible para los alumnos del curso equivocado.
  update lessons set module_id = 'd2000000-0000-0000-0000-000000000003'
    where id = 'd3000000-0000-0000-0000-0000000000aa';
  select course_id into c from lessons where id = 'd3000000-0000-0000-0000-0000000000aa';
  perform d_expect('course_id sincronizado al mover',
    (select count(*) where c = 'd1000000-0000-0000-0000-000000000003'), 1);
end $$;
rollback;

\echo ''
\echo '── Acceso a contenido verificado ──'
