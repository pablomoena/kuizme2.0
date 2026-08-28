-- ============================================================================
-- D11 · Dos vías de matrícula: la institución, y el alumno
-- ============================================================================
-- Hasta acá solo el staff podía matricular (enrollment_write). Eso sirve para una
-- institución que gestiona sus alumnos, pero no para vender.
--
-- Se abren dos caminos, y ninguno reemplaza al otro:
--
--   1 · El alumno se matricula SOLO, si el curso es gratuito y publicado.
--   2 · El alumno SOLICITA matrícula, y la institución aprueba. Es el camino de
--       los cursos de pago mientras no exista la pasarela, y sigue siendo útil
--       después para becas, convenios y matrícula asistida.
--
-- Tres cosas que la política tiene que impedir, y que son el motivo de que esto
-- no sea "un insert y listo":
--
--   · Que el alumno se ponga una NOTA. enrollments tiene final_grade: un insert
--     libre permitiría matricularse con un 7 puesto.
--   · Que se marque el curso como COMPLETADO (completed_at, status).
--   · Que se matricule gratis en un curso de pago.
--
-- Y una decisión: la AUSENCIA de precio no es "gratis". Un curso sin fila en
-- course_pricing no se puede auto-matricular. Que algo sea gratuito tiene que ser
-- una decisión explícita de quien lo publica, no el resultado de un olvido.
-- ============================================================================

-- ── ¿Puede este usuario matricularse solo, ahora? ──────────────────────────
-- Una definición para la política y para la interfaz: el botón aparece si y solo
-- si la base lo permitiría.
create or replace function can_self_enroll(_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from courses c
    join course_pricing p on p.course_id = c.id
    where c.id = _course
      and c.status = 'published'
      and p.kind = 'free'
      -- Pertenecer a la institución: Kuizme no es un marketplace abierto, cada
      -- portal es de una institución y sus cursos son para su gente.
      and is_member_of(c.organization_id)
      and not exists (
        select 1 from enrollments e
        where e.course_id = c.id and e.student_id = auth.uid()
      )
  )
$$;

comment on function can_self_enroll(uuid) is
  'D11: curso publicado, con precio explícitamente gratuito, en una organización de la que el usuario es miembro, y sin matrícula previa.';

revoke execute on function can_self_enroll(uuid) from public, anon;
grant  execute on function can_self_enroll(uuid) to authenticated;

-- ── Vía 1 · El alumno se matricula solo ────────────────────────────────────
create policy enrollment_self_insert on enrollments for insert to authenticated
  with check (
    student_id = auth.uid()
    -- Solo puede entrar como activo, sin nota y sin fecha de término. Sin estas
    -- tres condiciones, matricularse y aprobarse serían la misma operación.
    and status = 'active'
    and final_grade is null
    and completed_at is null
    and can_self_enroll(course_id)
  );

-- El alumno puede darse de baja de lo que él mismo tomó. No borra la fila: la
-- deja cancelada, para que la institución conserve el registro de quién estuvo.
create policy enrollment_self_cancel on enrollments for update to authenticated
  using (student_id = auth.uid() and status = 'active')
  with check (
    student_id = auth.uid()
    and status = 'cancelled'
    -- Y no puede cambiar nada más de paso.
    and final_grade is null
    and completed_at is null
  );

-- ── Vía 2 · Solicitudes de matrícula ───────────────────────────────────────
create type enrollment_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table enrollment_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  student_id      uuid not null references auth.users(id) on delete cascade,
  status          enrollment_request_status not null default 'pending',
  -- Lo que el alumno quiera contar: "me lo recomendó el pastor", "necesito beca".
  message         text check (message is null or length(message) <= 1000),
  -- Por qué se rechazó. Obligatorio al rechazar, como en D5 con las notas: una
  -- decisión sobre una persona sin motivo registrado no se puede explicar después.
  resolution_note text,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint rechazo_con_motivo
    check (status <> 'rejected' or length(btrim(coalesce(resolution_note, ''))) > 0),
  constraint resuelta_con_fecha
    check (status = 'pending' or resolved_at is not null)
);

comment on column enrollment_requests.organization_id is
  'derivada por trigger desde courses (D11)';

create trigger enrollment_requests_org before insert on enrollment_requests
  for each row execute function set_organization_id('courses', 'course_id');

-- Una sola solicitud pendiente por curso y alumno: si no, un botón con doble
-- clic llena la bandeja de la institución.
create unique index enrollment_requests_una_pendiente
  on enrollment_requests (course_id, student_id)
  where status = 'pending';

create index enrollment_requests_org_status_idx
  on enrollment_requests (organization_id, status, created_at desc);

alter table enrollment_requests enable row level security;

-- El alumno ve las suyas; el staff, las de su organización.
create policy request_read on enrollment_requests for select to authenticated
  using (
    student_id = auth.uid()
    or has_org_role(organization_id, array['org_admin','instructor']::org_role[])
    or is_platform_admin()
  );

-- Solicita para sí mismo, sobre un curso que puede ver, y sin estar matriculado
-- ya. Nace pendiente: no puede crearla aprobada.
create policy request_insert_own on enrollment_requests for insert to authenticated
  with check (
    student_id = auth.uid()
    and status = 'pending'
    and resolved_at is null
    and resolved_by is null
    and can_view_course(course_id)
    and not exists (
      select 1 from enrollments e
      where e.course_id = enrollment_requests.course_id and e.student_id = auth.uid()
    )
  );

-- El alumno puede retirar la suya mientras esté pendiente. Solo a 'cancelled':
-- aprobarse a sí mismo no es una opción.
create policy request_cancel_own on enrollment_requests for update to authenticated
  using (student_id = auth.uid() and status = 'pending')
  with check (student_id = auth.uid() and status = 'cancelled');

create policy request_manage on enrollment_requests for update to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

revoke all on enrollment_requests from anon;
grant select, insert, update on enrollment_requests to authenticated;
grant select, insert, update, delete on enrollment_requests to service_role;

-- ── Aprobar: una sola sentencia ────────────────────────────────────────────
-- Aprobar son dos escrituras —marcar la solicitud y crear la matrícula— y hacerlas
-- desde el cliente deja el estado a medias si la segunda falla: una solicitud
-- aprobada sin matrícula, o al revés. Acá van juntas o no van.
--
-- `security invoker`: RLS aplica, así que solo el staff de esa organización puede.
--
-- La comprobación de filas afectadas de más abajo NO está verificada por un
-- sabotaje, y conviene decirlo: se intentó y no se pudo. Quitándola, todos los
-- caminos que llegan a un UPDATE de cero filas —el alumno, un soporte de
-- plataforma— fallan igual, pero en el INSERT de enrollments:
--
--   sqlstate=42501  new row violates row-level security policy for table "enrollments"
--   y la solicitud queda pendiente, que es lo correcto
--
-- Se mantiene por dos motivos que sí valen: el error nombra la causa real ("no
-- tienes permiso para resolver esta solicitud") en vez de hablar de una tabla que
-- el llamador no mencionó, y sigue siendo correcta si algún día una política
-- permite ese insert. No es la que protege hoy.
create or replace function approve_enrollment_request(_request uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  r record;
  _enrollment uuid;
  _filas integer;
begin
  select id, course_id, student_id, status into r
  from enrollment_requests where id = _request;

  if not found then
    raise exception 'La solicitud no existe o no la puedes ver' using errcode = 'no_data_found';
  end if;
  if r.status <> 'pending' then
    raise exception 'La solicitud ya está %', r.status using errcode = 'check_violation';
  end if;

  update enrollment_requests
     set status = 'approved', resolved_at = now(), resolved_by = auth.uid()
   where id = _request and status = 'pending';

  get diagnostics _filas = row_count;
  if _filas <> 1 then
    raise exception 'No tienes permiso para resolver esta solicitud'
      using errcode = 'insufficient_privilege';
  end if;

  insert into enrollments (course_id, student_id, status)
  values (r.course_id, r.student_id, 'active')
  on conflict (course_id, student_id) do update set status = 'active'
  returning id into _enrollment;

  return _enrollment;
end $$;

comment on function approve_enrollment_request(uuid) is
  'D11: marca la solicitud aprobada y crea la matrícula en una sola sentencia. security invoker: solo el staff de la organización, por RLS.';

revoke execute on function approve_enrollment_request(uuid) from public, anon;
grant  execute on function approve_enrollment_request(uuid) to authenticated;
