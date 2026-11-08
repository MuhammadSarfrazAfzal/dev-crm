-- Helper functions and triggers: role checks, immutability, counters, suppression and audit.

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  )
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

-- True when the effective role is a maintenance role: service_role, the migration/seed
-- owner, or code running inside one of our security definer functions (which run as the
-- owner). Never true for a signed-in user, whose effective role is `authenticated`.
-- Deliberately security invoker: it must see the caller's current_user.
create or replace function app.is_service() returns boolean
language sql stable set search_path = ''
as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin')
      or coalesce((select rolsuper from pg_catalog.pg_roles where rolname = current_user), false)
$$;

create or replace function app.can_see_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_admin() or exists (
    select 1 from public.leads l
    where l.id = p_lead_id and l.owner_id = auth.uid() and app.is_active_user()
  )
$$;

create or replace function app.can_see_company(p_company_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_admin() or (app.is_active_user() and (
    exists (select 1 from public.companies c where c.id = p_company_id and c.created_by = auth.uid())
    or exists (select 1 from public.leads l where l.company_id = p_company_id and l.owner_id = auth.uid())
  ))
$$;

create or replace function app.can_see_import(p_import_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_admin() or exists (
    select 1 from public.imports i
    where i.id = p_import_id and i.uploaded_by = auth.uid() and app.is_active_user()
  )
$$;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create or replace function app.log_audit(p_action text, p_entity text, p_entity_id uuid, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Activity history is append-only for every signed-in user, admins included.
create or replace function app.forbid_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if app.is_service() then
    return coalesce(new, old);
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'imports', 'companies', 'contacts', 'leads', 'followups', 'sales_opportunities'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['call_activities', 'email_activities', 'notes', 'audit_logs'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function app.forbid_change()', t || '_immutable', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Profiles: only admins change roles or deactivate people.
-- ---------------------------------------------------------------------------
create or replace function app.guard_profile() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if app.is_service() or app.is_admin() then
    if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.active is distinct from old.active) then
      perform app.log_audit('profile.role_changed', 'profiles', new.id,
        jsonb_build_object('role', jsonb_build_array(old.role, new.role), 'active', jsonb_build_array(old.active, new.active)));
    end if;
    return new;
  end if;
  if new.role is distinct from old.role or new.active is distinct from old.active
     or new.email is distinct from old.email or new.id is distinct from old.id then
    raise exception 'only an admin can change role, status or email' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile();

-- ---------------------------------------------------------------------------
-- Leads: only admins reassign; owner changes are audited.
-- ---------------------------------------------------------------------------
create or replace function app.guard_lead() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.division is distinct from old.division then
      if not app.is_service() then
        raise exception 'company and division of a lead cannot change' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.owner_id is distinct from old.owner_id then
      if not (app.is_service() or app.is_admin()) then
        raise exception 'only an admin can reassign a lead' using errcode = 'insufficient_privilege';
      end if;
      perform app.log_audit('lead.assigned', 'leads', new.id,
        jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
    end if;
    -- Counters are owned by the activity triggers (which run as the owner).
    if not app.is_service() then
      new.call_attempts := old.call_attempts;
      new.last_call_at := old.last_call_at;
      new.last_outcome := old.last_outcome;
      new.next_followup_at := old.next_followup_at;
    end if;
  end if;
  if new.email_required and new.email_status = 'not_needed' then
    new.email_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger leads_guard before insert or update on public.leads
  for each row execute function app.guard_lead();

-- ---------------------------------------------------------------------------
-- Suppression changes are audited.
-- ---------------------------------------------------------------------------
create or replace function app.audit_suppression() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.suppression is distinct from old.suppression then
    perform app.log_audit('suppression.changed', tg_table_name, new.id,
      jsonb_build_object('from', old.suppression, 'to', new.suppression, 'reason', new.suppression_reason));
  end if;
  return new;
end;
$$;

create trigger companies_audit_suppression after update on public.companies
  for each row execute function app.audit_suppression();

create or replace function app.audit_contact_suppression() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.suppression is distinct from old.suppression then
    perform app.log_audit('suppression.changed', 'contacts', new.id,
      jsonb_build_object('from', old.suppression, 'to', new.suppression));
  end if;
  return new;
end;
$$;

create trigger contacts_audit_suppression after update on public.contacts
  for each row execute function app.audit_contact_suppression();

-- ---------------------------------------------------------------------------
-- Call log: refuse suppressed numbers, then keep lead counters in step.
-- ---------------------------------------------------------------------------
create or replace function app.before_call_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_suppression public.suppression_status;
  v_contact_suppression public.suppression_status;
begin
  select c.suppression into v_company_suppression
  from public.leads l join public.companies c on c.id = l.company_id
  where l.id = new.lead_id;

  if new.contact_id is not null then
    select suppression into v_contact_suppression from public.contacts where id = new.contact_id;
  end if;

  if v_company_suppression in ('do_not_call', 'do_not_contact')
     or v_contact_suppression in ('do_not_call', 'do_not_contact') then
    raise exception 'this lead is on the do-not-call list' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger call_activities_before before insert on public.call_activities
  for each row execute function app.before_call_activity();

create or replace function app.after_call_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  update public.leads set
    call_attempts = call_attempts + 1,
    last_call_at = greatest(coalesce(last_call_at, new.occurred_at), new.occurred_at),
    last_outcome = new.outcome,
    interest = case
      when new.interest is not null and new.interest <> 'unknown' then new.interest
      when new.outcome = 'interested' and interest in ('unknown', 'curious') then 'interested'
      when new.outcome = 'not_interested' then 'not_interested'
      else interest end,
    status = case
      when new.outcome = 'do_not_call' then 'unqualified'
      when new.outcome = 'wrong_number' and status = 'new' then 'unqualified'
      when status = 'new' then 'working'
      else status end
  where id = new.lead_id
  returning * into v_lead;

  if new.outcome = 'do_not_call' then
    if new.contact_id is not null then
      update public.contacts set suppression = 'do_not_call' where id = new.contact_id and suppression = 'none';
    end if;
    update public.companies
      set suppression = case when suppression = 'do_not_email' then 'do_not_contact'::public.suppression_status else 'do_not_call' end,
          suppression_reason = 'Asked not to be called (logged on a call)'
      where id = v_lead.company_id and suppression in ('none', 'do_not_email');
    update public.followups set status = 'cancelled', completed_at = now()
      where lead_id = new.lead_id and status = 'pending' and kind = 'call';
  end if;
  return new;
end;
$$;

create trigger call_activities_after after insert on public.call_activities
  for each row execute function app.after_call_activity();

-- ---------------------------------------------------------------------------
-- Email log: mirror the latest status onto the lead; opt-outs suppress email.
-- ---------------------------------------------------------------------------
create or replace function app.after_email_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
begin
  update public.leads set email_status = new.status, email_required = true
  where id = new.lead_id
  returning company_id into v_company;

  if new.status = 'opted_out' then
    update public.companies
      set suppression = case when suppression = 'do_not_call' then 'do_not_contact'::public.suppression_status else 'do_not_email' end,
          suppression_reason = 'Opted out of email'
      where id = v_company and suppression in ('none', 'do_not_call');
    update public.followups set status = 'cancelled', completed_at = now()
      where lead_id = new.lead_id and status = 'pending' and kind = 'email';
  end if;
  return new;
end;
$$;

create trigger email_activities_after after insert on public.email_activities
  for each row execute function app.after_email_activity();

-- ---------------------------------------------------------------------------
-- Follow-ups: keep leads.next_followup_at = earliest pending due time.
-- ---------------------------------------------------------------------------
create or replace function app.sync_next_followup() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  update public.leads set next_followup_at = (
    select min(due_at) from public.followups where lead_id = v_lead and status = 'pending'
  ) where id = v_lead;
  return null;
end;
$$;

create trigger followups_sync after insert or update or delete on public.followups
  for each row execute function app.sync_next_followup();

create or replace function app.before_followup() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'pending' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status = 'pending' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger followups_before before insert or update on public.followups
  for each row execute function app.before_followup();

-- ---------------------------------------------------------------------------
-- Deals: stamp closed_at when a deal is won or lost.
-- ---------------------------------------------------------------------------
create or replace function app.before_opportunity() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.stage in ('won', 'lost') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    new.closed_at := now();
  elsif new.stage not in ('won', 'lost') then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger opportunities_before before insert or update on public.sales_opportunities
  for each row execute function app.before_opportunity();

create or replace function app.after_opportunity() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    perform app.log_audit('opportunity.stage', 'sales_opportunities', new.id,
      jsonb_build_object('lead_id', new.lead_id, 'from', case when tg_op = 'UPDATE' then old.stage end, 'to', new.stage));
    if new.stage = 'won' then
      update public.leads set status = 'closed' where id = new.lead_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger opportunities_after after insert or update on public.sales_opportunities
  for each row execute function app.after_opportunity();

-- ---------------------------------------------------------------------------
-- Scripts: publishing a new version retires the previous one.
-- ---------------------------------------------------------------------------
create or replace function app.publish_script(
  p_script_key text, p_division public.division, p_type public.script_type,
  p_title text, p_body text, p_change_note text default null
) returns public.scripts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_next integer;
  v_row public.scripts;
begin
  if not app.is_admin() and not app.is_service() then
    raise exception 'only an admin can publish scripts' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('script:' || p_script_key));
  select coalesce(max(version), 0) + 1 into v_next from public.scripts where script_key = p_script_key;
  update public.scripts set is_current = false where script_key = p_script_key and is_current;
  insert into public.scripts (script_key, version, division, script_type, title, body, is_current, change_note, created_by)
  values (p_script_key, v_next, p_division, p_type, p_title, p_body, true, p_change_note, auth.uid())
  returning * into v_row;
  perform app.log_audit('script.published', 'scripts', v_row.id, jsonb_build_object('key', p_script_key, 'version', v_next));
  return v_row;
end;
$$;
