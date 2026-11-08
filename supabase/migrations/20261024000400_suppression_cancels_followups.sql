-- Putting a company on the do-not-call list by hand also cancels its pending call
-- follow-ups, the same as logging a "do not call" outcome does.

create or replace function app.audit_suppression() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.suppression is distinct from old.suppression then
    perform app.log_audit('suppression.changed', tg_table_name, new.id,
      jsonb_build_object('from', old.suppression, 'to', new.suppression, 'reason', new.suppression_reason));
    if new.suppression in ('do_not_call', 'do_not_contact') then
      perform app.cancel_company_followups(new.id, 'call');
    end if;
    if new.suppression in ('do_not_email', 'do_not_contact') then
      perform app.cancel_company_followups(new.id, 'email');
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.cancel_company_followups(p_company_id uuid, p_kind public.followup_kind) returns void
language sql security definer set search_path = ''
as $$
  update public.followups f set status = 'cancelled', completed_at = now(),
    notes = coalesce(f.notes || E'\n', '') || 'Cancelled: company suppressed'
  from public.leads l
  where l.id = f.lead_id and l.company_id = p_company_id and f.status = 'pending' and f.kind = p_kind
$$;

revoke execute on function app.cancel_company_followups(uuid, public.followup_kind) from public, anon;
grant execute on function app.cancel_company_followups(uuid, public.followup_kind) to authenticated, service_role;

-- Clean up any follow-ups left pending on already-suppressed companies.
update public.followups f set status = 'cancelled', completed_at = now()
from public.leads l join public.companies c on c.id = l.company_id
where l.id = f.lead_id and f.status = 'pending'
  and ((f.kind = 'call' and c.suppression in ('do_not_call', 'do_not_contact'))
    or (f.kind = 'email' and c.suppression in ('do_not_email', 'do_not_contact')));
