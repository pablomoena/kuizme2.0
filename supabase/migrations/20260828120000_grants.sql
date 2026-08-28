-- ============================================================================
-- Permisos de tabla explícitos
-- ============================================================================
-- En Supabase las políticas RLS no bastan: los roles `anon` y `authenticated`
-- necesitan además GRANT a nivel de tabla. Supabase suele concederlos por
-- default privileges, pero `supabase db push` se conecta con un rol propio y no
-- aplicaron, así que sin esto ni un usuario legítimo puede leer nada.
--
-- Hacerlos explícitos es mejor que depender de los default privileges: la
-- superficie de acceso queda auditable en el repo, y las omisiones a propósito
-- (D3) son visibles en vez de accidentales.
--
-- Las dos capas se combinan así:
--   GRANT  → qué tablas puede TOCAR el rol
--   RLS    → qué FILAS de esas tablas puede ver o escribir
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ── anon: NADA. ────────────────────────────────────────────────────────────
-- Las páginas públicas (catálogo de cursos, landing de un curso) se renderizan
-- en el servidor, así que el navegador anónimo nunca consulta la base directo.
-- Si algún día hace falta, se abre tabla por tabla y con su política, no en
-- bloque.

-- ── authenticated: lectura amplia, RLS filtra las filas ───────────────────
grant select on
  organizations, memberships, profiles, platform_admins,
  courses, course_pricing, modules, lessons,
  enrollments, lesson_completions, invitations,
  question_banks, questions, question_options,
  exams, exam_questions, exam_attempts, exam_answers, grade_changes
to authenticated;

-- ── authenticated: escritura solo donde hay política que la respalde ──────
grant insert, update, delete on
  courses, course_pricing, modules, lessons,
  question_banks, questions, question_options,
  exams, exam_questions,
  enrollments, invitations,
  exam_attempts, exam_answers
to authenticated;

grant insert on grade_changes to authenticated;   -- staff registra el cambio
grant insert on lesson_completions to authenticated;  -- el alumno marca completada
grant update on organizations to authenticated;   -- solo org_admin, por RLS
grant update on profiles to authenticated;        -- solo el propio, por RLS

-- ── D3 · question_keys y reserved_slugs quedan FUERA a propósito ──────────
-- No llevan GRANT para authenticated ni para anon, y tampoco tienen políticas.
-- Doble candado: aunque alguien escriba una política permisiva por error, sin
-- GRANT el rol no alcanza la tabla. La clave de respuestas solo la lee el
-- servidor con service_role o una función SECURITY DEFINER.
grant select, insert, update, delete on question_keys  to service_role;
grant select, insert, update, delete on reserved_slugs to service_role;

-- ── service_role: acceso completo (webhooks, jobs, corrección de exámenes) ─
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- ── Futuras tablas heredan el patrón ──────────────────────────────────────
-- Evita que una tabla nueva quede inaccesible y alguien "arregle" el problema
-- concediendo permisos a lo bruto.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;

-- ── Política que faltaba: el GRANT de INSERT sobre grade_changes necesita una
--    política que lo respalde, o el registro de cambios de nota falla en
--    silencio y D5 queda decorativo.
create policy grade_change_insert on grade_changes for insert to authenticated
  with check (
    has_org_role(organization_id, array['org_admin','instructor']::org_role[])
    and changed_by = auth.uid()
  );
