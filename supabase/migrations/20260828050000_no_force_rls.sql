-- ============================================================================
-- `force row level security` es incompatible con nuestro patrón de helpers
-- ============================================================================
-- Ya se quitó FORCE de memberships y platform_admins en D7, con este
-- razonamiento: los helpers is_member_of() y has_org_role() son SECURITY
-- DEFINER, corren como el DUEÑO de la función, y con FORCE ese rol queda sujeto
-- a RLS. Como las políticas están declaradas `to authenticated` —rol que el
-- dueño no es— ninguna aplica y los helpers devuelven false para todo.
--
-- Entonces arreglé las dos tablas que conocía y dejé el resto. Fue un arreglo a
-- medias: el problema no era de esas dos tablas, era del patrón.
--
-- Al diseñar la configuración de entrega por curso necesité una función que
-- leyera matrículas, y eso me llevó a probar el camino que mi propia prueba del
-- rol dueño NO cubría: un alumno MATRICULADO. Pasaba solo porque usaba un
-- administrador, que llega por has_org_role → memberships, la tabla que sí había
-- arreglado. Con un alumno:
--
--   FALLA  el alumno matriculado ve 0 curso(s)
--   FALLA  alcanza 0 contenido(s) de su curso
--   INFO   is_enrolled_in devuelve: f
--
-- is_enrolled_in lee `enrollments`, que sí tenía FORCE. En un proyecto donde el
-- rol dueño no se salte RLS, toda la experiencia del alumno queda en blanco.
--
-- Lo mismo alcanza a los triggers: set_organization_id() es SECURITY DEFINER y
-- lee la tabla padre. Con FORCE ahí, cada inserción fallaría con "No se puede
-- derivar organization_id".
--
-- Por eso FORCE se quita de todas las tablas. Qué se pierde y qué no:
--
--   · RLS sigue ACTIVO en todas. anon y authenticated siguen restringidos por
--     sus políticas exactamente igual: la suite de aislamiento y la de acceso a
--     contenido lo comprueban con sesiones reales.
--   · question_keys y reserved_slugs siguen inalcanzables: RLS activo, cero
--     políticas y cero grants para roles de usuario. FORCE nunca fue lo que las
--     protegía.
--   · Lo único que se pierde es la protección contra un DUEÑO comprometido, y
--     ese rol ya se salta RLS por diseño (service_role) o no es alcanzable por
--     un usuario.
--
-- La alternativa era depender de que el rol `postgres` de Supabase tenga
-- bypassrls. Puede tenerlo; no lo controlamos y no está en nuestras migraciones.
-- Esto deja el comportamiento igual en ambos casos.
-- ============================================================================

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity
  loop
    execute format('alter table public.%I no force row level security', t.relname);
    raise notice 'FORCE quitado de %', t.relname;
  end loop;
end $$;

-- Y que no vuelva sin que nadie lo note: si una migración futura activa FORCE en
-- una tabla que un helper SECURITY DEFINER lee, la prueba del rol dueño falla.
comment on function is_enrolled_in(uuid) is
  'SECURITY DEFINER: lee enrollments como el dueño de la función. La tabla NO puede tener `force row level security` o esto devuelve false siempre. Ver tests/db/owner-privileges.sql.';
