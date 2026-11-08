-- Research agent (setup only). A request records what to look up on the web and which
-- fields to collect. No provider is connected yet, so requests wait; once one is, its
-- results become an ordinary import (source 'research') that goes through the same
-- preview and approval as an uploaded file.
alter type public.import_source add value if not exists 'research';

create type public.research_status as enum ('waiting_for_provider', 'queued', 'running', 'done', 'failed', 'cancelled');

create table public.research_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  division public.division not null,
  provider text not null check (provider ~ '^[a-z0-9-]{1,40}$'),
  mode text not null check (mode in ('website', 'company', 'area')),
  query text not null check (length(trim(query)) between 1 and 500),
  location text check (location is null or length(location) <= 200),
  fields text[] not null default '{}',
  max_results integer not null default 25 check (max_results between 1 and 500),
  status public.research_status not null default 'waiting_for_provider',
  result_count integer not null default 0,
  import_id uuid references public.imports (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_requests_created_by_idx on public.research_requests (created_by, created_at desc);

create trigger research_requests_touch before update on public.research_requests
  for each row execute function app.touch_updated_at();

alter table public.research_requests enable row level security;
grant select, insert, update, delete on public.research_requests to authenticated;
grant all on public.research_requests to service_role;

create policy research_select on public.research_requests for select to authenticated
  using (app.is_admin() or (created_by = auth.uid() and app.is_active_user()));
create policy research_insert on public.research_requests for insert to authenticated
  with check (created_by = auth.uid() and app.is_active_user());
create policy research_update on public.research_requests for update to authenticated
  using (app.is_admin() or (created_by = auth.uid() and app.is_active_user()))
  with check (app.is_admin() or created_by = auth.uid());
create policy research_delete on public.research_requests for delete to authenticated
  using (app.is_admin() or (created_by = auth.uid() and app.is_active_user()));
