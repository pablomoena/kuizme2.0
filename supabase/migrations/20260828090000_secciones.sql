-- ============================================================================
-- D13 · Secciones (el cuarto nivel) y liberación por módulo
-- ============================================================================
-- Pablo confirmó que usan secciones. La v1 las tiene, así que la pregunta no era
-- si hacen falta sino cómo estaban hechas. Auditar eso cambió el diseño en dos
-- puntos.
--
-- ── 1 · En la v1 las secciones agrupan; NO liberan ──────────────────────────
-- La tabla `sections` de la v1 tiene drip_type, drip_date y
-- drip_days_after_enrollment. Ninguna de las tres se usa:
--
--   * No se pueden fijar. El componente que edita la liberación
--     (DripConfigFields) aparece en ModuleDialog y en LessonDialog, y en ningún
--     otro sitio. No hay diálogo de sección que lo monte.
--   * No se leen. Los seis sitios que llaman a isDripUnlocked
--     (ModuleItem, CourseSidebar, LessonView) comprueban módulo y lección. La
--     sección no entra en ninguno.
--
-- Son tres columnas muertas, de la misma familia que access_type, pace y
-- modality: existen, parecen configuración, y no gobiernan nada.
--
-- Así que acá la sección es una agrupación y punto: título, orden, y las
-- lecciones que contiene. Sin columnas de liberación. Si alguna vez hace falta
-- liberar por sección se añade con quien la lea en la misma migración.
--
-- ── 2 · La liberación sí sube al módulo ────────────────────────────────────
-- D10 dejó unlock_at y unlock_after_days solo en lessons. Abrir "la semana 3"
-- eran ocho fechas a mano, y ocho sitios donde equivocarse. El módulo las tiene
-- ahora y actúa como SUELO: si el módulo no está abierto, sus lecciones no lo
-- están, digan lo que digan sus propias fechas. Es la semántica de la v1 (el
-- bloqueo del módulo gana) y es la útil: una fecha abre la semana entera.
--
-- ── 3 · Un agujero de la v1 que acá no se repite ───────────────────────────
-- En la v1, lessons.module_id es NOT NULL y lessons.section_id es nullable —esa
-- parte está bien y se copia: una lección siempre cuelga de un módulo, y la
-- sección es opcional, así que el contenido que ya existe sigue funcionando.
--
-- Lo que la v1 no tiene es nada que impida que section_id apunte a una sección
-- de OTRO módulo, o de otro curso, o de otra organización. Con eso una lección
-- aparecería agrupada bajo un título ajeno. Acá lo cierra un trigger, porque un
-- CHECK no puede consultar otra tabla.
-- ============================================================================

create table sections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  module_id       uuid not null references modules(id) on delete cascade,
  title           text not null,
  description     text,
  order_index     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sections_module_idx on sections (module_id, order_index);
create index sections_course_idx on sections (course_id);

comment on table sections is
  'D13: agrupación dentro de un módulo. Sin columnas de liberación a propósito: en la v1 las tenía y nunca se fijaban ni se leían.';

-- course_id y organization_id se derivan del módulo, como en lessons (D7): así
-- las políticas comparan una columna de la propia fila en vez de hacer un join.
create or replace function set_section_course_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.course_id is null then
    select m.course_id into new.course_id from modules m where m.id = new.module_id;
    if new.course_id is null then
      raise exception 'No se puede derivar course_id desde modules(%)', new.module_id;
    end if;
  end if;
  return new;
end $$;

create trigger sections_course before insert on sections
  for each row execute function set_section_course_id();

create trigger sections_org before insert on sections
  for each row execute function set_organization_id('modules', 'module_id');

create trigger sections_touch before update on sections
  for each row execute function touch_updated_at();

comment on column sections.course_id is
  'derivada por trigger desde modules.course_id (D13).';
comment on column sections.organization_id is
  'derivada por trigger desde modules.organization_id (D13).';

-- Mover una sección de módulo no puede dejar course_id apuntando al curso viejo.
create or replace function sync_section_course_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.module_id is distinct from old.module_id then
    select m.course_id into new.course_id from modules m where m.id = new.module_id;
  end if;
  return new;
end $$;

create trigger sections_course_sync before update on sections
  for each row execute function sync_section_course_id();

-- ── La lección se agrupa, opcionalmente ────────────────────────────────────
-- `on delete set null`, no cascade: borrar una sección es quitar un título, no
-- borrar las clases que había debajo. Las lecciones vuelven a colgar del módulo.
alter table lessons
  add column section_id uuid references sections(id) on delete set null;

create index lessons_section_idx on lessons (section_id, order_index)
  where section_id is not null;

comment on column lessons.section_id is
  'D13: agrupación opcional dentro del módulo. NULL = la lección cuelga del módulo directo.';

-- El agujero de la v1: la sección tiene que ser del mismo módulo que la lección.
create or replace function check_lesson_section() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _section_module uuid;
begin
  if new.section_id is null then
    return new;
  end if;

  select module_id into _section_module from sections where id = new.section_id;
  if _section_module is null then
    raise exception 'La sección % no existe', new.section_id
      using errcode = 'foreign_key_violation';
  end if;

  if _section_module <> new.module_id then
    raise exception 'La sección % pertenece a otro módulo que la lección', new.section_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger lessons_section_check before insert or update on lessons
  for each row execute function check_lesson_section();

comment on function check_lesson_section() is
  'D13: cierra el agujero de la v1 — nada impedía que section_id apuntara a una sección de otro módulo, curso u organización.';

-- ── Liberación por módulo ──────────────────────────────────────────────────
alter table modules
  add column unlock_after_days integer check (unlock_after_days is null or unlock_after_days >= 0),
  add column unlock_at         timestamptz;

comment on column modules.unlock_after_days is
  'D13: días desde la matrícula. Suelo para todas sus lecciones cuando release_mode = relative.';
comment on column modules.unlock_at is
  'D13: fecha fija. Suelo para todas sus lecciones cuando release_mode = scheduled.';

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table sections enable row level security;

-- El temario incluye las secciones: se ven al mismo nivel que los módulos (D8),
-- que es antes de matricularse. No llevan contenido, solo cómo está organizado.
create policy sections_read on sections for select to authenticated
  using (can_view_course(course_id));

create policy sections_write on sections for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

grant select, insert, update, delete on sections to authenticated;

-- ── La puerta única aprende el suelo del módulo ────────────────────────────
-- Sigue siendo can_open_lesson y sigue siendo la única: la política de lectura,
-- la de completar y la vista de la interfaz salen todas de acá. Lo que cambia es
-- que ahora mira dos fechas y manda la más tardía.
create or replace function can_open_lesson(_lesson uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  l record;
  c record;
  _enrolled_at timestamptz;
begin
  select le.course_id, le.is_preview, le.unlock_at, le.unlock_after_days,
         m.order_index        as module_order,
         le.order_index       as lesson_order,
         m.unlock_at          as module_unlock_at,
         m.unlock_after_days  as module_unlock_after_days
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

  -- Liberación en el tiempo. El módulo es SUELO (D13): si su fecha no llegó, la
  -- lección no se abre aunque la suya sí haya llegado. Al revés también: una
  -- lección puede retrasarse dentro de un módulo ya abierto. Un unlock sin valor
  -- no restringe, así que el primer módulo puede estar abierto desde el día uno.
  if c.release_mode = 'scheduled' then
    if l.module_unlock_at is not null and l.module_unlock_at > now() then
      return false;
    end if;
    if l.unlock_at is not null and l.unlock_at > now() then
      return false;
    end if;
  end if;

  if c.release_mode = 'relative' and _enrolled_at is not null then
    if l.module_unlock_after_days is not null
       and _enrolled_at + make_interval(days => l.module_unlock_after_days) > now() then
      return false;
    end if;
    if l.unlock_after_days is not null
       and _enrolled_at + make_interval(days => l.unlock_after_days) > now() then
      return false;
    end if;
  end if;

  -- Secuencia. El orden del curso es (orden del módulo, orden de la lección):
  -- la comparación de filas de Postgres lo expresa directo. La sección agrupa
  -- para mostrar y no entra acá: si entrara habría dos ordenamientos que
  -- discrepan.
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
  'D10/D13: la única puerta al contenido de una lección. Matrícula (D7), muestra (D8), liberación por fecha o por días con el módulo como suelo (D13), y secuencia. SECURITY DEFINER: las tablas que lee no pueden tener `force row level security`.';

-- ── Lo que la interfaz necesita saber ──────────────────────────────────────
-- `greatest` en Postgres ignora los NULL, así que expresa el suelo tal cual: si
-- el módulo no tiene fecha manda la de la lección, y al revés.
create or replace view my_lesson_availability
with (security_invoker = true) as
select
  l.id        as lesson_id,
  l.course_id,
  can_open_lesson(l.id) as is_open,
  case
    when c.release_mode = 'scheduled' then greatest(m.unlock_at, l.unlock_at)
    when c.release_mode = 'relative'
         and greatest(m.unlock_after_days, l.unlock_after_days) is not null then (
      select e.enrolled_at + make_interval(days => greatest(m.unlock_after_days, l.unlock_after_days))
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
    when c.release_mode = 'scheduled' and m.unlock_at is not null and m.unlock_at > now() then 'fecha-modulo'
    when c.release_mode = 'scheduled' and l.unlock_at is not null and l.unlock_at > now() then 'fecha'
    when c.release_mode = 'relative'  and m.unlock_after_days is not null then 'dias-modulo'
    when c.release_mode = 'relative'  and l.unlock_after_days is not null then 'dias'
    when c.sequential then 'secuencia'
    else 'sin-matricula'
  end as reason
from lessons l
join modules m on m.id = l.module_id
join courses c on c.id = l.course_id;

comment on view my_lesson_availability is
  'D10/D13: para la interfaz. is_open viene de can_open_lesson (autoridad única); opens_at y reason son explicativos y no deciden acceso. reason distingue si el bloqueo es del módulo o de la lección, para decir a quién esperar.';

revoke all on my_lesson_availability from anon;
grant select on my_lesson_availability to authenticated, service_role;

-- ── Ordenar secciones, y agrupar lecciones ─────────────────────────────────
-- Mismo patrón que reorder_modules y reorder_lessons: lista completa, una sola
-- sentencia, `security invoker` para que RLS aplique, y recuento de filas porque
-- un UPDATE negado por RLS no da error, simplemente no toca nada.
create or replace function reorder_sections(_module uuid, _ids uuid[])
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  _total     integer;
  _afectados integer;
begin
  if _ids is null or array_length(_ids, 1) is null then
    raise exception 'La lista de secciones viene vacía' using errcode = 'check_violation';
  end if;

  if exists (select 1 from unnest(_ids) i group by i having count(*) > 1) then
    raise exception 'La lista de secciones tiene ids repetidos' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from unnest(_ids) i
    where not exists (select 1 from sections s where s.id = i and s.module_id = _module)
  ) then
    raise exception 'Hay secciones que no pertenecen a este módulo' using errcode = 'check_violation';
  end if;

  select count(*) into _total from sections where module_id = _module;
  if _total <> array_length(_ids, 1) then
    raise exception 'El módulo tiene % secciones y llegaron %: recarga y vuelve a intentar',
      _total, array_length(_ids, 1) using errcode = 'check_violation';
  end if;

  update sections s
     set order_index = t.ord
    from unnest(_ids) with ordinality t(id, ord)
   where s.id = t.id;

  get diagnostics _afectados = row_count;

  if _afectados <> _total then
    raise exception 'No tienes permiso para reordenar este módulo'
      using errcode = 'insufficient_privilege';
  end if;

  return _afectados;
end $$;

-- Agrupar o desagrupar una lección DENTRO de su módulo. `_section` null la
-- devuelve al módulo directo. Cambiar de módulo es move_lesson, que es otra
-- operación: mezclar las dos en una función haría ambigua la intención cuando
-- llegan un módulo y una sección que no se corresponden.
create or replace function set_lesson_section(_lesson uuid, _section uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  _module uuid;
begin
  select module_id into _module from lessons where id = _lesson;
  if _module is null then
    raise exception 'La lección no existe o no la puedes ver' using errcode = 'no_data_found';
  end if;

  -- Se comprueba acá además del trigger para dar el mensaje útil: el trigger
  -- protege cualquier UPDATE, esto explica el error al que llamó a la función.
  if _section is not null and not exists (
    select 1 from sections where id = _section and module_id = _module
  ) then
    raise exception 'La sección no existe, no la puedes ver, o es de otro módulo'
      using errcode = 'check_violation';
  end if;

  update lessons set section_id = _section where id = _lesson;
  if not found then
    raise exception 'No tienes permiso para mover esta lección'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- move_lesson tiene que soltar la sección al cambiar de módulo: si no, la
-- lección llegaría al módulo nuevo agrupada bajo un título del viejo, que es
-- justo lo que el trigger prohíbe. Sin esto, mover una lección agrupada falla.
create or replace function move_lesson(_lesson uuid, _target_module uuid, _position integer)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  _origen uuid;
  _ids    uuid[];
begin
  select module_id into _origen from lessons where id = _lesson;
  if _origen is null then
    raise exception 'La lección no existe o no la puedes ver' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from modules where id = _target_module) then
    raise exception 'El módulo destino no existe o no lo puedes ver' using errcode = 'no_data_found';
  end if;

  if _origen = _target_module then
    update lessons set module_id = _target_module where id = _lesson;
  else
    update lessons set module_id = _target_module, section_id = null where id = _lesson;
  end if;
  if not found then
    raise exception 'No tienes permiso para mover esta lección'
      using errcode = 'insufficient_privilege';
  end if;

  -- Reindexar el módulo destino con la lección en su posición, y el de origen
  -- para que no queden huecos.
  select array_agg(id order by ord) into _ids
  from (
    select id,
           case when id = _lesson then _position - 0.5 else order_index::numeric end as ord
    from lessons where module_id = _target_module
  ) t;
  perform reorder_lessons(_target_module, _ids);

  if _origen <> _target_module then
    select array_agg(id order by order_index) into _ids
    from lessons where module_id = _origen;
    if _ids is not null then
      perform reorder_lessons(_origen, _ids);
    end if;
  end if;

  return array_length(_ids, 1);
end $$;

revoke execute on function reorder_sections(uuid, uuid[])    from public, anon;
revoke execute on function set_lesson_section(uuid, uuid)    from public, anon;
grant  execute on function reorder_sections(uuid, uuid[])    to authenticated;
grant  execute on function set_lesson_section(uuid, uuid)    to authenticated;
