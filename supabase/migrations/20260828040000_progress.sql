-- ============================================================================
-- D9 · Completar una lección exige poder estudiarla, y el progreso se calcula
--      en un solo sitio
-- ============================================================================
-- Dos problemas, uno de integridad y uno de arquitectura.
--
-- 1 · Progreso fabricado
--
-- `completion_insert_own` pedía solo `student_id = auth.uid() and
-- is_member_of(organization_id)`. Como organization_id lo deriva un trigger
-- SECURITY DEFINER desde la lección, la comprobación se cumplía siempre para
-- cualquier miembro de la organización. Verificado con una sesión real de un
-- alumno sin ninguna matrícula:
--
--   cursos visibles para él: 0
--   FALLA  marcó completada una lección SIN matrícula
--   FALLA  marcó completada una lección de un curso en BORRADOR
--   completadas que quedó teniendo: 2
--
-- No podía ni ver esos cursos y aun así registró progreso en ellos. Con
-- certificados en el producto (courses.certificate_enabled), eso es un
-- certificado emitido sobre contenido que nadie leyó.
--
-- 2 · El progreso calculado en varios sitios
--
-- En la v1 el total de lecciones se calculaba en cada pantalla, y una de ellas
-- lo INFERÍA a partir del porcentaje:
--
--   Math.max(completedCount, Math.round((completedCount / courseProgress) * 100))
--
-- El resultado eran totales que cambiaban al navegar. La causa no era ese
-- cálculo, era que no había una definición única de la cual leer. Acá el
-- progreso es una vista, y no hay otra forma de obtenerlo.
-- ============================================================================

-- ── D2 extendido: course_id en las completadas ─────────────────────────────
-- Sin esto, tanto la política como el cálculo de progreso necesitan un join a
-- lessons. Es el mismo remedio que ya se aplicó a organization_id y a lessons.
alter table lesson_completions add column course_id uuid references courses(id) on delete cascade;

update lesson_completions lc set course_id = l.course_id
  from lessons l where l.id = lc.lesson_id;

alter table lesson_completions alter column course_id set not null;
create index lesson_completions_course_idx on lesson_completions (course_id, student_id);

create or replace function set_completion_course_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.course_id is null then
    select l.course_id into new.course_id from lessons l where l.id = new.lesson_id;
    if new.course_id is null then
      raise exception 'No se puede derivar course_id desde lessons(%)', new.lesson_id;
    end if;
  end if;
  return new;
end $$;

create trigger lesson_completions_course before insert on lesson_completions
  for each row execute function set_completion_course_id();

-- ── La política, ahora exigiendo poder estudiar el curso ───────────────────
drop policy completion_insert_own on lesson_completions;

create policy completion_insert_own on lesson_completions for insert to authenticated
  with check (
    student_id = auth.uid()
    and can_study_course(course_id)
  );

-- Y se permite deshacer lo propio: un clic equivocado no debería ser
-- permanente. Solo baja el progreso, así que no abre ningún abuso.
create policy completion_delete_own on lesson_completions for delete to authenticated
  using (student_id = auth.uid() and can_study_course(course_id));

-- ── El progreso, una sola definición ───────────────────────────────────────
-- Cuenta solo las lecciones OBLIGATORIAS: una lección opcional que nadie abre no
-- debería dejar un curso al 90% para siempre.
--
-- Devuelve completed y total además del porcentaje, a propósito. En la v1 una
-- pantalla recibía solo el porcentaje y reconstruía el total dividiendo — de ahí
-- los totales que bailaban. Si el denominador viene en el mismo sitio que el
-- resultado, no hay nada que reconstruir.
--
-- `security_invoker = true`: la vista se evalúa con los permisos de quien
-- consulta, así que RLS aplica y cada usuario ve su propio progreso sin que la
-- vista tenga que filtrar por auth.uid() en dos lugares distintos.
create view my_course_progress
with (security_invoker = true) as
select
  l.course_id,
  count(*) filter (where l.is_required)::integer as total,
  count(*) filter (where l.is_required and lc.lesson_id is not null)::integer as completed,
  case
    when count(*) filter (where l.is_required) = 0 then 0
    else round(
      100.0 * count(*) filter (where l.is_required and lc.lesson_id is not null)
            / count(*) filter (where l.is_required)
    )::integer
  end as percent
from lessons l
left join lesson_completions lc
       on lc.lesson_id = l.id
      and lc.student_id = auth.uid()
group by l.course_id;

comment on view my_course_progress is
  'D9: la única definición de progreso. Lecciones obligatorias completadas sobre el total, para el usuario de la sesión. Trae total y completed además del porcentaje para que nadie reconstruya el denominador.';

revoke all on my_course_progress from anon;
grant select on my_course_progress to authenticated, service_role;

-- ── Marcar las columnas derivadas, para el generador de tipos ──────────────
-- El generador emite como opcionales en Insert las columnas que un trigger
-- deriva del padre, y las reconoce por este comentario. Antes usaba una lista de
-- nombres de función en el propio generador, y se quedó atrás al añadir un
-- trigger: los tipos empezaron a exigir course_id en lesson_completions aunque
-- la base ya lo rellenaba. Marcarlo acá lo pone en la migración, donde se revisa.
do $$
declare t text;
begin
  foreach t in array array[
    'course_pricing','modules','lessons','lesson_contents','enrollments',
    'lesson_completions','questions','question_options','question_keys',
    'exam_questions','exam_answers','grade_changes'
  ] loop
    execute format(
      'comment on column public.%I.organization_id is $c$derivada por trigger desde la tabla padre (D2)$c$', t);
  end loop;
end $$;

comment on column lessons.course_id is
  'derivada por trigger desde modules, y sincronizada al mover la lección (D7)';
comment on column lesson_contents.course_id is
  'derivada por trigger desde lessons (D8)';
comment on column lesson_completions.course_id is
  'derivada por trigger desde lessons (D9)';
