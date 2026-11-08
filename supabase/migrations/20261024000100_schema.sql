-- Core schema for the Sales CRM (Phase 1).
-- Supabase-compatible: references auth.users but creates nothing in the auth schema.

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums. Call outcomes, deal stages and email statuses are separate families.
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'salesperson');
create type public.division as enum ('pos', 'wholesale');
create type public.suppression_status as enum ('none', 'do_not_call', 'do_not_email', 'do_not_contact');
create type public.lead_status as enum ('new', 'working', 'nurturing', 'qualified', 'unqualified', 'closed');
create type public.interest_level as enum ('unknown', 'not_interested', 'curious', 'interested', 'hot');
create type public.call_outcome as enum (
  'no_answer', 'voicemail', 'busy', 'wrong_number', 'gatekeeper', 'connected',
  'callback_requested', 'not_interested', 'interested', 'do_not_call'
);
create type public.email_status as enum (
  'not_needed', 'pending', 'drafted', 'sent', 'replied', 'bounced', 'opted_out'
);
create type public.deal_stage as enum (
  'prospect', 'qualified', 'proposal', 'trial', 'negotiation', 'won', 'lost'
);
create type public.followup_kind as enum ('call', 'email', 'task');
create type public.followup_status as enum ('pending', 'done', 'cancelled');
create type public.import_status as enum ('preview', 'approved', 'rejected', 'failed');
create type public.import_source as enum (
  'csv', 'xlsx', 'pdf', 'docx', 'txt', 'image', 'paste', 'zip'
);
create type public.row_decision as enum ('include', 'skip');
create type public.script_type as enum (
  'opening', 'gatekeeper', 'voicemail', 'objection', 'closing', 'follow_up_email'
);

-- Normalized phone keys (E.164) pulled out of a phones jsonb array, for duplicate lookups.
create or replace function app.phone_keys(phones jsonb) returns text[]
language sql immutable parallel safe
as $$
  select coalesce(array_agg(p ->> 'e164') filter (where coalesce(p ->> 'e164', '') <> ''), '{}')
  from jsonb_array_elements(case when jsonb_typeof(phones) = 'array' then phones else '[]'::jsonb end) p
$$;

-- Lower-case name with punctuation and common suffixes removed, for duplicate lookups.
create or replace function app.name_key(name text) returns text
language sql immutable parallel safe
as $$
  select nullif(trim(regexp_replace(
    regexp_replace(lower(coalesce(name, '')), '\m(inc|llc|l\.l\.c|ltd|co|corp|corporation|company)\M\.?', '', 'g'),
    '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'salesperson',
  time_zone text not null default 'America/New_York',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles (id),
  division public.division not null,
  source_type public.import_source not null,
  original_filename text,
  storage_key text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  parser text,
  status public.import_status not null default 'preview',
  column_mapping jsonb not null default '{}'::jsonb,
  headers text[] not null default '{}',
  notes text[] not null default '{}',
  row_count integer not null default 0,
  approved_count integer not null default 0,
  skipped_count integer not null default 0,
  assign_to uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  website text,
  website_domain text,
  address text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  postal_code text,
  time_zone text,
  phones jsonb not null default '[]'::jsonb check (jsonb_typeof(phones) = 'array'),
  emails jsonb not null default '[]'::jsonb check (jsonb_typeof(emails) = 'array'),
  phone_keys text[] generated always as (app.phone_keys(phones)) stored,
  name_key text generated always as (app.name_key(name)) stored,
  suppression public.suppression_status not null default 'none',
  suppression_reason text,
  notes text,
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text,
  title text,
  phones jsonb not null default '[]'::jsonb check (jsonb_typeof(phones) = 'array'),
  emails jsonb not null default '[]'::jsonb check (jsonb_typeof(emails) = 'array'),
  phone_keys text[] generated always as (app.phone_keys(phones)) stored,
  is_primary boolean not null default false,
  suppression public.suppression_status not null default 'none',
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  primary_contact_id uuid references public.contacts (id) on delete set null,
  division public.division not null,
  owner_id uuid references public.profiles (id) on delete set null,
  status public.lead_status not null default 'new',
  interest public.interest_level not null default 'unknown',
  email_required boolean not null default false,
  email_status public.email_status not null default 'not_needed',
  call_attempts integer not null default 0,
  last_call_at timestamptz,
  last_outcome public.call_outcome,
  next_followup_at timestamptz,
  source text,
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, division)
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  row_index integer not null,
  source_ref text,
  raw jsonb not null,
  normalized jsonb not null default '{}'::jsonb,
  issues text[] not null default '{}',
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  duplicate_of_company uuid references public.companies (id) on delete set null,
  duplicate_of_lead uuid references public.leads (id) on delete set null,
  duplicate_in_file integer,
  decision public.row_decision not null default 'include',
  lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (import_id, row_index)
);

create table public.call_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  user_id uuid not null references public.profiles (id),
  phone_e164 text,
  outcome public.call_outcome not null,
  interest public.interest_level,
  notes text check (notes is null or length(notes) <= 10000),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  assigned_to uuid not null references public.profiles (id),
  created_by uuid references public.profiles (id),
  kind public.followup_kind not null default 'call',
  due_at timestamptz not null,
  time_zone text not null,
  status public.followup_status not null default 'pending',
  notes text check (notes is null or length(notes) <= 5000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  to_address text,
  status public.email_status not null check (status <> 'not_needed'),
  subject text,
  notes text check (notes is null or length(notes) <= 10000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  division public.division not null,
  owner_id uuid references public.profiles (id) on delete set null,
  title text not null,
  stage public.deal_stage not null default 'prospect',
  value_cents bigint check (value_cents is null or value_cents >= 0),
  expected_close_on date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  script_key text not null,
  version integer not null check (version >= 1),
  division public.division not null,
  script_type public.script_type not null,
  title text not null,
  body text not null check (length(body) <= 20000),
  is_current boolean not null default true,
  change_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (script_key, version)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  body text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  import_id uuid references public.imports (id) on delete cascade,
  storage_key text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (lead_id is not null or company_id is not null or import_id is not null)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index companies_phone_keys_idx on public.companies using gin (phone_keys);
create index companies_name_key_idx on public.companies (name_key, state);
create index companies_website_domain_idx on public.companies (website_domain);
create index contacts_company_idx on public.contacts (company_id);
create index contacts_phone_keys_idx on public.contacts using gin (phone_keys);
create index leads_owner_idx on public.leads (owner_id, status);
create index leads_division_idx on public.leads (division);
create index leads_next_followup_idx on public.leads (next_followup_at);
create index leads_company_idx on public.leads (company_id);
create index import_rows_import_idx on public.import_rows (import_id, row_index);
create index imports_uploader_idx on public.imports (uploaded_by, created_at desc);
create index call_activities_lead_idx on public.call_activities (lead_id, occurred_at desc);
create index call_activities_user_idx on public.call_activities (user_id, occurred_at desc);
create index followups_due_idx on public.followups (assigned_to, status, due_at);
create index followups_lead_idx on public.followups (lead_id);
create index email_activities_lead_idx on public.email_activities (lead_id, occurred_at desc);
create index opportunities_lead_idx on public.sales_opportunities (lead_id);
create index opportunities_stage_idx on public.sales_opportunities (stage);
create index scripts_lookup_idx on public.scripts (division, script_type) where is_current;
create unique index scripts_one_current_idx on public.scripts (script_key) where is_current;
create index notes_lead_idx on public.notes (lead_id, created_at desc);
create index documents_lead_idx on public.documents (lead_id);
create index documents_company_idx on public.documents (company_id);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
