-- ============================================================================
-- D13 · Secciones y liberación por módulo
-- ============================================================================
-- Dos cosas se prueban acá, y son de naturaleza distinta.
--
-- 1. Que la sección agrupe SIN poder mentir. El agujero de la v1 es que nada
--    impide que lessons.section_id apunte a una sección de otro módulo, otro
--    curso u otra organización. Cada intento tiene su comprobación.
--
-- 2. Que la liberación del módulo sea SUELO de verdad, no una segunda opinión.
--    El caso que lo decide es el incómodo: módulo cerrado + lección con fecha ya
--    pasada. Si ese pasa, el suelo no existe y "abrir la semana 3" no significa
--    nada.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;
insert into auth.users (id, email) values
  ('5e000000-0000-0000-0000-000000000001', 'staff.s@test.cl'),
  ('5e000000-0000-0000-0000-000000000002', 'alumno.s@test.cl'),
  ('5e000000-0000-0000-0000-000000000003', 'admin.t@test.cl');

insert into organizations (id, slug, name) values
  ('5e100000-0000-0000-0000-000000000001', 'instituto-s', 'Instituto S'),
  ('5e100000-0000-0000-0000-000000000002', 'instituto-t', 'Instituto T');

insert into memberships (user_id, organization_id, role) values
  ('5e000000-0000-0000-0000-000000000001', '5e100000-0000-0000-0000-000000000001', 'instructor'),
  ('5e000000-0000-0000-0000-000000000002', '5e100000-0000-0000-0000-000000000001', 'student'),
  ('5e000000-0000-0000-0000-000000000003', '5e100000-0000-0000-0000-000000000002', 'org_admin');

insert into courses (id, organization_id, slug, title, status, visibility, release_mode, sequential) values
  ('5e200000-0000-0000-0000-00000000000a', '5e100000-0000-0000-0000-000000000001',
   'secciones-agrupacion', 'Agrupación', 'published', 'private',  'immediate', false),
  ('5e200000-0000-0000-0000-00000000000b', '5e100000-0000-0000-0000-000000000001',
   'secciones-fechas',     'Por fechas', 'published', 'private',  'scheduled', false),
  ('5e200000-0000-0000-0000-00000000000c', '5e100000-0000-0000-0000-000000000001',
   'secciones-dias',       'Por días',   'published', 'private',  'relative',  false),
  -- Este es visible en el catálogo sin matrícula: sirve para comprobar que el
  -- temario incluye las secciones ANTES de matricularse (D8).
  ('5e200000-0000-0000-0000-00000000000d', '5e100000-0000-0000-0000-000000000001',
   'secciones-catalogo',   'En catálogo', 'published', 'unlisted', 'immediate', false),
  ('5e200000-0000-0000-0000-0000000000ff', '5e100000-0000-0000-0000-000000000002',
   'curso-de-la-otra',     'De la otra', 'published', 'unlisted', 'immediate', false);

insert into modules (id, course_id, title, order_index, unlock_at, unlock_after_days) values
  ('5e300000-0000-0000-0000-0000000000a1', '5e200000-0000-0000-0000-00000000000a', 'M1', 1, null, null),
  ('5e300000-0000-0000-0000-0000000000a2', '5e200000-0000-0000-0000-00000000000a', 'M2', 2, null, null),
  -- Curso por fechas: un módulo cerrado y uno abierto.
  ('5e300000-0000-0000-0000-0000000000b1', '5e200000-0000-0000-0000-00000000000b', 'Semana 3 (cerrada)', 1, now() + interval '30 days', null),
  ('5e300000-0000-0000-0000-0000000000b2', '5e200000-0000-0000-0000-00000000000b', 'Semana 1 (abierta)', 2, now() - interval '1 day',  null),
  -- Curso por días: módulo a los 30 días y módulo desde el día 0.
  ('5e300000-0000-0000-0000-0000000000c1', '5e200000-0000-0000-0000-00000000000c', 'Mes 2', 1, null, 30),
  ('5e300000-0000-0000-0000-0000000000c2', '5e200000-0000-0000-0000-00000000000c', 'Mes 1', 2, null, 0),
  ('5e300000-0000-0000-0000-0000000000d1', '5e200000-0000-0000-0000-00000000000d', 'M', 1, null, null),
  ('5e300000-0000-0000-0000-0000000000f1', '5e200000-0000-0000-0000-0000000000ff', 'M', 1, null, null);

insert into sections (id, module_id, title, order_index) values
  ('5e400000-0000-0000-0000-0000000000a1', '5e300000-0000-0000-0000-0000000000a1', 'Semana 1', 1),
  ('5e400000-0000-0000-0000-0000000000a2', '5e300000-0000-0000-0000-0000000000a1', 'Semana 2', 2),
  ('5e400000-0000-0000-0000-0000000000a3', '5e300000-0000-0000-0000-0000000000a1', 'Semana 3', 3),
  -- En OTRO módulo del mismo curso: el destino inválido más plausible.
  ('5e400000-0000-0000-0000-0000000000a9', '5e300000-0000-0000-0000-0000000000a2', 'De otro módulo', 1),
  ('5e400000-0000-0000-0000-0000000000d1', '5e300000-0000-0000-0000-0000000000d1', 'Temario visible', 1),
  -- De otra organización entera.
  ('5e400000-0000-0000-0000-0000000000f1', '5e300000-0000-0000-0000-0000000000f1', 'De la otra', 1);

insert into lessons (id, module_id, section_id, title, order_index, is_required, is_preview, unlock_at, unlock_after_days) values
  ('5e500000-0000-0000-0000-0000000000a1', '5e300000-0000-0000-0000-0000000000a1', null, 'L1', 1, true, false, null, null),
  ('5e500000-0000-0000-0000-0000000000a2', '5e300000-0000-0000-0000-0000000000a1', '5e400000-0000-0000-0000-0000000000a1', 'L2 agrupada', 2, true, false, null, null),
  ('5e500000-0000-0000-0000-0000000000a3', '5e300000-0000-0000-0000-0000000000a2', null, 'L3 en M2', 1, true, false, null, null),
  -- Curso por fechas. Los cuatro cruces de (módulo abierto/cerrado × lección
  -- abierta/cerrada), más una de muestra dentro del módulo cerrado.
  ('5e500000-0000-0000-0000-0000000000b1', '5e300000-0000-0000-0000-0000000000b1', null, 'Módulo cerrado, sin fecha propia', 1, true, false, null, null),
  ('5e500000-0000-0000-0000-0000000000b2', '5e300000-0000-0000-0000-0000000000b1', null, 'Módulo cerrado, fecha propia pasada', 2, true, false, now() - interval '1 day', null),
  ('5e500000-0000-0000-0000-0000000000b5', '5e300000-0000-0000-0000-0000000000b1', null, 'Muestra en módulo cerrado', 3, false, true, null, null),
  ('5e500000-0000-0000-0000-0000000000b3', '5e300000-0000-0000-0000-0000000000b2', null, 'Módulo abierto, sin fecha propia', 1, true, false, null, null),
  ('5e500000-0000-0000-0000-0000000000b4', '5e300000-0000-0000-0000-0000000000b2', null, 'Módulo abierto, fecha propia futura', 2, true, false, now() + interval '30 days', null),
  -- Curso por días.
  ('5e500000-0000-0000-0000-0000000000c1', '5e300000-0000-0000-0000-0000000000c1', null, 'Módulo a 30 días, lección a 0', 1, true, false, null, 0),
  ('5e500000-0000-0000-0000-0000000000c2', '5e300000-0000-0000-0000-0000000000c2', null, 'Módulo a 0 días, lección a 0', 1, true, false, null, 0),
  ('5e500000-0000-0000-0000-0000000000d1', '5e300000-0000-0000-0000-0000000000d1', '5e400000-0000-0000-0000-0000000000d1', 'En catálogo', 1, true, false, null, null);

insert into lesson_contents (lesson_id, body)
select id, 'CONTENIDO de ' || title from lessons
where course_id in (
  '5e200000-0000-0000-0000-00000000000a','5e200000-0000-0000-0000-00000000000b',
  '5e200000-0000-0000-0000-00000000000c','5e200000-0000-0000-0000-00000000000d');

insert into enrollments (course_id, student_id, status) values
  ('5e200000-0000-0000-0000-00000000000a', '5e000000-0000-0000-0000-000000000002', 'active'),
  ('5e200000-0000-0000-0000-00000000000b', '5e000000-0000-0000-0000-000000000002', 'active'),
  ('5e200000-0000-0000-0000-00000000000c', '5e000000-0000-0000-0000-000000000002', 'active');

-- Matriculado hace 3 días: el día 0 ya llegó, el día 30 no.
update enrollments set enrolled_at = now() - interval '3 days'
where student_id = '5e000000-0000-0000-0000-000000000002';
commit;

create or replace function test.s_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);
end $$;

create or replace function test.s_igual(_label text, _obtenido anyelement, _esperado anyelement) returns void
language plpgsql as $$
begin
  if _obtenido is not distinct from _esperado then
    raise notice 'OK    % → %', rpad(_label, 46), _obtenido;
  else
    raise exception 'FALLA % → esperaba %, obtuvo %', rpad(_label, 46), _esperado, _obtenido;
  end if;
end $$;

-- La puerta Y el contenido, igual que en D10: que can_open_lesson diga "no" y el
-- cuerpo llegue de todos modos sería justo el fallo que esto busca.
create or replace function test.s_puerta(_label text, _leccion uuid, _abierta boolean) returns void
language plpgsql as $$
declare puerta boolean; filas int;
begin
  puerta := can_open_lesson(_leccion);
  select count(*) into filas from lesson_contents where lesson_id = _leccion;
  if puerta = _abierta and filas = (case when _abierta then 1 else 0 end) then
    raise notice 'OK    % → puerta %, contenido % fila(s)', rpad(_label, 46), puerta, filas;
  else
    raise exception 'FALLA % → esperaba abierta=%, obtuvo puerta=% y % fila(s)',
      rpad(_label, 46), _abierta, puerta, filas;
  end if;
end $$;

-- Espera que la operación falle. Un `when others` que trague la excepción del
-- propio test daría un falso OK, así que el mensaje se compara.
create or replace function test.s_rechaza(_label text, _sql text, _patron text) returns void
language plpgsql as $$
declare msg text;
begin
  begin
    execute _sql;
  exception
    when sqlstate 'P0001' or sqlstate '23514' or sqlstate '23503'
      or sqlstate '42501' or sqlstate 'P0002' or sqlstate '42P01' then
      msg := sqlerrm;
      if msg ~* _patron then
        raise notice 'OK    % → rechazado: %', rpad(_label, 46), left(msg, 60);
        return;
      end if;
      raise exception 'FALLA % → rechazado, pero por otro motivo: %', rpad(_label, 46), msg;
  end;
  raise exception 'FALLA % → la operación fue ACEPTADA y debía fallar', rpad(_label, 46);
end $$;

\echo ''
\echo '══ 1 · La sección deriva curso y organización de su módulo ══════════════'
do $$ begin
  perform test.s_igual('course_id derivado del módulo',
    (select course_id from sections where id = '5e400000-0000-0000-0000-0000000000a1'),
    '5e200000-0000-0000-0000-00000000000a'::uuid);
  perform test.s_igual('organization_id derivado del módulo',
    (select organization_id from sections where id = '5e400000-0000-0000-0000-0000000000a1'),
    '5e100000-0000-0000-0000-000000000001'::uuid);
end $$;

\echo ''
\echo '══ 2 · El agujero de la v1: la sección tiene que ser del mismo módulo ═══'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  -- El destino inválido más plausible: otra sección del MISMO curso, otro módulo.
  perform test.s_rechaza('sección de otro módulo, mismo curso',
    $q$update lessons set section_id = '5e400000-0000-0000-0000-0000000000a9'
        where id = '5e500000-0000-0000-0000-0000000000a1'$q$,
    'otro módulo');

  perform test.s_rechaza('sección de otra organización',
    $q$update lessons set section_id = '5e400000-0000-0000-0000-0000000000f1'
        where id = '5e500000-0000-0000-0000-0000000000a1'$q$,
    'otro módulo|no existe');

  perform test.s_rechaza('sección inexistente',
    $q$update lessons set section_id = '5e400000-0000-0000-0000-0000000000ee'
        where id = '5e500000-0000-0000-0000-0000000000a1'$q$,
    'no existe');

  -- Y el caso legítimo sí pasa: sin esto, lo anterior podría estar prohibiendo todo.
  update lessons set section_id = '5e400000-0000-0000-0000-0000000000a2'
   where id = '5e500000-0000-0000-0000-0000000000a1';
  perform test.s_igual('sección del propio módulo: aceptada',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a1'),
    '5e400000-0000-0000-0000-0000000000a2'::uuid);
end $$;
rollback;

\echo ''
\echo '══ 3 · set_lesson_section agrupa y desagrupa ════════════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  perform set_lesson_section('5e500000-0000-0000-0000-0000000000a1', '5e400000-0000-0000-0000-0000000000a3');
  perform test.s_igual('agrupada en Semana 3',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a1'),
    '5e400000-0000-0000-0000-0000000000a3'::uuid);

  perform set_lesson_section('5e500000-0000-0000-0000-0000000000a1', null);
  perform test.s_igual('desagrupada: cuelga del módulo',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a1'),
    null::uuid);

  perform test.s_rechaza('a una sección de otro módulo: mensaje propio',
    $q$select set_lesson_section('5e500000-0000-0000-0000-0000000000a1',
                                 '5e400000-0000-0000-0000-0000000000a9')$q$,
    'otro módulo');
end $$;
rollback;

\echo ''
\echo '══ 4 · Borrar una sección no borra sus lecciones ════════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  delete from sections where id = '5e400000-0000-0000-0000-0000000000a1';
  perform test.s_igual('la lección que agrupaba sigue viva',
    (select count(*)::int from lessons where id = '5e500000-0000-0000-0000-0000000000a2'), 1);
  perform test.s_igual('y vuelve a colgar del módulo',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a2'), null::uuid);
end $$;
rollback;

\echo ''
\echo '══ 5 · move_lesson suelta la sección al cambiar de módulo ═══════════════'
-- Sin esto, mover una lección AGRUPADA a otro módulo falla: llegaría con una
-- sección del módulo viejo, que es justo lo que el trigger prohíbe.
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  perform move_lesson('5e500000-0000-0000-0000-0000000000a2',
                      '5e300000-0000-0000-0000-0000000000a2', 1);
  perform test.s_igual('la lección agrupada llegó al módulo nuevo',
    (select module_id from lessons where id = '5e500000-0000-0000-0000-0000000000a2'),
    '5e300000-0000-0000-0000-0000000000a2'::uuid);
  perform test.s_igual('y sin sección',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a2'), null::uuid);
end $$;
rollback;

begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  -- Reordenar dentro del mismo módulo NO es cambiar de módulo: la sección se queda.
  perform move_lesson('5e500000-0000-0000-0000-0000000000a2',
                      '5e300000-0000-0000-0000-0000000000a1', 1);
  perform test.s_igual('mover dentro del módulo conserva la sección',
    (select section_id from lessons where id = '5e500000-0000-0000-0000-0000000000a2'),
    '5e400000-0000-0000-0000-0000000000a1'::uuid);
end $$;
rollback;

\echo ''
\echo '══ 6 · reorder_sections: atómico y con permiso ══════════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  perform reorder_sections('5e300000-0000-0000-0000-0000000000a1', array[
    '5e400000-0000-0000-0000-0000000000a3',
    '5e400000-0000-0000-0000-0000000000a1',
    '5e400000-0000-0000-0000-0000000000a2']::uuid[]);
  perform test.s_igual('Semana 3 pasa a la posición 1',
    (select order_index from sections where id = '5e400000-0000-0000-0000-0000000000a3'), 1);
  perform test.s_igual('Semana 1 pasa a la 2',
    (select order_index from sections where id = '5e400000-0000-0000-0000-0000000000a1'), 2);

  perform test.s_rechaza('lista parcial: rechazada',
    $q$select reorder_sections('5e300000-0000-0000-0000-0000000000a1',
        array['5e400000-0000-0000-0000-0000000000a1']::uuid[])$q$,
    'recarga y vuelve a intentar');

  perform test.s_rechaza('sección de otro módulo en la lista',
    $q$select reorder_sections('5e300000-0000-0000-0000-0000000000a1',
        array['5e400000-0000-0000-0000-0000000000a1',
              '5e400000-0000-0000-0000-0000000000a2',
              '5e400000-0000-0000-0000-0000000000a9']::uuid[])$q$,
    'no pertenecen a este módulo');
end $$;
rollback;

begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');   -- alumno
do $$ begin
  -- Con RLS, el UPDATE de un alumno no falla: no toca filas. Sin la
  -- comprobación de row_count esto sería un éxito silencioso y la pantalla
  -- mostraría un orden que la base no tiene.
  perform test.s_rechaza('un alumno no reordena: error, no silencio',
    $q$select reorder_sections('5e300000-0000-0000-0000-0000000000a1',
        array['5e400000-0000-0000-0000-0000000000a3',
              '5e400000-0000-0000-0000-0000000000a1',
              '5e400000-0000-0000-0000-0000000000a2']::uuid[])$q$,
    'no pertenecen|permiso');

  perform test.s_rechaza('un alumno no crea secciones',
    $q$insert into sections (module_id, title) values
        ('5e300000-0000-0000-0000-0000000000a1', 'Mía')$q$,
    'row-level security|permiso');
end $$;
rollback;

\echo ''
\echo '══ 7 · Aislamiento: la otra organización no existe ══════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000003');   -- admin de instituto-t
do $$ begin
  perform test.s_igual('el admin de T ve solo sus secciones',
    (select count(*)::int from sections), 1);
  perform test.s_igual('y ninguna es de S',
    (select count(*)::int from sections
      where organization_id = '5e100000-0000-0000-0000-000000000001'), 0);
  perform test.s_rechaza('no puede crear una sección en un módulo de S',
    $q$insert into sections (module_id, title) values
        ('5e300000-0000-0000-0000-0000000000a1', 'Intrusa')$q$,
    'row-level security|derivar|permiso');
end $$;
rollback;

\echo ''
\echo '══ 8 · El temario incluye secciones ANTES de matricularse ═══════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');   -- alumno SIN matrícula en este curso
do $$ begin
  perform test.s_igual('ve la sección del curso en catálogo',
    (select count(*)::int from sections
      where course_id = '5e200000-0000-0000-0000-00000000000d'), 1);
  -- Pero el contenido sigue exigiendo matrícula (D8): el temario no es el cuerpo.
  perform test.s_igual('y NO el contenido de su lección',
    (select count(*)::int from lesson_contents
      where lesson_id = '5e500000-0000-0000-0000-0000000000d1'), 0);
end $$;
rollback;

\echo ''
\echo '══ 9 · El módulo es SUELO, por fecha ════════════════════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.s_puerta('módulo cerrado, lección sin fecha',
    '5e500000-0000-0000-0000-0000000000b1', false);
  -- El caso que decide si el suelo existe.
  perform test.s_puerta('módulo cerrado, lección con fecha PASADA',
    '5e500000-0000-0000-0000-0000000000b2', false);
  perform test.s_puerta('módulo abierto, lección sin fecha',
    '5e500000-0000-0000-0000-0000000000b3', true);
  -- El módulo es suelo, no techo: la lección puede retrasarse dentro de él.
  perform test.s_puerta('módulo abierto, lección con fecha FUTURA',
    '5e500000-0000-0000-0000-0000000000b4', false);
  -- La muestra se abre igual: es la que sirve para decidir si tomar el curso (D8).
  perform test.s_puerta('muestra dentro del módulo cerrado',
    '5e500000-0000-0000-0000-0000000000b5', true);
end $$;
rollback;

\echo ''
\echo '══ 10 · El módulo es SUELO, por días desde la matrícula ═════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.s_puerta('módulo a 30 días, lección a 0 días',
    '5e500000-0000-0000-0000-0000000000c1', false);
  perform test.s_puerta('módulo a 0 días, lección a 0 días',
    '5e500000-0000-0000-0000-0000000000c2', true);
end $$;
rollback;

\echo ''
\echo '══ 11 · El staff no queda fuera de su propio curso ══════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000001');
do $$ begin
  perform test.s_puerta('instructor abre el módulo cerrado',
    '5e500000-0000-0000-0000-0000000000b2', true);
end $$;
rollback;

\echo ''
\echo '══ 12 · La interfaz sabe a QUIÉN esperar ════════════════════════════════'
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');
do $$
declare r record;
begin
  select * into r from my_lesson_availability
   where lesson_id = '5e500000-0000-0000-0000-0000000000b1';
  perform test.s_igual('bloqueo del módulo se llama fecha-modulo', r.reason, 'fecha-modulo');
  perform test.s_igual('opens_at es la del módulo',
    (r.opens_at > now() + interval '29 days'), true);

  select * into r from my_lesson_availability
   where lesson_id = '5e500000-0000-0000-0000-0000000000b4';
  perform test.s_igual('bloqueo de la lección se llama fecha', r.reason, 'fecha');

  select * into r from my_lesson_availability
   where lesson_id = '5e500000-0000-0000-0000-0000000000c1';
  perform test.s_igual('por días, el módulo: dias-modulo', r.reason, 'dias-modulo');
  perform test.s_igual('opens_at = matrícula + 30 días, no + 0',
    (r.opens_at > now() + interval '26 days'), true);

  select * into r from my_lesson_availability
   where lesson_id = '5e500000-0000-0000-0000-0000000000b3';
  perform test.s_igual('abierta se llama abierta', r.reason, 'abierta');
end $$;
rollback;

\echo ''
\echo '══ 13 · Completar exige que la lección esté abierta ═════════════════════'
-- El suelo del módulo tiene que alcanzar también a lesson_completions: si no, un
-- alumno registra avance en una lección que no puede leer, y con `sequential` eso
-- se salta el bloqueo a sí mismo.
begin;
set local role authenticated;
select test.s_as('5e000000-0000-0000-0000-000000000002');
do $$ begin
  perform test.s_rechaza('no completa una lección de módulo cerrado',
    $q$insert into lesson_completions (lesson_id, student_id) values
        ('5e500000-0000-0000-0000-0000000000b2',
         '5e000000-0000-0000-0000-000000000002')$q$,
    'row-level security');

  insert into lesson_completions (lesson_id, student_id) values
    ('5e500000-0000-0000-0000-0000000000b3', '5e000000-0000-0000-0000-000000000002');
  perform test.s_igual('sí completa una de módulo abierto',
    (select count(*)::int from lesson_completions
      where lesson_id = '5e500000-0000-0000-0000-0000000000b3'), 1);
end $$;
rollback;

\echo ''
\echo '══ 14 · La sección no gana columnas de liberación sin quien las lea ═════'
-- En la v1 sections.drip_type, drip_date y drip_days_after_enrollment existen,
-- no se pueden fijar en ninguna pantalla y no las lee ninguna comprobación. Acá
-- la decisión es que la sección agrupa y el módulo libera. Esto la deja
-- ejecutable: si una migración futura añade la columna, falla y hay que añadir
-- también quien la lea y su prueba.
do $$
declare sobrantes text;
begin
  select string_agg(column_name, ', ') into sobrantes
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sections'
    and (column_name like 'drip%' or column_name like 'unlock%');

  perform test.s_igual('sections sin columnas de liberación', sobrantes, null::text);

  -- Y el módulo sí las tiene, con su comentario, porque can_open_lesson las lee.
  perform test.s_igual('modules.unlock_at existe',
    (select count(*)::int from information_schema.columns
      where table_schema = 'public' and table_name = 'modules'
        and column_name in ('unlock_at','unlock_after_days')), 2);
end $$;

\echo ''
\echo '══ Todo verde ══════════════════════════════════════════════════════════'
