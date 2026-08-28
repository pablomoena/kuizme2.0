-- ============================================================================
-- D12 · Controles de inscripción: abierta, plazo y cupo
-- ============================================================================
-- La v1 tenía tres columnas para esto y ninguna funcionaba de verdad:
--
--   enrollment_open       la pantalla de configuración la escribía FIJA en true,
--                         así que cada guardado reabría las inscripciones
--   enrollment_deadline    columna existente, sin una sola referencia en el código
--   max_students           se guardaba, pero nada impedía pasarse del cupo
--
-- Yo construí la matrícula (D11) sin ninguna de las tres, porque no había
-- auditado esta parte de la configuración del curso. Este es el hueco.
--
-- Dos reglas distintas a propósito:
--
--   · `enrollment_open` y `enrollment_deadline` gobiernan la AUTO-matrícula. Que
--     una institución matricule a alguien fuera de plazo es legítimo —una
--     admisión tardía, un convenio— y no debería exigir reabrir el curso para
--     todos.
--   · `max_students` gobierna A TODOS, incluida la institución. Un cupo es
--     capacidad, no una regla sobre quién pide; si hace falta más, se sube el
--     cupo, y eso queda como un cambio explícito en vez de una excepción
--     invisible.
-- ============================================================================

alter table courses
  add column enrollment_open     boolean     not null default true,
  add column enrollment_deadline timestamptz,
  add column max_students        integer     check (max_students is null or max_students > 0);

comment on column courses.enrollment_open is
  'D12: si false, nadie se auto-matricula. La institución sí puede seguir matriculando a mano.';
comment on column courses.enrollment_deadline is
  'D12: fecha límite para auto-matricularse. No limita a la institución.';
comment on column courses.max_students is
  'D12: máximo de alumnos CURSANDO a la vez (status active). Un alumno que termina o se da de baja libera el cupo; así el cupo sirve en un curso que se dicta más de una vez. Aplica también a la institución.';

-- ── El cupo, con cerrojo ───────────────────────────────────────────────────
-- Contar y después insertar es una condición de carrera: dos alumnos que
-- pulsan "Matricularme" a la vez pueden pasar los dos y dejar 31 en un cupo de
-- 30. `for update` sobre la fila del curso serializa a los que compiten por el
-- mismo curso, y a nadie más.
create or replace function check_enrollment_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _max     integer;
  _activos integer;
begin
  -- Solo ocupa cupo quien queda cursando.
  if new.status <> 'active' then
    return new;
  end if;

  select max_students into _max
  from courses where id = new.course_id
  for update;

  if _max is null then
    return new;
  end if;

  select count(*) into _activos
  from enrollments
  where course_id = new.course_id and status = 'active';

  if _activos >= _max then
    raise exception 'El curso alcanzó su cupo de % alumnos', _max
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger enrollments_capacity before insert on enrollments
  for each row execute function check_enrollment_capacity();

-- Reactivar una matrícula cancelada también ocupa cupo.
create trigger enrollments_capacity_update before update on enrollments
  for each row when (new.status = 'active' and old.status <> 'active')
  execute function check_enrollment_capacity();

-- ── Por qué NO puede auto-matricularse ─────────────────────────────────────
-- Devolver el motivo y no solo un booleano: la interfaz tiene que poder decir
-- "cupo agotado" en vez de "este curso no admite matrícula directa", que sería
-- verdad y a la vez inútil.
create or replace function self_enroll_blocker(_course uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select co.id, co.organization_id, co.status, co.enrollment_open,
         co.enrollment_deadline, co.max_students, p.kind as pricing_kind
    into c
  from courses co
  left join course_pricing p on p.course_id = co.id
  where co.id = _course;

  if not found then return 'no-existe'; end if;
  if not is_member_of(c.organization_id) then return 'no-miembro'; end if;
  if c.status <> 'published' then return 'no-publicado'; end if;

  if exists (
    select 1 from enrollments e
    where e.course_id = c.id and e.student_id = auth.uid()
      and e.status in ('active', 'completed')
  ) then
    return 'ya-matriculado';
  end if;

  -- La ausencia de precio no es "gratis" (D11).
  if c.pricing_kind is null or c.pricing_kind <> 'free' then return 'no-gratis'; end if;

  if not c.enrollment_open then return 'cerrada'; end if;
  if c.enrollment_deadline is not null and c.enrollment_deadline <= now() then
    return 'plazo-vencido';
  end if;

  if c.max_students is not null then
    if (select count(*) from enrollments
         where course_id = c.id and status = 'active') >= c.max_students then
      return 'cupo-lleno';
    end if;
  end if;

  return null;
end $$;

comment on function self_enroll_blocker(uuid) is
  'D12: null si puede auto-matricularse; si no, el motivo concreto. Es la autoridad: can_self_enroll() la envuelve.';

-- can_self_enroll pasa a ser una envoltura, para que no haya dos reglas.
create or replace function can_self_enroll(_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select self_enroll_blocker(_course) is null
$$;

revoke execute on function self_enroll_blocker(uuid) from public, anon;
grant  execute on function self_enroll_blocker(uuid) to authenticated;
