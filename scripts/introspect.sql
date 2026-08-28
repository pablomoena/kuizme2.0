-- Introspección del esquema public en un solo JSON, para generar los tipos de
-- TypeScript sin depender de Docker (`supabase gen types` levanta un contenedor).
\t on
\a
\pset format unaligned
select json_build_object(
  'enums', (
    select coalesce(json_agg(json_build_object('name', t.typname, 'values', v.vals)
                             order by t.typname), '[]'::json)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join lateral (
      select json_agg(e.enumlabel order by e.enumsortorder) as vals
      from pg_enum e where e.enumtypid = t.oid
    ) v on true
    where n.nspname = 'public' and t.typtype = 'e'
  ),
  'views', (
    select coalesce(json_agg(json_build_object(
      'name', c.relname,
      'columns', cols.list
    ) order by c.relname), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join lateral (
      select json_agg(json_build_object(
        'name', a.attname,
        'udt',  ty.typname,
        -- Una vista no declara NOT NULL, así que todo se emite anulable: es lo
        -- honesto, y obliga a manejar el caso de la fila que no existe.
        'notNull', false
      ) order by a.attnum) as list
      from pg_attribute a
      join pg_type ty on ty.oid = a.atttypid
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    ) cols on true
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and has_table_privilege('authenticated', c.oid, 'SELECT')
  ),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name', p.proname,
      'args', coalesce(a.list, '[]'::json),
      'returns', pg_get_function_result(p.oid)
    ) order by p.proname), '[]'::json)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    -- Solo las que un rol de usuario puede ejecutar: las demás no son RPC y
    -- emitirlas invitaría a llamarlas desde el cliente.
    join lateral (
      select json_agg(json_build_object('name', an, 'type', at) order by ord) as list
      from (
        select unnest(p.proargnames) as an,
               unnest(string_to_array(oidvectortypes(p.proargtypes), ', ')) as at,
               generate_subscripts(p.proargnames, 1) as ord
      ) x
    ) a on true
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      -- Las extensiones (citext, pgcrypto) instalan decenas de funciones en
      -- public. No son nuestras y no se llaman por RPC.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
      -- Las funciones de trigger no se llaman nunca por RPC y `returns trigger`
      -- no es un tipo útil en TypeScript.
      and pg_get_function_result(p.oid) <> 'trigger'
  ),
  'tables', (
    select coalesce(json_agg(json_build_object(
      'name', c.relname,
      'columns', cols.list,
      'derived', derived.list,
      'relationships', rels.list,
      -- Las tablas que `authenticated` NO puede leer no son del cliente: son de
      -- question_keys (D3) e integration_secrets (D14). Se siguen emitiendo
      -- porque el cliente de service_role las necesita tipadas, pero se marcan
      -- para poder excluirlas del tipo que usan los clientes de usuario.
      'serverOnly', not has_table_privilege('authenticated', c.oid, 'SELECT')
    ) order by c.relname), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join lateral (
      select json_agg(json_build_object(
        'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod),
        'udt',  ty.typname,
        'notNull', a.attnotnull,
        'hasDefault', a.atthasdef,
        'generated', a.attgenerated <> ''
      ) order by a.attnum) as list
      from pg_attribute a
      join pg_type ty on ty.oid = a.atttypid
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    ) cols on true
    -- Columnas que un trigger DERIVA del padre. Deben ser opcionales en Insert:
    -- si el tipo las exige, la aplicación pasa la organización o el curso a mano
    -- y se pierde justamente la garantía que da derivarlos (D2).
    --
    -- Se marcan con un comentario de columna que empieza por "derivada". Se
    -- probaron dos alternativas y las dos fallan:
    --
    --   · Una lista de nombres de función de trigger en este archivo: se quedó
    --     atrás al añadir un trigger nuevo, y los tipos pasaron a exigir una
    --     columna que la base ya rellenaba.
    --   · Leer el código del trigger buscando asignaciones a new.<columna>: no
    --     distingue derivar de normalizar. normalize_course_slug asigna new.slug,
    --     y marcar el slug como opcional sería falso — es obligatorio.
    --
    -- El comentario es explícito, viaja en la migración y se revisa junto al
    -- resto del cambio.
    join lateral (
      select coalesce(json_agg(a.attname), '[]'::json) as list
      from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        and col_description(c.oid, a.attnum) ilike 'derivada%'
    ) derived on true
    -- Claves foráneas. postgrest-js exige Relationships en cada tabla: sin esa
    -- clave el tipo no satisface GenericTable y TODA consulta resuelve a `never`
    -- sin un solo error que lo delate. Además son lo que permite tipar los
    -- select con joins embebidos.
    join lateral (
      select coalesce(json_agg(json_build_object(
        'foreignKeyName', con.conname,
        'columns', local_cols.names,
        'isOneToOne', exists (
          select 1 from pg_constraint u
          where u.conrelid = con.conrelid
            and u.contype in ('p', 'u')
            and u.conkey @> con.conkey and con.conkey @> u.conkey
        ),
        'referencedRelation', ref.relname,
        'referencedColumns', ref_cols.names
      ) order by con.conname), '[]'::json) as list
      from pg_constraint con
      join pg_class ref on ref.oid = con.confrelid
      join lateral (
        select array_agg(a.attname order by u.ord) as names
        from unnest(con.conkey) with ordinality u(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
      ) local_cols on true
      join lateral (
        select array_agg(a.attname order by u.ord) as names
        from unnest(con.confkey) with ordinality u(attnum, ord)
        join pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.attnum
      ) ref_cols on true
      where con.conrelid = c.oid and con.contype = 'f'
    ) rels on true
    where n.nspname = 'public' and c.relkind = 'r'
  )
);
