-- ============================================================================
-- Reordenar módulos y lecciones: una sola sentencia, atómica, con RLS aplicando
-- ============================================================================
-- Reordenar desde el cliente son N updates. Si el tercero falla, el curso queda
-- con un orden que nadie pidió y sin forma de volver atrás. Estas funciones lo
-- hacen en una sentencia: o queda el orden completo, o no cambia nada.
--
-- `security invoker` a propósito —es el default, pero se escribe para que se lea
-- como decisión—: la función corre como el usuario, así que las políticas de
-- escritura de modules y lessons siguen aplicando. Un alumno que llame a esto
-- afecta cero filas, y abajo eso se convierte en excepción en vez de pasar por
-- éxito silencioso.
--
-- Se exige la lista COMPLETA de ids, no un movimiento suelto. Si el cliente
-- manda una lista parcial significa que su idea del curso ya no coincide con la
-- de la base —alguien más añadió un módulo, por ejemplo— y aplicar el orden
-- igual dejaría filas con índices repetidos. Mejor rechazar y que el cliente
-- recargue.
-- ============================================================================

create or replace function reorder_modules(_course uuid, _ids uuid[])
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  _total    integer;
  _afectados integer;
begin
  if _ids is null or array_length(_ids, 1) is null then
    raise exception 'La lista de módulos viene vacía' using errcode = 'check_violation';
  end if;

  if exists (select 1 from unnest(_ids) i group by i having count(*) > 1) then
    raise exception 'La lista de módulos tiene ids repetidos' using errcode = 'check_violation';
  end if;

  -- Todo id tiene que pertenecer a este curso. Ignorar los ajenos en silencio
  -- convertiría un error del cliente en un reordenamiento a medias.
  if exists (
    select 1 from unnest(_ids) i
    where not exists (select 1 from modules m where m.id = i and m.course_id = _course)
  ) then
    raise exception 'Hay módulos que no pertenecen a este curso' using errcode = 'check_violation';
  end if;

  select count(*) into _total from modules where course_id = _course;
  if _total <> array_length(_ids, 1) then
    raise exception 'El curso tiene % módulos y llegaron %: recarga y vuelve a intentar',
      _total, array_length(_ids, 1) using errcode = 'check_violation';
  end if;

  update modules m
     set order_index = t.ord
    from unnest(_ids) with ordinality t(id, ord)
   where m.id = t.id;

  get diagnostics _afectados = row_count;

  -- Con RLS, un usuario sin permiso de escritura no recibe un error: su UPDATE
  -- simplemente no toca nada. Sin esta comprobación, la interfaz mostraría el
  -- nuevo orden y la base tendría el viejo.
  if _afectados <> _total then
    raise exception 'No tienes permiso para reordenar este curso'
      using errcode = 'insufficient_privilege';
  end if;

  return _afectados;
end $$;

create or replace function reorder_lessons(_module uuid, _ids uuid[])
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  _total     integer;
  _afectados integer;
begin
  if _ids is null or array_length(_ids, 1) is null then
    raise exception 'La lista de lecciones viene vacía' using errcode = 'check_violation';
  end if;

  if exists (select 1 from unnest(_ids) i group by i having count(*) > 1) then
    raise exception 'La lista de lecciones tiene ids repetidos' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from unnest(_ids) i
    where not exists (select 1 from lessons l where l.id = i and l.module_id = _module)
  ) then
    raise exception 'Hay lecciones que no pertenecen a este módulo' using errcode = 'check_violation';
  end if;

  select count(*) into _total from lessons where module_id = _module;
  if _total <> array_length(_ids, 1) then
    raise exception 'El módulo tiene % lecciones y llegaron %: recarga y vuelve a intentar',
      _total, array_length(_ids, 1) using errcode = 'check_violation';
  end if;

  update lessons l
     set order_index = t.ord
    from unnest(_ids) with ordinality t(id, ord)
   where l.id = t.id;

  get diagnostics _afectados = row_count;

  if _afectados <> _total then
    raise exception 'No tienes permiso para reordenar este módulo'
      using errcode = 'insufficient_privilege';
  end if;

  return _afectados;
end $$;

-- Mover una lección a otro módulo y colocarla en una posición. El trigger
-- sync_lesson_course_id corrige course_id si el módulo destino es de otro curso,
-- así que la fila no queda visible para el conjunto equivocado de alumnos (D7).
create or replace function move_lesson(_lesson uuid, _target_module uuid, _position integer)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  _origen uuid;
  _ids    uuid[];
begin
  select module_id into _origen from lessons where id = _lesson;
  if _origen is null then
    raise exception 'La lección no existe o no la puedes ver' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from modules where id = _target_module) then
    raise exception 'El módulo destino no existe o no lo puedes ver' using errcode = 'no_data_found';
  end if;

  update lessons set module_id = _target_module where id = _lesson;
  if not found then
    raise exception 'No tienes permiso para mover esta lección'
      using errcode = 'insufficient_privilege';
  end if;

  -- Reindexar el módulo destino con la lección en su posición, y el de origen
  -- para que no queden huecos.
  select array_agg(id order by ord) into _ids
  from (
    select id,
           case when id = _lesson then _position - 0.5 else order_index::numeric end as ord
    from lessons where module_id = _target_module
  ) t;
  perform reorder_lessons(_target_module, _ids);

  if _origen <> _target_module then
    select array_agg(id order by order_index) into _ids
    from lessons where module_id = _origen;
    if _ids is not null then
      perform reorder_lessons(_origen, _ids);
    end if;
  end if;

  return array_length(_ids, 1);
end $$;

revoke execute on function reorder_modules(uuid, uuid[])   from public, anon;
revoke execute on function reorder_lessons(uuid, uuid[])   from public, anon;
revoke execute on function move_lesson(uuid, uuid, integer) from public, anon;
grant  execute on function reorder_modules(uuid, uuid[])   to authenticated;
grant  execute on function reorder_lessons(uuid, uuid[])   to authenticated;
grant  execute on function move_lesson(uuid, uuid, integer) to authenticated;
