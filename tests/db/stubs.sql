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

-- ── Fidelidad con Supabase: default privileges ─────────────────────────────
-- Supabase configura los privilegios por defecto del schema public para que
-- TODA tabla nueva quede concedida a anon y authenticated. Postgres puro no lo
-- hace, así que sin esto las pruebas locales no reproducen la realidad y un
-- error de permisos pasa desapercibido — que es exactamente lo que ocurrió con
-- question_keys.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ── Esquema para los helpers de las suites ────────────────────────────────
-- Van acá y no en public por una razón concreta: el generador de tipos
-- introspecta las funciones de public que `authenticated` puede ejecutar, y unos
-- helpers de prueba creados en public terminaban dentro de src/lib/db/types.ts.
-- El resultado eran tipos distintos según si habías corrido las suites antes de
-- generar, y el chequeo de deriva fallaba sin que nada estuviera mal.
create schema if not exists test;
-- Las suites cambian a rol authenticated y desde ahí llaman a sus helpers.
grant usage on schema test to anon, authenticated, service_role;
alter default privileges in schema test
  grant execute on functions to anon, authenticated, service_role;
