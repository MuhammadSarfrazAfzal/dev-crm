-- Row Level Security. Every table is locked down; `anon` gets nothing.
-- Salespeople see the leads they own (and the companies, contacts and activity behind
-- them); admins see everything. Activity logs are append-only for everyone.

grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on all functions in schema app from anon, public;
grant execute on function app.phone_keys(jsonb), app.name_key(text) to public;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'companies', 'contacts', 'imports', 'import_rows', 'leads', 'call_activities',
    'followups', 'email_activities', 'sales_opportunities', 'scripts', 'notes', 'documents', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- profiles -------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (app.is_active_user());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (app.is_admin());

-- companies ------------------------------------------------------------------
-- The created_by test is inline so INSERT … RETURNING sees the row it just wrote
-- (a stable helper reads the snapshot from before the statement).
create policy companies_select on public.companies for select to authenticated
  using ((created_by = auth.uid() and app.is_active_user()) or app.can_see_company(id));
create policy companies_insert on public.companies for insert to authenticated
  with check (app.is_active_user() and (created_by = auth.uid() or app.is_admin()));
create policy companies_update on public.companies for update to authenticated
  using (app.can_see_company(id))
  with check (app.can_see_company(id));
create policy companies_delete on public.companies for delete to authenticated
  using (app.is_admin());

-- contacts -------------------------------------------------------------------
create policy contacts_select on public.contacts for select to authenticated
  using (app.can_see_company(company_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (app.can_see_company(company_id));
create policy contacts_update on public.contacts for update to authenticated
  using (app.can_see_company(company_id))
  with check (app.can_see_company(company_id));
create policy contacts_delete on public.contacts for delete to authenticated
  using (app.is_admin());

-- leads ----------------------------------------------------------------------
create policy leads_select on public.leads for select to authenticated
  using (app.is_admin() or (owner_id = auth.uid() and app.is_active_user()));
create policy leads_insert on public.leads for insert to authenticated
  with check (app.is_admin() or (owner_id = auth.uid() and app.is_active_user() and app.can_see_company(company_id)));
create policy leads_update on public.leads for update to authenticated
  using (app.is_admin() or (owner_id = auth.uid() and app.is_active_user()))
  with check (app.is_admin() or owner_id = auth.uid());
-- No delete policy: leads are closed, not deleted, so their history survives.

-- imports and import_rows ------------------------------------------------------
create policy imports_select on public.imports for select to authenticated
  using (app.is_admin() or (uploaded_by = auth.uid() and app.is_active_user()));
create policy imports_insert on public.imports for insert to authenticated
  with check (uploaded_by = auth.uid() and app.is_active_user()
              and (assign_to is null or assign_to = auth.uid() or app.is_admin()));
create policy imports_update on public.imports for update to authenticated
  using (app.is_admin() or (uploaded_by = auth.uid() and app.is_active_user()))
  with check ((app.is_admin() or uploaded_by = auth.uid()) and (assign_to is null or assign_to = auth.uid() or app.is_admin()));

create policy import_rows_select on public.import_rows for select to authenticated
  using (app.can_see_import(import_id));
create policy import_rows_insert on public.import_rows for insert to authenticated
  with check (app.can_see_import(import_id));
create policy import_rows_update on public.import_rows for update to authenticated
  using (app.can_see_import(import_id))
  with check (app.can_see_import(import_id));

-- call_activities (append-only) ------------------------------------------------
create policy calls_select on public.call_activities for select to authenticated
  using (app.can_see_lead(lead_id));
create policy calls_insert on public.call_activities for insert to authenticated
  with check (user_id = auth.uid() and app.can_see_lead(lead_id));

-- email_activities (append-only) -----------------------------------------------
create policy emails_select on public.email_activities for select to authenticated
  using (app.can_see_lead(lead_id));
create policy emails_insert on public.email_activities for insert to authenticated
  with check (user_id = auth.uid() and app.can_see_lead(lead_id));

-- notes (append-only) ----------------------------------------------------------
create policy notes_select on public.notes for select to authenticated
  using (app.can_see_lead(lead_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (user_id = auth.uid() and app.can_see_lead(lead_id));

-- followups --------------------------------------------------------------------
create policy followups_select on public.followups for select to authenticated
  using (app.can_see_lead(lead_id));
create policy followups_insert on public.followups for insert to authenticated
  with check (app.can_see_lead(lead_id) and (assigned_to = auth.uid() or app.is_admin()));
create policy followups_update on public.followups for update to authenticated
  using (app.can_see_lead(lead_id))
  with check (app.can_see_lead(lead_id) and (assigned_to = auth.uid() or app.is_admin()));

-- sales_opportunities ------------------------------------------------------------
create policy opps_select on public.sales_opportunities for select to authenticated
  using (app.can_see_lead(lead_id));
create policy opps_insert on public.sales_opportunities for insert to authenticated
  with check (app.can_see_lead(lead_id));
create policy opps_update on public.sales_opportunities for update to authenticated
  using (app.can_see_lead(lead_id))
  with check (app.can_see_lead(lead_id));

-- scripts ------------------------------------------------------------------------
create policy scripts_select on public.scripts for select to authenticated
  using (app.is_active_user());
create policy scripts_insert on public.scripts for insert to authenticated
  with check (app.is_admin());
create policy scripts_update on public.scripts for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- documents ----------------------------------------------------------------------
create policy documents_select on public.documents for select to authenticated
  using (
    (lead_id is not null and app.can_see_lead(lead_id))
    or (company_id is not null and app.can_see_company(company_id))
    or (import_id is not null and app.can_see_import(import_id))
  );
create policy documents_insert on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid() and (
      (lead_id is not null and app.can_see_lead(lead_id))
      or (company_id is not null and app.can_see_company(company_id))
      or (import_id is not null and app.can_see_import(import_id))
    )
  );

-- audit_logs: admins read; nobody writes directly (app.log_audit and triggers do) --
create policy audit_select on public.audit_logs for select to authenticated
  using (app.is_admin());
