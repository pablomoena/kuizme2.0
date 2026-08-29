-- ============================================================================
-- Datos de demostración: Instituto Bíblico Miel
-- ============================================================================
-- Para poder VER la aplicación funcionando. Crea una institución, un curso con
-- secciones y lecciones, precios y una matrícula.
--
-- ── Antes de correr esto ───────────────────────────────────────────────────
-- Hay que crear DOS usuarios en Supabase (Authentication → Users → Add user,
-- con "Auto Confirm User" marcado):
--
--     admin@ibmiel.cl     ← entra al panel de administración
--     alumno@ibmiel.cl    ← ve el curso como estudiante
--
-- La contraseña la eliges tú. No se pueden crear por SQL: las gestiona Supabase
-- Auth, y una fila insertada a mano no puede iniciar sesión.
--
-- Este guion busca esos correos y avisa si faltan, en vez de fallar con un error
-- de clave foránea que no dice nada.
--
-- Es idempotente: correrlo dos veces no duplica nada.
-- ============================================================================

do $$
declare
  _admin  uuid;
  _alumno uuid;
  _org    uuid;
  _curso  uuid;
  _m1     uuid;
  _m2     uuid;
  _s1     uuid;
  _s2     uuid;
begin
  select id into _admin  from auth.users where email = 'admin@ibmiel.cl';
  select id into _alumno from auth.users where email = 'alumno@ibmiel.cl';

  if _admin is null or _alumno is null then
    raise exception
      E'Faltan usuarios.\n\n'
      '  Crea estos dos en Supabase → Authentication → Users → Add user,\n'
      '  con "Auto Confirm User" marcado, y vuelve a correr este guion:\n\n'
      '    admin@ibmiel.cl   (falta: %)\n'
      '    alumno@ibmiel.cl  (falta: %)',
      (_admin is null), (_alumno is null);
  end if;

  -- ── La institución ───────────────────────────────────────────────────────
  -- El slug es el subdominio: ibmiel.kuizme.com
  insert into organizations (slug, name, status)
  values ('ibmiel', 'Instituto Bíblico Miel', 'active')
  on conflict (slug) do update set name = excluded.name, status = 'active'
  returning id into _org;

  if _org is null then
    select id into _org from organizations where slug = 'ibmiel';
  end if;

  -- ── Quién es quién ───────────────────────────────────────────────────────
  insert into memberships (user_id, organization_id, role) values
    (_admin,  _org, 'org_admin'),
    (_alumno, _org, 'student')
  on conflict (user_id, organization_id) do update set role = excluded.role;

  insert into profiles (id, first_name, last_name) values
    (_admin,  'Ana',   'Directora'),
    (_alumno, 'Pedro', 'Estudiante')
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name;

  -- ── Un curso publicado, visible en el catálogo ───────────────────────────
  -- release_mode 'immediate' para que se vea todo de entrada; después puedes
  -- cambiarlo desde el editor y comprobar que las lecciones se cierran.
  insert into courses (organization_id, slug, title, subtitle, description,
                       status, visibility, release_mode, sequential,
                       enrollment_open, max_students)
  values (_org, 'antiguo-testamento', 'Panorama del Antiguo Testamento',
          'Un recorrido por los libros, su contexto y su mensaje',
          E'Curso introductorio de doce semanas. No requiere estudios previos.\n\n'
          'Al terminar podrás ubicar cada libro en su época y reconocer las '
          'líneas que atraviesan el texto completo.',
          'published', 'unlisted', 'immediate', false, true, 30)
  on conflict (organization_id, slug) do update
    set title = excluded.title, status = 'published'
  returning id into _curso;

  if _curso is null then
    select id into _curso from courses
     where organization_id = _org and slug = 'antiguo-testamento';
  end if;

  insert into course_pricing (course_id, kind) values (_curso, 'free')
  on conflict (course_id) do update set kind = 'free';

  -- ── Dos módulos, uno con secciones y otro sin ────────────────────────────
  -- A propósito: así se ve en la misma pantalla cómo queda un módulo agrupado
  -- y uno plano, que es la decisión que tomamos en D13.
  -- `on conflict do nothing` NO sirve acá: no hay restricción única sobre
  -- (curso, orden), así que no habría conflicto que detectar y la segunda pasada
  -- insertaría todo otra vez. Se busca primero y se inserta solo si falta.
  select id into _m1 from modules where course_id = _curso and order_index = 1;
  if _m1 is null then
    insert into modules (course_id, title, description, order_index)
    values (_curso, 'Los primeros libros', 'Génesis a Deuteronomio.', 1)
    returning id into _m1;
  end if;

  select id into _m2 from modules where course_id = _curso and order_index = 2;
  if _m2 is null then
    insert into modules (course_id, title, description, order_index)
    values (_curso, 'Los profetas', 'Quiénes eran y a quién le hablaban.', 2)
    returning id into _m2;
  end if;

  select id into _s1 from sections where module_id = _m1 and order_index = 1;
  if _s1 is null then
    insert into sections (module_id, title, order_index)
    values (_m1, 'Semana 1 · Los orígenes', 1) returning id into _s1;
  end if;

  select id into _s2 from sections where module_id = _m1 and order_index = 2;
  if _s2 is null then
    insert into sections (module_id, title, order_index)
    values (_m1, 'Semana 2 · El éxodo', 2) returning id into _s2;
  end if;

  -- ── Lecciones ────────────────────────────────────────────────────────────
  -- El orden del módulo es UNA secuencia; las secciones agrupan sobre ella. Por
  -- eso las de cada sección van seguidas: si se entrelazaran, el editor avisa.
  -- Mismo motivo: se filtra contra lo que ya existe en cada módulo.
  insert into lessons (module_id, section_id, title, kind, order_index,
                       is_required, is_preview, duration_seconds)
  select v.modulo, v.seccion, v.titulo, 'text'::lesson_kind, v.orden,
         v.obligatoria, v.muestra, v.segundos
  from (values
    (_m1, null::uuid, 'Cómo usar este curso',  1, false, true,   240),
    (_m1, _s1,        'Génesis: el principio', 2, true,  true,  1500),
    (_m1, _s1,        'Los patriarcas',        3, true,  false, 1800),
    (_m1, _s2,        'La salida de Egipto',   4, true,  false, 1620),
    (_m1, _s2,        'La ley en el desierto', 5, true,  false, 1440),
    (_m2, null,       'Qué es un profeta',     1, true,  false, 1200),
    (_m2, null,       'Isaías y su tiempo',    2, true,  false, 1980)
  ) as v(modulo, seccion, titulo, orden, obligatoria, muestra, segundos)
  where not exists (
    select 1 from lessons l
     where l.module_id = v.modulo and l.order_index = v.orden
  );

  -- ── El contenido, en su tabla aparte (D8) ────────────────────────────────
  -- Separado de la ficha de la lección: es lo que permite mostrar el temario
  -- completo y esconder el cuerpo a quien no está matriculado.
  insert into lesson_contents (lesson_id, body)
  select l.id,
         E'## ' || l.title || E'\n\n'
         'Contenido de demostración para ver la aplicación funcionando. '
         'Reemplázalo desde el editor del curso.'
    from lessons l
   where l.course_id = _curso
     and not exists (select 1 from lesson_contents c where c.lesson_id = l.id);

  -- ── El alumno, matriculado ───────────────────────────────────────────────
  insert into enrollments (course_id, student_id, status)
  values (_curso, _alumno, 'active')
  on conflict (course_id, student_id) do update set status = 'active';

  -- Una lección ya completada, para que el progreso no salga en cero.
  --
  -- Tiene que ser OBLIGATORIA: my_course_progress cuenta solo esas, así que
  -- completar la de bienvenida (que es opcional) dejaba el progreso en 0% y
  -- parecía que el avance no funcionaba.
  insert into lesson_completions (lesson_id, student_id)
  select l.id, _alumno from lessons l
   where l.module_id = _m1 and l.order_index = 2 and l.is_required
     and not exists (
       select 1 from lesson_completions c
        where c.lesson_id = l.id and c.student_id = _alumno);

  -- ── Un segundo curso en borrador ─────────────────────────────────────────
  -- Para comprobar que el alumno NO lo ve en el catálogo y el admin sí.
  insert into courses (organization_id, slug, title, subtitle, status, visibility)
  values (_org, 'nuevo-testamento', 'Panorama del Nuevo Testamento',
          'En preparación', 'draft', 'private')
  on conflict (organization_id, slug) do nothing;

  raise notice '';
  raise notice '  Listo. Institución "Instituto Bíblico Miel" creada.';
  raise notice '';
  raise notice '  Entra con admin@ibmiel.cl  → panel de administración';
  raise notice '  Entra con alumno@ibmiel.cl → catálogo y curso';
  raise notice '';
end $$;
