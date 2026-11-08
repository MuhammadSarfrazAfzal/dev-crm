-- Post-call form: an explicit "agreed" outcome (said yes to a demo, order or trial) and
-- the next step the rep and the shop agreed on. Both are part of the immutable call log.
alter type public.call_outcome add value if not exists 'agreed' before 'interested';

alter table public.call_activities
  add column next_step text check (next_step is null or length(next_step) <= 300);

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
