-- Local stand-in for the parts of Supabase that the migrations rely on.
-- Applied only to the local/embedded database, never to a Supabase project:
-- Supabase already provides these roles, the auth schema and these functions.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create extension if not exists pgcrypto;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Same name and core columns as Supabase's auth.users.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- Supabase reads the caller from the request.jwt.claims setting; so do we.
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'role', current_user)
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase grants schema usage on public to these roles.
grant usage on schema public to anon, authenticated, service_role;
