-- Stubs mínimos de Supabase para validar el esquema en un Postgres puro.
-- No emulan Supabase: solo permiten que las referencias a auth.users y
-- auth.uid() resuelvan, para comprobar DDL, triggers y constraints.
--
-- Idempotente a propósito: los roles en Postgres son del cluster, no de la
-- base, así que reejecutar esto en un cluster local ya usado debe funcionar.

create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I', r);
    end if;
  end loop;
end $$;
