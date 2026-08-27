-- ============================================================================
-- Kuizme · esquema núcleo
-- ============================================================================
-- Escrito de cero, informado por la auditoría de la v1 (Lovable). Las seis
-- decisiones de diseño que cierran los agujeros documentados van marcadas D1..D6.
--
-- Modelo de seguridad en tres capas:
--   1. Middleware  — resuelve el tenant desde el hostname.
--   2. Servidor    — toda escritura y toda lectura sensible, con el token del
--                    usuario (no service role), filtrando por el tenant activo.
--   3. RLS         — defensa en profundidad: un usuario solo alcanza las
--                    organizaciones de las que es miembro.
--
-- Regla que no se negocia: el service role se usa SOLO en webhooks y tareas de
-- sistema. Si el servidor usa service role para operaciones de usuario, la capa
-- 3 desaparece y volvemos al modelo que produjo los tres P0 de la v1.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ────────────────────────────────────────────────────────────────────────────
-- Tipos
-- ────────────────────────────────────────────────────────────────────────────
create type platform_role     as enum ('admin', 'support');
create type org_role          as enum ('org_admin', 'instructor', 'student');
create type org_status        as enum ('trial', 'active', 'suspended', 'cancelled');
create type course_status     as enum ('draft', 'published', 'archived');
create type course_visibility as enum ('private', 'unlisted', 'public');  -- D6: una sola columna canónica
create type pricing_kind      as enum ('free', 'one_time', 'subscription');
create type lesson_kind       as enum ('video', 'text', 'file', 'audio', 'embed', 'live', 'exam');
create type question_kind     as enum (
  'multiple_choice', 'multiple_selection', 'true_false', 'short_answer',
  'fill_blank', 'matching', 'ordering', 'numeric', 'essay'
);
create type exam_status       as enum ('draft', 'published', 'archived');
create type attempt_status    as enum ('in_progress', 'submitted', 'graded', 'expired');
create type enrollment_status as enum ('active', 'completed', 'suspended', 'cancelled');
create type invitation_status as enum ('pending', 'sent', 'accepted', 'expired', 'revoked');

-- ────────────────────────────────────────────────────────────────────────────
-- D1 · Tenancy: membresías, no "un usuario = una organización"
-- ────────────────────────────────────────────────────────────────────────────
create table organizations (
  id                uuid primary key default gen_random_uuid(),
  slug              citext not null unique,
  name              text   not null,
  country           char(2) not null default 'CL',   -- decide el rail de pago
  locale            text   not null default 'es-CL',
  timezone          text   not null default 'America/Santiago',
  status            org_status not null default 'trial',
  custom_domain     citext unique,
  logo_url          text,
  primary_color     text,
  accent_color      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- El cast a text es deliberado: `slug` es citext, y sobre citext el operador
  -- `~` ignora mayúsculas, así que 'MAYUS' pasaría la validación.
  constraint organizations_slug_format
    check (slug::text ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$')
);
comment on column organizations.slug is 'Subdominio: {slug}.kuizme.com';

-- Subdominios de sistema que ningún tenant puede reclamar.
create table reserved_slugs (slug citext primary key);
insert into reserved_slugs (slug) values
  ('app'),('www'),('api'),('admin'),('static'),('assets'),('cdn'),('mail'),
  ('smtp'),('ftp'),('blog'),('docs'),('help'),('support'),('status'),('billing'),
  ('login'),('auth'),('dashboard'),('kuizme'),('test'),('staging'),('dev');

create or replace function normalize_and_check_slug() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Liberal al recibir, estricto al guardar: si alguien se registra escribiendo
  -- "IBMiel", se guarda "ibmiel" en vez de rechazarlo. El CHECK de formato
  -- valida después el valor ya normalizado.
  new.slug := lower(btrim(new.slug::text))::citext;
  if new.custom_domain is not null then
    new.custom_domain := lower(btrim(new.custom_domain::text))::citext;
  end if;

  if exists (select 1 from reserved_slugs r where r.slug = new.slug) then
    raise exception 'El subdominio "%" está reservado', new.slug
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger organizations_slug_guard
  before insert or update of slug, custom_domain on organizations
  for each row execute function normalize_and_check_slug();

-- Roles de plataforma en su propia tabla. En v1 vivían en user_roles con
-- organization_id NULL, y el frontend filtraba por organización: el resultado
-- era que un platform_admin resolvía siempre a rol nulo y el panel de
-- plataforma era inalcanzable.
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       platform_role not null,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role            org_role not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id)
);
create index memberships_org_idx on memberships (organization_id, role);
comment on table memberships is
  'D1: el mismo usuario puede pertenecer a varias organizaciones. v1 tenía un índice único que lo prohibía.';

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  last_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers de autorización
-- ────────────────────────────────────────────────────────────────────────────
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins p where p.user_id = auth.uid())
$$;

create or replace function is_member_of(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.organization_id = _org
  )
$$;

create or replace function has_org_role(_org uuid, _roles org_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and m.organization_id = _org
      and m.role = any(_roles)
  )
$$;

revoke execute on function is_platform_admin()             from public, anon;
revoke execute on function is_member_of(uuid)              from public, anon;
revoke execute on function has_org_role(uuid, org_role[])  from public, anon;
grant  execute on function is_platform_admin()             to authenticated;
grant  execute on function is_member_of(uuid)              to authenticated;
grant  execute on function has_org_role(uuid, org_role[])  to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- D2 · organization_id en todas las tablas de tenant, derivado por trigger
-- ────────────────────────────────────────────────────────────────────────────
-- En v1 solo 21 de 46 tablas lo tenían; las otras 25 lo derivaban con joins de
-- hasta tres niveles dentro de las políticas. Ahí se colaron los errores.
-- Con esto, toda política de tenant es una sola comparación.
create or replace function set_organization_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _parent text := tg_argv[0];
  _fk     text := tg_argv[1];
  _fk_val uuid;
  _org    uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;
  _fk_val := (to_jsonb(new) ->> _fk)::uuid;
  if _fk_val is null then
    raise exception 'No se puede derivar organization_id: %.% es null', tg_table_name, _fk;
  end if;
  execute format('select organization_id from public.%I where id = $1', _parent)
    into _org using _fk_val;
  if _org is null then
    raise exception 'No se puede derivar organization_id desde %(%)', _parent, _fk_val;
  end if;
  new.organization_id := _org;
  return new;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- D6 · Cursos: estructura y publicación acá, precios aparte
-- ────────────────────────────────────────────────────────────────────────────
-- v1 tenía 53 columnas en courses mezclando estructura, precios, copy de
-- landing y estado de Zoom — y dos banderas (is_public y visibility) decidiendo
-- el mismo permiso, evaluadas por 13 y 9 políticas sin nada que las sincronice.
create table courses (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  slug               citext not null,
  title              text not null,
  subtitle           text,
  description        text,
  cover_image_url    text,
  status             course_status not null default 'draft',
  visibility         course_visibility not null default 'private',
  level              text,
  language           text not null default 'es',
  estimated_hours    numeric(5,1),
  min_passing_grade  numeric(5,2) not null default 60 check (min_passing_grade between 0 and 100),
  certificate_enabled boolean not null default false,
  created_by         uuid references auth.users(id) on delete set null,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, slug)
);
create index courses_org_status_idx on courses (organization_id, status);

create table course_pricing (
  course_id       uuid primary key references courses(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            pricing_kind not null default 'free',
  amount_cents    integer check (amount_cents is null or amount_cents >= 0),
  currency        char(3) not null default 'CLP',
  updated_at      timestamptz not null default now(),
  constraint pricing_amount_required
    check (kind = 'free' or amount_cents is not null)
);
create trigger course_pricing_org before insert on course_pricing
  for each row execute function set_organization_id('courses', 'course_id');

create table modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  title           text not null,
  description     text,
  order_index     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index modules_course_idx on modules (course_id, order_index);
create trigger modules_org before insert on modules
  for each row execute function set_organization_id('courses', 'course_id');

create table lessons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  module_id       uuid not null references modules(id) on delete cascade,
  title           text not null,
  kind            lesson_kind not null default 'text',
  order_index     integer not null default 0,
  is_required     boolean not null default true,
  -- contenido según kind
  body            text,
  video_id        text,
  external_url    text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- liberación programada
  unlock_after_days integer check (unlock_after_days is null or unlock_after_days >= 0),
  unlock_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index lessons_module_idx on lessons (module_id, order_index);
create trigger lessons_org before insert on lessons
  for each row execute function set_organization_id('modules', 'module_id');

-- ────────────────────────────────────────────────────────────────────────────
-- Matrículas y personas (alcance acordado: quién está en qué, sin capa de CRM)
-- ────────────────────────────────────────────────────────────────────────────
create table enrollments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  student_id      uuid not null references auth.users(id) on delete cascade,
  status          enrollment_status not null default 'active',
  final_grade     numeric(5,2),
  enrolled_at     timestamptz not null default now(),
  completed_at    timestamptz,
  unique (course_id, student_id)
);
create index enrollments_org_student_idx on enrollments (organization_id, student_id);
create trigger enrollments_org before insert on enrollments
  for each row execute function set_organization_id('courses', 'course_id');

create table lesson_completions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lesson_id       uuid not null references lessons(id) on delete cascade,
  student_id      uuid not null references auth.users(id) on delete cascade,
  completed_at    timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index lesson_completions_student_idx on lesson_completions (student_id, lesson_id);
create trigger lesson_completions_org before insert on lesson_completions
  for each row execute function set_organization_id('lessons', 'lesson_id');

create table invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           citext not null,
  role            org_role not null default 'student',
  course_id       uuid references courses(id) on delete set null,
  token           uuid not null default gen_random_uuid() unique,
  status          invitation_status not null default 'pending',
  invited_by      uuid references auth.users(id) on delete set null,
  expires_at      timestamptz not null default now() + interval '14 days',
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index invitations_org_email_idx on invitations (organization_id, email);

-- ────────────────────────────────────────────────────────────────────────────
-- Exámenes
-- ────────────────────────────────────────────────────────────────────────────
create table question_banks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title           text not null,
  topic           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index question_banks_org_idx on question_banks (organization_id);

-- questions NO guarda la respuesta correcta. Ver D3.
create table questions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  bank_id         uuid not null references question_banks(id) on delete cascade,
  kind            question_kind not null,
  prompt          text not null,
  points          numeric(6,2) not null default 1 check (points > 0),
  config          jsonb not null default '{}'::jsonb,  -- tolerancia, puntaje parcial, etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index questions_bank_idx on questions (bank_id);
create trigger questions_org before insert on questions
  for each row execute function set_organization_id('question_banks', 'bank_id');

-- question_options NO guarda is_correct. Ver D3.
create table question_options (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  label           text not null,
  order_index     integer not null default 0
);
create index question_options_question_idx on question_options (question_id, order_index);
create trigger question_options_org before insert on question_options
  for each row execute function set_organization_id('questions', 'question_id');

-- ── D3 · La clave de respuestas vive acá y NO tiene políticas para authenticated
-- En v1, questions.correct_answer y question_options.is_correct estaban en
-- tablas legibles por los alumnos. RLS filtra filas, no columnas, así que el
-- endurecimiento del RPC no servía: `select correct_answer from questions`
-- devolvía la clave de todos los exámenes de la organización.
create table question_keys (
  question_id     uuid primary key references questions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  answer          jsonb not null,   -- forma según questions.kind
  explanation     text,
  updated_at      timestamptz not null default now()
);
create trigger question_keys_org before insert on question_keys
  for each row execute function set_organization_id('questions', 'question_id');
comment on table question_keys is
  'D3: sin políticas para authenticated. Solo la alcanzan el servidor y funciones SECURITY DEFINER.';

create table exams (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  course_id           uuid references courses(id) on delete cascade,
  title               text not null,
  description         text,
  status              exam_status not null default 'draft',
  passing_score       numeric(5,2) not null default 60 check (passing_score between 0 and 100),
  max_attempts        integer not null default 1 check (max_attempts > 0),
  time_limit_seconds  integer check (time_limit_seconds is null or time_limit_seconds > 0),
  available_from      timestamptz,
  available_until     timestamptz,
  randomize_questions boolean not null default false,
  randomize_options   boolean not null default false,
  show_results        text not null default 'after_submit',
  weight_in_course    numeric(5,2) not null default 0 check (weight_in_course >= 0),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint exams_window_order
    check (available_until is null or available_from is null or available_until > available_from)
);
create index exams_org_status_idx on exams (organization_id, status);

create table exam_questions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  exam_id         uuid not null references exams(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  order_index     integer not null default 0,
  unique (exam_id, question_id)
);
create index exam_questions_exam_idx on exam_questions (exam_id, order_index);
create trigger exam_questions_org before insert on exam_questions
  for each row execute function set_organization_id('exams', 'exam_id');

-- Enlace lección ↔ examen
alter table lessons add column exam_id uuid references exams(id) on delete set null;
create index lessons_exam_idx on lessons (exam_id) where exam_id is not null;

-- ── D4 · El intento es una máquina de estados: el alumno no tiene UPDATE
create table exam_attempts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  exam_id            uuid not null references exams(id) on delete cascade,
  student_id         uuid not null references auth.users(id) on delete cascade,
  attempt_number     integer not null check (attempt_number > 0),
  status             attempt_status not null default 'in_progress',
  score              numeric(5,2) check (score is null or score between 0 and 100),
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),
  unique (exam_id, student_id, attempt_number),
  -- Un intento entregado tiene fecha de entrega; uno en progreso, no.
  constraint attempt_submitted_consistency
    check ((status = 'in_progress') = (submitted_at is null))
);
create index exam_attempts_exam_idx on exam_attempts (exam_id, student_id);
create trigger exam_attempts_org before insert on exam_attempts
  for each row execute function set_organization_id('exams', 'exam_id');

create table exam_answers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  attempt_id      uuid not null references exam_attempts(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  response        jsonb,
  is_correct      boolean,
  points_earned   numeric(6,2),
  feedback        text,
  graded_by       uuid references auth.users(id) on delete set null,
  graded_at       timestamptz,
  updated_at      timestamptz not null default now(),
  unique (attempt_id, question_id),
  -- D4: el dato que produjo "6 preguntas Sin responder marcadas como correctas"
  -- en v1 deja de ser representable.
  constraint answer_correct_requires_response
    check (is_correct is not true or response is not null)
);
create index exam_answers_attempt_idx on exam_answers (attempt_id);
create trigger exam_answers_org before insert on exam_answers
  for each row execute function set_organization_id('exam_attempts', 'attempt_id');

-- ── D5 · Trazabilidad de notas
-- En v1 hay calificaciones editadas a mano por SQL directo, sin registro de
-- quién, cuándo ni por qué. En un instituto que emite certificados eso no basta.
create table grade_changes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  attempt_id      uuid references exam_attempts(id) on delete set null,
  answer_id       uuid references exam_answers(id) on delete set null,
  changed_by      uuid references auth.users(id) on delete set null,
  changed_at      timestamptz not null default now(),
  field           text not null,
  old_value       jsonb,
  new_value       jsonb,
  reason          text not null check (length(btrim(reason)) > 0),
  constraint grade_change_target
    check (attempt_id is not null or answer_id is not null)
);
create index grade_changes_attempt_idx on grade_changes (attempt_id, changed_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- updated_at automático
-- ────────────────────────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','courses','course_pricing','modules','lessons',
    'questions','question_keys','exams','exam_answers'
  ] loop
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS · Capa 3, defensa en profundidad
-- ────────────────────────────────────────────────────────────────────────────
-- Todo niega por defecto. El patrón es siempre el mismo, por D2:
--   is_member_of(organization_id)  — para leer
--   has_org_role(organization_id, ...) — para escribir
-- Sin joins anidados, sin excepciones por tabla, verificable de un vistazo.

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','reserved_slugs','platform_admins','memberships','profiles',
    'courses','course_pricing','modules','lessons','enrollments',
    'lesson_completions','invitations','question_banks','questions',
    'question_options','question_keys','exams','exam_questions',
    'exam_attempts','exam_answers','grade_changes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- question_keys y reserved_slugs quedan SIN políticas a propósito: RLS activo y
-- cero políticas significa que ningún rol de usuario alcanza una sola fila.
-- Solo el servidor (service role) y funciones SECURITY DEFINER las leen.

create policy org_read on organizations for select to authenticated
  using (is_member_of(id) or is_platform_admin());
create policy org_update on organizations for update to authenticated
  using (has_org_role(id, array['org_admin']::org_role[]) or is_platform_admin())
  with check (has_org_role(id, array['org_admin']::org_role[]) or is_platform_admin());

create policy membership_read_own on memberships for select to authenticated
  using (user_id = auth.uid() or has_org_role(organization_id, array['org_admin']::org_role[]) or is_platform_admin());

create policy profile_read on profiles for select to authenticated
  using (
    id = auth.uid()
    or is_platform_admin()
    or exists (
      select 1 from memberships me, memberships them
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
        and me.organization_id = them.organization_id
        and me.role in ('org_admin','instructor')
    )
  );
create policy profile_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Lectura por membresía; escritura por rol. Un patrón, todas las tablas.
do $$
declare
  t text;
  staff text := 'has_org_role(organization_id, array[''org_admin'',''instructor'']::org_role[])';
begin
  foreach t in array array[
    'courses','course_pricing','modules','lessons','question_banks','questions',
    'question_options','exams','exam_questions'
  ] loop
    execute format(
      'create policy %I_read on public.%I for select to authenticated
         using (is_member_of(organization_id) or is_platform_admin())', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated
         using (%s) with check (%s)', t, t, staff, staff);
  end loop;
end $$;

-- Matrículas y progreso: el alumno ve lo suyo, el staff lo de su organización.
create policy enrollment_read on enrollments for select to authenticated
  using (student_id = auth.uid()
         or has_org_role(organization_id, array['org_admin','instructor']::org_role[])
         or is_platform_admin());
create policy enrollment_write on enrollments for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

create policy completion_read on lesson_completions for select to authenticated
  using (student_id = auth.uid()
         or has_org_role(organization_id, array['org_admin','instructor']::org_role[])
         or is_platform_admin());
create policy completion_insert_own on lesson_completions for insert to authenticated
  with check (student_id = auth.uid() and is_member_of(organization_id));

create policy invitation_manage on invitations for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

-- D4 · Intentos: el alumno LEE lo suyo y no escribe nada. Ninguna política de
-- INSERT ni de UPDATE para el alumno: las transiciones pasan por el servidor.
create policy attempt_read on exam_attempts for select to authenticated
  using (student_id = auth.uid()
         or has_org_role(organization_id, array['org_admin','instructor']::org_role[])
         or is_platform_admin());
create policy attempt_staff_write on exam_attempts for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

create policy answer_read on exam_answers for select to authenticated
  using (
    exists (select 1 from exam_attempts a
            where a.id = exam_answers.attempt_id and a.student_id = auth.uid())
    or has_org_role(organization_id, array['org_admin','instructor']::org_role[])
    or is_platform_admin()
  );
create policy answer_staff_write on exam_answers for all to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]))
  with check (has_org_role(organization_id, array['org_admin','instructor']::org_role[]));

create policy grade_change_read on grade_changes for select to authenticated
  using (has_org_role(organization_id, array['org_admin','instructor']::org_role[]) or is_platform_admin());

create policy platform_admin_read on platform_admins for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());
