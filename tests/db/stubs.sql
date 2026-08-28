-- Stubs de Supabase para validar el esquema y probar RLS en un Postgres puro.
--
-- No emulan Supabase completo, pero sí lo esencial para que las pruebas de
-- aislamiento sean REALES: `auth.uid()` lee el claim `sub` del JWT igual que en
-- Supabase, así que un test puede hacerse pasar por un usuario concreto con
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- y las políticas se evalúan de verdad, no en teoría.
--
-- Idempotente: los roles en Postgres son del cluster, no de la base.

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Igual que la implementación real de Supabase.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'anon'
  )
$$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
