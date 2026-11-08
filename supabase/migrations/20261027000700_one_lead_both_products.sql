-- Every shop is offered both products (8staros POS and wholesale phones/accessories), so a
-- company has one lead, not one per division. What the shop wants is captured on calls:
-- each lead keeps which products it is interested in and which it has bought.

-- The enum now names products rather than divisions.
alter type public.division rename to product;

-- What the shop wants and what it has bought, product by product.
alter table public.leads
  add column interested_in public.product[] not null default '{}',
  add column bought public.product[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Calls record which products the shop showed interest in or bought on that call.
-- ---------------------------------------------------------------------------
alter table public.call_activities
  add column interested_in public.product[] not null default '{}',
  add column bought public.product[] not null default '{}';

-- Deals name the product they are for (empty when the deal covers both).
alter table public.sales_opportunities rename column division to product;
alter table public.sales_opportunities alter column product drop not null;

-- Scripts can be for one product or for both (empty).
alter table public.scripts rename column division to product;
alter table public.scripts alter column product drop not null;
drop index if exists public.scripts_lookup_idx;
create index scripts_lookup_idx on public.scripts (script_type) where is_current;

-- Imports and research requests no longer pick a division; old rows keep theirs.
alter table public.imports alter column division drop not null;
alter table public.research_requests alter column division drop not null;

-- ---------------------------------------------------------------------------
-- Functions that knew about divisions.
-- ---------------------------------------------------------------------------
create or replace function app.guard_lead() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id then
      if not app.is_service() then
        raise exception 'the company of a lead cannot change' using errcode = 'insufficient_privilege';
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
  -- Bought implies interested; keep both lists sorted and free of repeats.
  new.bought := array(select distinct p from unnest(new.bought) p where p is not null order by p);
  new.interested_in := array(select distinct p from unnest(new.interested_in || new.bought) p where p is not null order by p);
  if new.email_required and new.email_status = 'not_needed' then
    new.email_status := 'pending';
  end if;
  return new;
end;
$$;

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
    interested_in = interested_in || new.interested_in,
    bought = bought || new.bought,
    interest = case
      when new.interest is not null and new.interest <> 'unknown' then new.interest
      when new.outcome::text = 'agreed' then 'hot'
      when new.outcome = 'interested' and interest in ('unknown', 'curious') then 'interested'
      when new.outcome = 'not_interested' then 'not_interested'
      else interest end,
    status = case
      when new.outcome = 'do_not_call' then 'unqualified'
      when new.outcome = 'wrong_number' and status = 'new' then 'unqualified'
      when new.outcome::text = 'agreed' and status in ('new', 'working', 'nurturing') then 'qualified'
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

-- A won deal marks its product (or both, for a deal that covers both) as bought.
create or replace function app.after_opportunity() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    perform app.log_audit('opportunity.stage', 'sales_opportunities', new.id,
      jsonb_build_object('lead_id', new.lead_id, 'from', case when tg_op = 'UPDATE' then old.stage end, 'to', new.stage));
    if new.stage = 'won' then
      update public.leads set status = 'closed',
        bought = bought || case when new.product is null then enum_range(null::public.product) else array[new.product] end
      where id = new.lead_id;
    end if;
  end if;
  return null;
end;
$$;

drop function app.publish_script(text, public.product, public.script_type, text, text, text);
create function app.publish_script(
  p_script_key text, p_product public.product, p_type public.script_type,
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
  insert into public.scripts (script_key, version, product, script_type, title, body, is_current, change_note, created_by)
  values (p_script_key, v_next, p_product, p_type, p_title, p_body, true, p_change_note, auth.uid())
  returning * into v_row;
  perform app.log_audit('script.published', 'scripts', v_row.id, jsonb_build_object('key', p_script_key, 'version', v_next));
  return v_row;
end;
$$;
revoke execute on function app.publish_script(text, public.product, public.script_type, text, text, text) from anon, public;
grant execute on function app.publish_script(text, public.product, public.script_type, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leads: merge any company that had a lead per division into one lead.
-- ---------------------------------------------------------------------------
-- Keep a record of which division each lead was imported under before dropping it.
create table app.lead_division_history (
  lead_id uuid primary key,
  company_id uuid not null,
  division public.product not null,
  interest public.interest_level not null,
  merged_into uuid,
  recorded_at timestamptz not null default now()
);
revoke all on app.lead_division_history from public, anon, authenticated;

insert into app.lead_division_history (lead_id, company_id, division, interest)
select id, company_id, division, interest from public.leads;

-- The lead that stays: the most recently called, else the oldest.
create temporary table lead_merge on commit drop as
select l.id as drop_id, k.keep_id
from public.leads l
join (
  select distinct on (company_id) company_id, id as keep_id
  from public.leads
  order by company_id, last_call_at desc nulls last, created_at, id
) k on k.company_id = l.company_id
where l.id <> k.keep_id;

update app.lead_division_history h set merged_into = m.keep_id from lead_merge m where h.lead_id = m.drop_id;

update public.leads k set
  call_attempts = k.call_attempts + s.call_attempts,
  interest = greatest(k.interest, s.interest),
  email_required = k.email_required or s.email_required,
  owner_id = coalesce(k.owner_id, s.owner_id),
  primary_contact_id = coalesce(k.primary_contact_id, s.primary_contact_id),
  next_followup_at = least(k.next_followup_at, s.next_followup_at)
from (
  select m.keep_id, sum(d.call_attempts)::int as call_attempts, max(d.interest) as interest,
         bool_or(d.email_required) as email_required, (array_agg(d.owner_id) filter (where d.owner_id is not null))[1] as owner_id,
         (array_agg(d.primary_contact_id) filter (where d.primary_contact_id is not null))[1] as primary_contact_id,
         min(d.next_followup_at) as next_followup_at
  from lead_merge m join public.leads d on d.id = m.drop_id
  group by m.keep_id
) s
where k.id = s.keep_id;

update public.call_activities t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.email_activities t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.followups t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.notes t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.documents t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.sales_opportunities t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.import_rows t set lead_id = m.keep_id from lead_merge m where t.lead_id = m.drop_id;
update public.import_rows t set duplicate_of_lead = m.keep_id from lead_merge m where t.duplicate_of_lead = m.drop_id;
delete from public.leads l using lead_merge m where l.id = m.drop_id;

drop index if exists public.leads_division_idx;
alter table public.leads drop constraint if exists leads_company_id_division_key;
alter table public.leads drop column division;
alter table public.leads add constraint leads_company_id_key unique (company_id);

-- A shop that already showed interest under a division keeps that product as an interest,
-- and a won deal counts as bought.
update public.leads l set interested_in = array(
  select distinct h.division from app.lead_division_history h
  where coalesce(h.merged_into, h.lead_id) = l.id and h.interest in ('curious', 'interested', 'hot'));
update public.leads l set bought = array(
  select distinct o.product from public.sales_opportunities o where o.lead_id = l.id and o.stage = 'won' and o.product is not null);
