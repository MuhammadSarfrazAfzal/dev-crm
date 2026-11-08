-- Database-level guards that back up checks the app already makes.

-- A lead's primary contact must work at the lead's company.
create or replace function app.check_primary_contact() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.primary_contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.primary_contact_id and c.company_id = new.company_id
  ) then
    raise exception 'primary contact must belong to the lead''s company' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger leads_primary_contact before insert or update of primary_contact_id, company_id on public.leads
  for each row execute function app.check_primary_contact();

-- No email may be drafted or sent to a company that opted out of email.
create or replace function app.before_email_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('drafted', 'sent') and exists (
    select 1 from public.leads l join public.companies c on c.id = l.company_id
    where l.id = new.lead_id and c.suppression in ('do_not_email', 'do_not_contact')
  ) then
    raise exception 'this lead is on the do-not-email list' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger email_activities_before before insert on public.email_activities
  for each row execute function app.before_email_activity();

grant execute on function app.check_primary_contact(), app.before_email_activity() to authenticated, service_role;
