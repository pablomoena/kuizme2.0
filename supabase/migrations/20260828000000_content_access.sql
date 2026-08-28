-- ============================================================================
-- D7 · La lectura de contenido se gana; no se hereda de la membresía
-- ============================================================================
-- Las políticas de la migración inicial usaban un solo patrón para todo:
--   leer  = is_member_of(organization_id)
--   escribir = has_org_role(organization_id, [org_admin, instructor])
--
-- Ese patrón es correcto para el aislamiento entre tenants —y sigue siéndolo—
-- pero es demasiado permisivo dentro de un tenant. Se verificó con sesiones
-- reales de un alumno de la organización A, sin ninguna matrícula:
--
--   FALLA  veía 1 curso en BORRADOR
--   FALLA  leía el cuerpo de una lección de un curso donde no está matriculado
--   FALLA  veía el banco de preguntas completo
--   FALLA  leía los enunciados y las alternativas de los exámenes
--   FALLA  veía el armado exacto de cada examen (qué preguntas y en qué orden)
--
-- La clave de respuestas nunca fue alcanzable (D3 aguantó), así que no podía
-- saber cuál era la correcta. Pero tener el examen completo por adelantado
-- rompe la evaluación igual, y leer contenido de pago sin matrícula rompe el
-- negocio. Membresía significa "pertenezco a esta institución", no "puedo leer
-- todo lo que la institución produce".
--
-- Regla nueva: el contenido exige una relación concreta —ser staff, o estar
-- matriculado en un curso publicado— y el material de evaluación no lo lee
-- ningún alumno por SQL; lo entrega el servidor, igual que la clave de
-- respuestas (D3) y las transiciones del intento (D4).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0 · Corrección previa: `force row level security` en las tablas que leen los
--     helpers dejaba la aplicación en blanco según quién sea el rol dueño
-- ────────────────────────────────────────────────────────────────────────────
-- is_member_of() y has_org_role() son `security definer` y leen memberships.
-- Una función definer corre como el DUEÑO de la función, no como el usuario.
-- Con `force row level security`, RLS alcanza también al dueño; y las políticas
-- de memberships están declaradas `to authenticated`, un rol que el dueño no
-- es. Resultado: ninguna política aplica, RLS niega por defecto, y los helpers
-- devuelven false para todo.
--
-- En las pruebas no se veía porque el dueño era superusuario, y los
-- superusuarios se saltan RLS siempre. Se reprodujo el caso real traspasando
-- tablas y funciones a un rol `nosuperuser nobypassrls`:
--
--   con force:  organizations 0 filas, courses 0 filas   ← aplicación en blanco
--   sin force:  organizations 1 fila,  courses 2 filas   ← correcto y aislado
--
-- Falla cerrado, así que nunca fue una fuga. Pero era una dependencia oculta en
-- un detalle de configuración de Supabase que no controlamos. Quitando `force`
-- solo de estas dos tablas, el comportamiento deja de depender de eso.
-- RLS sigue ACTIVO: `authenticated` sigue restringido por sus políticas. Lo
-- único que se pierde es la protección contra un dueño comprometido, y ese rol
-- ya se salta RLS por diseño (service_role) o no es alcanzable por un usuario.
alter table memberships     no force row level security;
alter table platform_admins no force row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 1 · D2 extendido: lessons.course_id denormalizado
-- ────────────────────────────────────────────────────────────────────────────
-- lessons solo tenía module_id, así que una política sobre lecciones necesitaba
-- un subselect a modules para llegar al curso. Es el mismo join anidado que D2
-- eliminó para organization_id. Se aplica el mismo remedio: la clave se
-- denormaliza por trigger y la política queda en una sola comparación.
alter table lessons add column course_id uuid references courses(id) on delete cascade;

update lessons l set course_id = m.course_id
  from modules m where m.id = l.module_id;

alter table lessons alter column course_id set not null;
create index lessons_course_idx on lessons (course_id, order_index);

create or replace function set_lesson_course_id() returns trigger
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

-- Antes que lessons_org, que ya deriva organization_id desde modules.
create trigger lessons_course before insert on lessons
  for each row execute function set_lesson_course_id();

-- Mover una lección de módulo no puede dejar el course_id apuntando al curso
-- viejo: sería una fila visible para el conjunto equivocado de alumnos.
create or replace function sync_lesson_course_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.module_id is distinct from old.module_id then
    select m.course_id into new.course_id from modules m where m.id = new.module_id;
  end if;
  return new;
end $$;

create trigger lessons_course_sync before update on lessons
  for each row execute function sync_lesson_course_id();

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · Helpers de acceso a contenido
-- ────────────────────────────────────────────────────────────────────────────
-- Ninguno lee la tabla que la política protege: la política usa las columnas de
-- su propia fila y el helper consulta otra tabla. Así no hay ciclo posible en
-- la evaluación de políticas, independientemente de los privilegios del dueño.

create or replace function is_enrolled_in(_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.course_id = _course
      and e.student_id = auth.uid()
      and e.status in ('active', 'completed')
  )
$$;

-- Nivel catálogo: saber que el curso existe y cuánto cuesta.
create or replace function can_view_course(_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    where c.id = _course
      and (
        has_org_role(c.organization_id, array['org_admin','instructor']::org_role[])
        or is_platform_admin()
        or (is_member_of(c.organization_id)
            and c.status = 'published' and c.visibility <> 'private')
        or is_enrolled_in(c.id)
      )
  )
$$;

-- Nivel contenido: módulos, lecciones y su cuerpo. Exige matrícula.
create or replace function can_study_course(_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    where c.id = _course
      and (
        has_org_role(c.organization_id, array['org_admin','instructor']::org_role[])
        or is_platform_admin()
        or (c.status = 'published' and is_enrolled_in(c.id))
      )
  )
$$;

revoke execute on function is_enrolled_in(uuid)   from public, anon;
revoke execute on function can_view_course(uuid)  from public, anon;
revoke execute on function can_study_course(uuid) from public, anon;
grant  execute on function is_enrolled_in(uuid)   to authenticated;
grant  execute on function can_view_course(uuid)  to authenticated;
grant  execute on function can_study_course(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3 · Políticas de lectura nuevas
-- ────────────────────────────────────────────────────────────────────────────
-- Las de escritura no se tocan: siguen siendo staff de la organización.

drop policy courses_read         on courses;
drop policy course_pricing_read  on course_pricing;
drop policy modules_read         on modules;
drop policy lessons_read         on lessons;
drop policy exams_read           on exams;

-- courses: se evalúa contra las columnas de la propia fila, sin releer courses.
-- La rama de catálogo lleva is_member_of a propósito. Sin ella, un curso
-- publicado y no privado quedaba legible para usuarios de OTRAS
-- organizaciones: la suite de aislamiento lo detectó al primer intento
-- (admin A veía 2 cursos donde debía ver 1). El catálogo público entre
-- tenants, si alguna vez se necesita, lo sirve el servidor con el tenant ya
-- resuelto desde el hostname. RLS no concede lecturas entre tenants nunca.
create policy courses_read on courses for select to authenticated
  using (
    has_org_role(organization_id, array['org_admin','instructor']::org_role[])
    or is_platform_admin()
    or (is_member_of(organization_id)
        and status = 'published' and visibility <> 'private')
    or is_enrolled_in(id)
  );

create policy course_pricing_read on course_pricing for select to authenticated
  using (can_view_course(course_id));

create policy modules_read on modules for select to authenticated
  using (can_study_course(course_id));

create policy lessons_read on lessons for select to authenticated
  using (can_study_course(course_id));

-- exams: el alumno ve el examen que le toca dar, con sus reglas (intentos,
-- tiempo, ventana). Un examen sin curso es de organización y por ahora solo lo
-- ve el staff; cuando exista ese caso de uso se resuelve explícitamente.
create policy exams_read on exams for select to authenticated
  using (
    has_org_role(organization_id, array['org_admin','instructor']::org_role[])
    or is_platform_admin()
    or (status = 'published' and course_id is not null and is_enrolled_in(course_id))
  );

-- El material de evaluación deja de tener política de lectura para alumnos. El
-- staff lo sigue leyendo por su política de escritura (`for all`). El alumno lo
-- recibe del servidor al iniciar un intento, que es donde se aplican el orden
-- aleatorio, el límite de tiempo y el recuento de intentos. Igual que la clave
-- de respuestas: si el dato no viaja, no hay endurecimiento que se pueda
-- olvidar.
drop policy question_banks_read   on question_banks;
drop policy questions_read        on questions;
drop policy question_options_read on question_options;
drop policy exam_questions_read   on exam_questions;

comment on function can_study_course(uuid) is
  'D7: acceso a contenido. Staff de la organización, o matrícula activa en un curso publicado.';
comment on function can_view_course(uuid) is
  'D7: acceso a catálogo. Más laxo que can_study_course: no da acceso al contenido.';
