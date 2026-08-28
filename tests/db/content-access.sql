-- ============================================================================
-- D7 + D8 · Qué alcanza cada quién DENTRO de una organización
-- ============================================================================
-- La suite de aislamiento prueba que el tenant A no alcanza al tenant B. Esta
-- prueba lo que falta: que dentro de una organización, un alumno solo alcance lo
-- que le corresponde, y que el temario y la lección de muestra sí se vean antes
-- de matricularse — sin que se filtre el resto del contenido.
--
-- Sesiones reales (`set local role authenticated` + claim sub). No se prueba la
-- intención de las políticas, su efecto.
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

-- Cuatro cursos que cubren las combinaciones que importan.
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

-- En el curso de catálogo hay DOS lecciones: una de muestra y otra que no. Es la
-- distinción que hace útil la prueba: sin ella, "se ve el contenido" y "se ve la
-- muestra" serían indistinguibles.
insert into lessons (id, module_id, title, is_preview) values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Lección matriculada', false),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Lección borrador',    false),
  ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000003', 'Muestra gratis',      true),
  ('d3000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000003', 'Lección de pago',     false),
  ('d3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000004', 'Lección ajena',       false);

insert into lesson_contents (lesson_id, body) values
  ('d3000000-0000-0000-0000-000000000001', 'CONTENIDO PAGADO'),
  ('d3000000-0000-0000-0000-000000000002', 'BORRADOR'),
  ('d3000000-0000-0000-0000-000000000003', 'CONTENIDO DE MUESTRA'),
  ('d3000000-0000-0000-0000-000000000005', 'CONTENIDO DE PAGO DEL CATÁLOGO'),
  ('d3000000-0000-0000-0000-000000000004', 'CONTENIDO AJENO');

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
-- Viven en el esquema `test` y no en public: el generador de tipos introspecta
-- las funciones de public que authenticated puede ejecutar, y unos helpers de
-- prueba ahí terminaban dentro de src/lib/db/types.ts.
create or replace function test.d_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.d_expect(_label text, _got bigint, _want bigint) returns void
language plpgsql as $$
begin
  if _got = _want then
    raise notice 'OK    % → % ', rpad(_label, 46), _got;
  else
    raise exception 'FALLA % → esperaba %, obtuvo %', rpad(_label, 46), _want, _got;
  end if;
end $$;

create or replace function test.d_count(_table text) returns bigint
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
select test.d_as('dd000000-0000-0000-0000-000000000002');
do $$
begin
  -- Ve el curso donde está matriculado y el del catálogo. No el borrador ni el ajeno.
  perform test.d_expect('cursos visibles',        test.d_count('courses'), 2);
  perform test.d_expect('cursos en borrador',
    (select count(*) from courses where status = 'draft'), 0);

  -- D8: el temario de ambos cursos visibles, no solo el matriculado.
  perform test.d_expect('módulos del temario',    test.d_count('modules'), 2);
  perform test.d_expect('lecciones del temario',  test.d_count('lessons'), 3);

  -- Pero el contenido solo del curso matriculado, más la muestra del catálogo.
  perform test.d_expect('contenidos alcanzables', test.d_count('lesson_contents'), 2);
  perform test.d_expect('el contenido pagado del catálogo NO',
    (select count(*) from lesson_contents
      where lesson_id = 'd3000000-0000-0000-0000-000000000005'), 0);
  perform test.d_expect('su propio contenido SÍ',
    (select count(*) from lesson_contents
      where lesson_id = 'd3000000-0000-0000-0000-000000000001'), 1);

  -- Material de evaluación: cero por SQL.
  perform test.d_expect('bancos de preguntas',    test.d_count('question_banks'), 0);
  perform test.d_expect('enunciados de pregunta', test.d_count('questions'), 0);
  perform test.d_expect('alternativas',           test.d_count('question_options'), 0);
  perform test.d_expect('armado de exámenes',     test.d_count('exam_questions'), 0);

  -- El examen que le toca dar sí, con sus reglas.
  perform test.d_expect('exámenes visibles',      test.d_count('exams'), 1);
end $$;
rollback;

\echo ''
\echo '══ Alumno SIN matrícula: temario y muestra, nada más ═══════════════════'
begin;
set local role authenticated;
select test.d_as('dd000000-0000-0000-0000-000000000003');
do $$
begin
  perform test.d_expect('cursos visibles (solo catálogo)', test.d_count('courses'), 1);

  -- D8 · Puede decidir: ve el temario completo del curso del catálogo.
  perform test.d_expect('módulos del temario',             test.d_count('modules'), 1);
  perform test.d_expect('lecciones del temario',           test.d_count('lessons'), 2);

  -- Y una sola lección abierta: la marcada como muestra.
  perform test.d_expect('contenidos alcanzables',          test.d_count('lesson_contents'), 1);
  perform test.d_expect('el contenido abierto es la muestra',
    (select count(*) from lesson_contents
      where lesson_id = 'd3000000-0000-0000-0000-000000000003'), 1);
  perform test.d_expect('la lección de pago sigue cerrada',
    (select count(*) from lesson_contents
      where lesson_id = 'd3000000-0000-0000-0000-000000000005'), 0);

  perform test.d_expect('exámenes visibles',               test.d_count('exams'), 0);
  perform test.d_expect('bancos de preguntas',             test.d_count('question_banks'), 0);
end $$;
rollback;

\echo ''
\echo '══ La muestra no abre el curso: marcarla no filtra el resto ════════════'
begin;
set local role authenticated;
select test.d_as('dd000000-0000-0000-0000-000000000003');
do $$
begin
  -- Aunque exista una lección de muestra en el catálogo, el curso privado sin
  -- matrícula sigue invisible por completo.
  perform test.d_expect('curso privado ajeno invisible',
    (select count(*) from courses where id = 'd1000000-0000-0000-0000-000000000004'), 0);
  perform test.d_expect('su temario invisible',
    (select count(*) from modules where course_id = 'd1000000-0000-0000-0000-000000000004'), 0);
  perform test.d_expect('su contenido invisible',
    (select count(*) from lesson_contents where course_id = 'd1000000-0000-0000-0000-000000000004'), 0);
end $$;
rollback;

\echo ''
\echo '══ Staff de la organización: ve y edita todo lo suyo ═══════════════════'
begin;
set local role authenticated;
select test.d_as('dd000000-0000-0000-0000-000000000001');
do $$
begin
  perform test.d_expect('cursos visibles',        test.d_count('courses'), 4);
  perform test.d_expect('módulos visibles',       test.d_count('modules'), 4);
  perform test.d_expect('lecciones visibles',     test.d_count('lessons'), 5);
  perform test.d_expect('contenidos visibles',    test.d_count('lesson_contents'), 5);
  perform test.d_expect('bancos de preguntas',    test.d_count('question_banks'), 1);
  perform test.d_expect('enunciados de pregunta', test.d_count('questions'), 1);
  perform test.d_expect('armado de exámenes',     test.d_count('exam_questions'), 1);
end $$;
rollback;

\echo ''
\echo '══ course_id denormalizado: se deriva y se mantiene ════════════════════'
begin;
do $$
declare c uuid;
begin
  insert into lessons (id, module_id, title)
    values ('d3000000-0000-0000-0000-0000000000aa', 'd2000000-0000-0000-0000-000000000001', 'Derivada');
  select course_id into c from lessons where id = 'd3000000-0000-0000-0000-0000000000aa';
  perform test.d_expect('course_id derivado del módulo',
    (select count(*) where c = 'd1000000-0000-0000-0000-000000000001'), 1);

  update lessons set module_id = 'd2000000-0000-0000-0000-000000000003'
    where id = 'd3000000-0000-0000-0000-0000000000aa';
  select course_id into c from lessons where id = 'd3000000-0000-0000-0000-0000000000aa';
  perform test.d_expect('course_id sincronizado al mover',
    (select count(*) where c = 'd1000000-0000-0000-0000-000000000003'), 1);

  -- Y el contenido hereda las claves de su lección, sin que nadie las pase.
  insert into lesson_contents (lesson_id, body)
    values ('d3000000-0000-0000-0000-0000000000aa', 'texto');
  perform test.d_expect('claves del contenido derivadas de la lección',
    (select count(*) from lesson_contents
      where lesson_id = 'd3000000-0000-0000-0000-0000000000aa'
        and course_id = 'd1000000-0000-0000-0000-000000000003'
        and organization_id = '0d000000-0000-0000-0000-000000000001'), 1);
end $$;
rollback;

\echo ''
\echo '── Acceso a contenido verificado ──'
