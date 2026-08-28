-- ============================================================================
-- D8 · La ficha de la lección y su contenido son dos cosas distintas
-- ============================================================================
-- Para vender un curso hay que poder mostrarlo antes de cobrarlo: el temario
-- completo, y una lección abierta para que el alumno decida con algo en la mano.
--
-- D7 dejó módulos y lecciones detrás de `can_study_course`, que exige matrícula.
-- Eso protege el contenido pero también esconde el temario, y sin temario no hay
-- página de venta.
--
-- RLS filtra FILAS, no columnas, así que no se puede publicar el título de una
-- lección y esconder su cuerpo en la misma tabla. Es exactamente el problema que
-- D3 resolvió con la clave de respuestas: si dos datos tienen reglas de acceso
-- distintas, viven en tablas distintas. Se aplica el mismo remedio.
--
--   lessons          ficha: título, tipo, orden, duración, si es obligatoria,
--                    si es preview. Legible a nivel CATÁLOGO.
--   lesson_contents  cuerpo, video, enlace externo. Exige matrícula, salvo que
--                    la lección esté marcada como preview.
--
-- Así el temario se puede mostrar sin exponer nada, y abrir una lección es
-- marcar una casilla en vez de mover contenido a otro sitio.
-- ============================================================================

alter table lessons add column is_preview boolean not null default false;

comment on column lessons.is_preview is
  'D8: si es true, su contenido se lee sin matrícula (siempre que el curso sea visible en catálogo). La lección de muestra.';

-- ── El contenido, aparte ───────────────────────────────────────────────────
create table lesson_contents (
  lesson_id       uuid primary key references lessons(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  body            text,
  video_id        text,
  external_url    text,
  updated_at      timestamptz not null default now()
);

create index lesson_contents_course_idx on lesson_contents (course_id);

-- Las claves de tenant y de curso se derivan del padre, como en D2/D7: la
-- aplicación manda lesson_id y nada más.
create or replace function set_lesson_content_keys() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select l.organization_id, l.course_id
    into new.organization_id, new.course_id
    from lessons l where l.id = new.lesson_id;
  if new.organization_id is null then
    raise exception 'No se puede derivar la organización desde lessons(%)', new.lesson_id;
  end if;
  return new;
end $$;

create trigger lesson_contents_keys before insert on lesson_contents
  for each row execute function set_lesson_content_keys();

create trigger lesson_contents_touch before update on lesson_contents
  for each row execute function touch_updated_at();

-- ── Mover el contenido que hubiera, y quitarlo de lessons ──────────────────
insert into lesson_contents (lesson_id, organization_id, course_id, body, video_id, external_url)
select l.id, l.organization_id, l.course_id, l.body, l.video_id, l.external_url
from lessons l
where l.body is not null or l.video_id is not null or l.external_url is not null;

alter table lessons drop column body;
alter table lessons drop column video_id;
alter table lessons drop column external_url;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table lesson_contents enable row level security;
alter table lesson_contents force row level security;

-- El temario sube a nivel catálogo. can_view_course ya exige pertenecer a la
-- organización y que el curso esté publicado y no privado, o bien matrícula, o
-- bien ser staff — así que esto no abre nada entre tenants ni muestra borradores.
drop policy modules_read on modules;
drop policy lessons_read on lessons;

create policy modules_read on modules for select to authenticated
  using (can_view_course(course_id));

create policy lessons_read on lessons for select to authenticated
  using (can_view_course(course_id));

-- El contenido sigue exigiendo matrícula. La excepción es la lección de muestra,
-- y se comprueba contra la fila de lessons, no contra un parámetro del cliente.
create policy lesson_contents_read on lesson_contents for select to authenticated
  using (
    can_study_course(course_id)
    or (
      exists (select 1 from lessons l where l.id = lesson_id and l.is_preview)
      and can_view_course(course_id)
    )
  );

create policy lesson_contents_write on lesson_contents for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

-- Los grants no los hereda una tabla nueva de forma fiable: Supabase concede por
-- defecto a anon y authenticated (trampa 2), y la migración de revocación ya
-- corrió, así que hay que ser explícito en ambos sentidos.
revoke all on lesson_contents from anon;
grant select, insert, update, delete on lesson_contents to authenticated;
grant select, insert, update, delete on lesson_contents to service_role;
