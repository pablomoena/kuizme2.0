\set ON_ERROR_STOP on
\echo '── D2: organization_id se deriva por trigger en cascada ──'
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','profe@test.cl');
insert into organizations (id, slug, name) values ('aaaaaaaa-0000-0000-0000-000000000001','ibmiel','Instituto Test');
insert into courses (id, organization_id, slug, title) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','curso-1','Curso 1');
-- Sin pasar organization_id en ninguno de los descendientes:
insert into modules (id, course_id, title) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Módulo 1');
insert into lessons (id, module_id, title) values ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','Lección 1');
insert into question_banks (id, organization_id, title) values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Banco 1');
insert into questions (id, bank_id, kind, prompt) values ('ffffffff-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','multiple_choice','¿Pregunta?');
insert into question_keys (question_id, answer) values ('ffffffff-0000-0000-0000-000000000001','{"option_ids":["x"]}');
select 'modules'       as tabla, organization_id from modules
union all select 'lessons',       organization_id from lessons
union all select 'questions',     organization_id from questions
union all select 'question_keys', organization_id from question_keys;

\echo ''
\echo '── D2: si el padre no existe, el trigger falla en vez de insertar basura ──'
do $$ begin
  insert into modules (course_id, title) values ('99999999-9999-9999-9999-999999999999','Huérfano');
  raise exception 'FALLO: debió rechazar';
exception when foreign_key_violation or others then
  raise notice 'OK rechazado: %', left(sqlerrm, 70);
end $$;

\echo ''
\echo '── D4: una respuesta correcta SIN respuesta registrada debe ser imposible ──'
insert into exams (id, organization_id, title) values ('a1a1a1a1-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Examen 1');
insert into exam_attempts (id, exam_id, student_id, attempt_number, status, submitted_at)
  values ('b1b1b1b1-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,'graded', now());
do $$ begin
  insert into exam_answers (attempt_id, question_id, response, is_correct)
    values ('b1b1b1b1-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000001', null, true);
  raise exception 'FALLO: el bug de la v1 sigue siendo representable';
exception when check_violation then
  raise notice 'OK: CHECK answer_correct_requires_response bloqueó el dato imposible';
end $$;
-- Y con respuesta sí entra:
insert into exam_answers (attempt_id, question_id, response, is_correct)
  values ('b1b1b1b1-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000001','{"option_id":"x"}', true);
\echo 'OK: con respuesta registrada, se acepta'

\echo ''
\echo '── D4: intento en progreso no puede tener submitted_at ──'
do $$ begin
  insert into exam_attempts (exam_id, student_id, attempt_number, status, submitted_at)
    values ('a1a1a1a1-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',2,'in_progress', now());
  raise exception 'FALLO';
exception when check_violation then raise notice 'OK: consistencia de estado del intento'; end $$;

\echo ''
\echo '── Subdominios reservados ──'
do $$ begin
  insert into organizations (slug, name) values ('app','Atacante');
  raise exception 'FALLO: aceptó un slug reservado';
exception when check_violation then raise notice 'OK: "app" rechazado'; end $$;
-- Mayúsculas se normalizan, no se rechazan:
insert into organizations (slug, name) values ('IBMiel-Norte','Norte');
select slug as slug_normalizado from organizations where name='Norte';
do $$ begin
  insert into organizations (slug, name) values ('con_underscore','X');
  raise exception 'FALLO: aceptó formato inválido';
exception when check_violation then raise notice 'OK: formato de slug validado'; end $$;

\echo ''
\echo '── D5: cambio de nota exige motivo ──'
do $$ begin
  insert into grade_changes (organization_id, attempt_id, field, new_value, reason)
    values ('aaaaaaaa-0000-0000-0000-000000000001','b1b1b1b1-0000-0000-0000-000000000001','score','90','  ');
  raise exception 'FALLO';
exception when check_violation then raise notice 'OK: motivo en blanco rechazado'; end $$;

\echo ''
\echo '── D3: ninguna política sobre question_keys ──'
select count(*) as politicas_en_question_keys from pg_policies
  where schemaname='public' and tablename='question_keys';
select relrowsecurity as rls_activo, relforcerowsecurity as rls_forzado
  from pg_class where relname='question_keys';

\echo ''
\echo '── Permisos: authenticated alcanza las tablas de tenant ──'
select count(*) as tablas_legibles_por_authenticated
from information_schema.role_table_grants
where grantee = 'authenticated' and privilege_type = 'SELECT' and table_schema = 'public';

\echo ''
\echo '── D3: doble candado sobre question_keys (sin política Y sin GRANT) ──'
select
  (select count(*) from pg_policies
     where schemaname='public' and tablename='question_keys') as politicas,
  (select count(*) from information_schema.role_table_grants
     where table_schema='public' and table_name='question_keys'
       and grantee in ('authenticated','anon')) as grants_a_usuarios;
do $$
declare _n int;
begin
  select count(*) into _n from information_schema.role_table_grants
   where table_schema='public' and table_name='question_keys'
     and grantee in ('authenticated','anon');
  if _n > 0 then
    raise exception 'FALLO: question_keys tiene % grants para roles de usuario', _n;
  end if;
  raise notice 'OK: question_keys inalcanzable para anon y authenticated';
end $$;

\echo ''
\echo '── anon no alcanza ninguna tabla ──'
do $$
declare _n int;
begin
  select count(*) into _n from information_schema.role_table_grants
   where table_schema='public' and grantee='anon';
  if _n > 0 then
    raise exception 'FALLO: anon tiene % grants; debería ser 0', _n;
  end if;
  raise notice 'OK: anon sin acceso directo a tablas';
end $$;

\echo ''
\echo '── Resumen ──'
select count(*) as tablas from pg_tables where schemaname='public';
select count(*) as politicas from pg_policies where schemaname='public';
select count(*) as tablas_sin_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
