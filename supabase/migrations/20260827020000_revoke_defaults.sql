-- ============================================================================
-- Revocar los privilegios que Supabase concede por defecto
-- ============================================================================
-- Supabase configura `alter default privileges` en el schema public para que
-- TODA tabla nueva quede concedida a `anon` y `authenticated`. Eso significa que
-- crear una tabla la abre a los roles de usuario sin que nadie lo pida, y que
-- las omisiones deliberadas de la migración de permisos no se respetan.
--
-- Se detectó en el proyecto real: `question_keys` tenía 6 grants para roles de
-- usuario pese a que la migración de permisos no le concede ninguno. No era una
-- fuga —RLS está activo, forzado y sin políticas, así que ningún rol de usuario
-- ve una fila— pero rompía el doble candado de D3, y en un proyecto que vende
-- aislamiento entre clientes la defensa en profundidad no es opcional.
--
-- Las pruebas locales no lo detectaban porque Postgres puro no tiene esos
-- default privileges. `tests/db/stubs.sql` ahora los emula, así que este error
-- ya no puede volver a pasar inadvertido.
-- ============================================================================

-- ── anon no toca ninguna tabla ─────────────────────────────────────────────
-- Las páginas públicas se renderizan en el servidor; el navegador anónimo nunca
-- consulta la base directo.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ── D3 · Restaurar el doble candado ────────────────────────────────────────
-- Sin GRANT, aunque alguien escriba una política permisiva por error, el rol no
-- alcanza la tabla. RLS es el primer candado; este es el segundo.
revoke all on question_keys  from anon, authenticated;
revoke all on reserved_slugs from anon, authenticated;

-- ── Evitar la recurrencia donde se pueda ───────────────────────────────────
-- Los default privileges pertenecen al rol que los definió, así que puede que
-- esta migración no tenga permiso para alterar los de Supabase. Se intenta, y si
-- no se puede, la red de seguridad real es el test de CI que verifica que
-- ninguna tabla nueva quede concedida a anon.
do $$
begin
  execute 'alter default privileges in schema public revoke all on tables from anon';
  execute 'alter default privileges in schema public revoke all on sequences from anon';
  raise notice 'Default privileges de anon revocados para tablas futuras';
exception when insufficient_privilege or others then
  raise notice 'No se pudieron alterar los default privileges (%). El test de CI cubre la recurrencia.', sqlerrm;
end $$;

-- ── Reafirmar lo que authenticated sí necesita ─────────────────────────────
-- Idempotente, y deja el estado final explícito en un solo lugar por si el
-- revoke de arriba se amplía en el futuro.
grant select on
  organizations, memberships, profiles, platform_admins,
  courses, course_pricing, modules, lessons,
  enrollments, lesson_completions, invitations,
  question_banks, questions, question_options,
  exams, exam_questions, exam_attempts, exam_answers, grade_changes
to authenticated;

grant insert, update, delete on
  courses, course_pricing, modules, lessons,
  question_banks, questions, question_options,
  exams, exam_questions,
  enrollments, invitations,
  exam_attempts, exam_answers
to authenticated;

grant insert on grade_changes      to authenticated;
grant insert on lesson_completions to authenticated;
grant update on organizations      to authenticated;
grant update on profiles           to authenticated;

-- service_role conserva acceso completo: es el que usan webhooks, jobs y la
-- corrección de exámenes.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
