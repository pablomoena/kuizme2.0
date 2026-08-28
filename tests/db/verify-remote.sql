-- Verificación del estado del proyecto remoto.
--
-- Se corre en el SQL Editor del dashboard de Supabase. Existe porque el mensaje
-- de `supabase db push` NO es un indicador fiable: imprime
-- "Remote database is up to date" DESPUÉS de aplicar las migraciones, así que
-- describe el estado final y no una decisión de saltarse algo. Confundirlo con
-- "no apliqué nada" cuesta tiempo. El estado se lee de la base.
--
-- Valores esperados con las migraciones al día:
--   auth_select   19   tablas con SELECT para authenticated
--   qk_grants      0   D3: question_keys sin grants para roles de usuario
--   anon_grants    0   anon no alcanza ninguna tabla
--   politicas     35
--   tablas        21

select
  (select count(*) from information_schema.role_table_grants
     where grantee = 'authenticated' and privilege_type = 'SELECT'
       and table_schema = 'public')                                   as auth_select,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'question_keys'
       and grantee in ('authenticated','anon'))                       as qk_grants,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon')              as anon_grants,
  (select count(*) from pg_policies where schemaname = 'public')      as politicas,
  (select count(*) from pg_tables  where schemaname = 'public')       as tablas,
  (select string_agg(version, ', ' order by version)
     from supabase_migrations.schema_migrations)                      as migraciones_registradas;

-- Si algo no cuadra, qué tablas quedaron concedidas a anon:
-- select table_name, string_agg(privilege_type, ', ')
--   from information_schema.role_table_grants
--  where table_schema='public' and grantee='anon'
--  group by table_name order by table_name;
