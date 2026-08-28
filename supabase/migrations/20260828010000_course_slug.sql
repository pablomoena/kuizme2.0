-- ============================================================================
-- El slug de un curso va a la URL, así que se valida como el de organización
-- ============================================================================
-- organizations.slug tenía CHECK de formato y trigger de normalización desde la
-- primera migración. courses.slug no: era `citext not null` con unicidad por
-- organización y nada más. Al ir a construir el editor quedó claro que eso
-- permite crear un curso con espacios, con barras, con acentos o con 200
-- caracteres, y ese valor termina en /cursos/{slug}.
--
-- Se aplica el mismo criterio que ya funciona arriba: liberal al recibir,
-- estricto al guardar. El trigger normaliza —minúsculas, sin espacios al
-- borde— y el CHECK valida el valor ya normalizado.
--
-- El cast a ::text en el CHECK es deliberado: slug es citext, y sobre citext el
-- operador ~ es insensible a mayúsculas, así que '^[a-z0-9]...' aceptaría
-- "MAYUS". Es la misma trampa que se documentó para organizations.
-- ============================================================================

update courses set slug = lower(btrim(slug::text))::citext
  where slug::text <> lower(btrim(slug::text));

create or replace function normalize_course_slug() returns trigger
language plpgsql set search_path = public as $$
begin
  new.slug := lower(btrim(new.slug::text))::citext;
  return new;
end $$;

create trigger courses_slug_guard
  before insert or update of slug on courses
  for each row execute function normalize_course_slug();

alter table courses add constraint courses_slug_format
  check (slug::text ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$');

comment on constraint courses_slug_format on courses is
  'De 3 a 50 caracteres, minúsculas, dígitos y guiones interiores. El cast a text evita que citext haga el patrón insensible a mayúsculas.';
