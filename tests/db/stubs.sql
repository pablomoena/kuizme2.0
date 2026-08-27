-- Stubs mínimos de Supabase para validar el esquema en un Postgres puro.
-- No emulan Supabase: solo permiten que las referencias a auth.users y
-- auth.uid() resuelvan para comprobar DDL, triggers y constraints.
-- Stubs mínimos de Supabase para validar el esquema en Postgres puro.
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
create role anon;
create role authenticated;
create role service_role;
