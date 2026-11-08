-- Deleting a shop once the team is done with it. A company has one lead, so deleting a
-- lead deletes its company, and with it everything attached: contacts, the lead, calls,
-- follow-ups, emails, deals, notes and documents. Only admins may do it (the existing
-- rule for deleting companies). Calls, emails and notes are normally append-only, so this
-- runs as the owner after checking the caller; each shop gets an audit entry recording
-- what was removed.
create or replace function app.delete_companies(p_ids uuid[])
returns table (company_id uuid, storage_keys text[])
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  v_actor uuid := auth.uid();
begin
  if not app.is_admin() then
    raise exception 'only an admin can delete leads' using errcode = 'insufficient_privilege';
  end if;
  for c in
    select co.id, co.name, co.city, co.state, co.phones
    from public.companies co where co.id = any(p_ids)
  loop
    company_id := c.id;
    -- Files attached to the shop or its lead (not the original import file, which belongs to the import).
    select coalesce(array_agg(d.storage_key), '{}') into storage_keys
      from public.documents d
      where d.import_id is null and (d.company_id = c.id or d.lead_id in (select l.id from public.leads l where l.company_id = c.id));
    insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (v_actor, 'company.deleted', 'companies', c.id, jsonb_build_object(
      'name', c.name, 'city', c.city, 'state', c.state, 'phones', c.phones,
      'leads', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'owner_id', l.owner_id, 'status', l.status)), '[]') from public.leads l where l.company_id = c.id),
      'calls', (select count(*) from public.call_activities a join public.leads l on l.id = a.lead_id where l.company_id = c.id),
      'followups', (select count(*) from public.followups f join public.leads l on l.id = f.lead_id where l.company_id = c.id),
      'emails', (select count(*) from public.email_activities e join public.leads l on l.id = e.lead_id where l.company_id = c.id),
      'deals', (select count(*) from public.sales_opportunities o join public.leads l on l.id = o.lead_id where l.company_id = c.id),
      'notes', (select count(*) from public.notes n join public.leads l on l.id = n.lead_id where l.company_id = c.id),
      'contacts', (select count(*) from public.contacts ct where ct.company_id = c.id)));
    delete from public.companies co where co.id = c.id;
    return next;
  end loop;
end;
$$;

revoke execute on function app.delete_companies(uuid[]) from anon, public;
grant execute on function app.delete_companies(uuid[]) to authenticated, service_role;
