-- ============================================================================
-- D10 · Cómo se entrega el contenido se configura POR CURSO
-- ============================================================================
-- Un diplomado que se dicta por semestre y un curso suelto de lectura libre no
-- se entregan igual. Así que no es una decisión del producto, es configuración
-- del curso, y la elige quien lo crea.
--
-- Dos ajustes independientes que se combinan:
--
--   release_mode   cuándo se abre cada lección
--     immediate    todo disponible al matricularse (el comportamiento actual)
--     scheduled    por fecha fija: lessons.unlock_at, igual para todos
--     relative     por días desde SU matrícula: lessons.unlock_after_days
--
--   sequential     si además hay que ir en orden: no se abre una lección
--                  mientras quede alguna obligatoria anterior sin completar
--
-- Las columnas unlock_at y unlock_after_days ya existían en lessons desde la
-- primera migración, sin usar. Ahora tienen quien las lea.
--
-- Se aplica en RLS, no en la interfaz. Un bloqueo que solo vive en la pantalla no
-- es un bloqueo: basta pedir el contenido por la API para saltárselo. Es el mismo
-- criterio que D3 (clave de respuestas), D7 (contenido por matrícula) y D8.
-- ============================================================================

create type course_release_mode as enum ('immediate', 'scheduled', 'relative');

alter table courses
  add column release_mode course_release_mode not null default 'immediate',
  add column sequential   boolean             not null default false;

comment on column courses.release_mode is
  'D10: immediate = todo abierto; scheduled = por lessons.unlock_at; relative = por lessons.unlock_after_days desde la matrícula.';
comment on column courses.sequential is
  'D10: si true, una lección no se abre mientras quede alguna obligatoria anterior sin completar.';

-- ── La única puerta ────────────────────────────────────────────────────────
-- Responde una sola pregunta: ¿puede este usuario abrir el contenido de esta
-- lección AHORA? La usan la política de lectura, la de completar, y la vista que
-- alimenta la interfaz. Una sola definición para no tener dos que discrepen.
create or replace function can_open_lesson(_lesson uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  l record;
  c record;
  _enrolled_at timestamptz;
begin
  select le.course_id, le.is_preview, le.unlock_at, le.unlock_after_days,
         m.order_index as module_order, le.order_index as lesson_order
    into l
  from lessons le
  join modules m on m.id = le.module_id
  where le.id = _lesson;
  if not found then return false; end if;

  select co.organization_id, co.release_mode, co.sequential into c
  from courses co where co.id = l.course_id;
  if not found then return false; end if;

  -- El staff siempre: tiene que poder revisar el curso completo para armarlo.
  if has_org_role(c.organization_id, array['org_admin','instructor']::org_role[])
     or is_platform_admin() then
    return true;
  end if;

  -- La lección de muestra se abre sin matrícula (D8), y ninguna regla de
  -- liberación la afecta: es la que sirve para decidir si tomar el curso.
  if l.is_preview and can_view_course(l.course_id) then
    return true;
  end if;

  -- De acá en adelante hace falta matrícula activa en un curso publicado (D7).
  if not can_study_course(l.course_id) then
    return false;
  end if;

  select e.enrolled_at into _enrolled_at
  from enrollments e
  where e.course_id = l.course_id
    and e.student_id = auth.uid()
    and e.status in ('active', 'completed')
  order by e.enrolled_at
  limit 1;

  -- Liberación en el tiempo. Un unlock sin valor no restringe: así un curso
  -- programado puede tener su primer módulo abierto desde el día uno.
  if c.release_mode = 'scheduled'
     and l.unlock_at is not null
     and l.unlock_at > now() then
    return false;
  end if;

  if c.release_mode = 'relative'
     and l.unlock_after_days is not null
     and _enrolled_at is not null
     and _enrolled_at + make_interval(days => l.unlock_after_days) > now() then
    return false;
  end if;

  -- Secuencia. El orden del curso es (orden del módulo, orden de la lección):
  -- la comparación de filas de Postgres lo expresa directo.
  if c.sequential and exists (
    select 1
    from lessons prev
    join modules pm on pm.id = prev.module_id
    where prev.course_id = l.course_id
      and prev.is_required
      and (pm.order_index, prev.order_index) < (l.module_order, l.lesson_order)
      and not exists (
        select 1 from lesson_completions lc
        where lc.lesson_id = prev.id and lc.student_id = auth.uid()
      )
  ) then
    return false;
  end if;

  return true;
end $$;

comment on function can_open_lesson(uuid) is
  'D10: la única puerta al contenido de una lección. Matrícula (D7), muestra (D8), liberación por fecha o por días, y secuencia. SECURITY DEFINER: las tablas que lee no pueden tener `force row level security`.';

revoke execute on function can_open_lesson(uuid) from public, anon;
grant  execute on function can_open_lesson(uuid) to authenticated;

-- ── Las políticas pasan a usarla ───────────────────────────────────────────
-- La de lectura queda en una sola llamada: toda la lógica de acceso al contenido
-- vive en un sitio en vez de repartida entre políticas.
drop policy lesson_contents_read on lesson_contents;
create policy lesson_contents_read on lesson_contents for select to authenticated
  using (can_open_lesson(lesson_id));

-- Completar exige que la lección esté abierta, además de la matrícula (D9). Si
-- no, un alumno registraría avance en lecciones que todavía no puede leer y el
-- bloqueo secuencial se saltaría a sí mismo.
drop policy completion_insert_own on lesson_completions;
create policy completion_insert_own on lesson_completions for insert to authenticated
  with check (
    student_id = auth.uid()
    and can_study_course(course_id)
    and can_open_lesson(lesson_id)
  );

-- ── Lo que la interfaz necesita saber ──────────────────────────────────────
-- `is_open` sale de can_open_lesson, así que la pantalla no puede discrepar de
-- la base. `opens_at` y `reason` son explicativos —para decir "se abre el 15 de
-- septiembre" en vez de "no disponible"— y no deciden nada.
create view my_lesson_availability
with (security_invoker = true) as
select
  l.id        as lesson_id,
  l.course_id,
  can_open_lesson(l.id) as is_open,
  case
    when c.release_mode = 'scheduled' then l.unlock_at
    when c.release_mode = 'relative' and l.unlock_after_days is not null then (
      select e.enrolled_at + make_interval(days => l.unlock_after_days)
      from enrollments e
      where e.course_id = l.course_id and e.student_id = auth.uid()
        and e.status in ('active', 'completed')
      order by e.enrolled_at limit 1
    )
    else null
  end as opens_at,
  case
    when can_open_lesson(l.id) then 'abierta'
    when not can_study_course(l.course_id) then 'sin-matricula'
    when c.release_mode = 'scheduled' and l.unlock_at is not null and l.unlock_at > now() then 'fecha'
    when c.release_mode = 'relative'  and l.unlock_after_days is not null then 'dias'
    when c.sequential then 'secuencia'
    else 'sin-matricula'
  end as reason
from lessons l
join courses c on c.id = l.course_id;

comment on view my_lesson_availability is
  'D10: para la interfaz. is_open viene de can_open_lesson (autoridad única); opens_at y reason son explicativos y no deciden acceso.';

revoke all on my_lesson_availability from anon;
grant select on my_lesson_availability to authenticated, service_role;
