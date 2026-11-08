-- Live updates and file storage.
--
-- Supabase Realtime streams row changes on the tables below to signed-in browsers; RLS
-- decides which rows each person hears about, the same as for queries. Locally (no
-- Realtime) a statement-level NOTIFY carrying only the table name tells the app to re-read
-- the page, which again goes through RLS.

create or replace function app.notify_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform pg_notify('crm_changes', tg_table_name);
  return null;
end;
$$;

do $$
declare
  t text;
  live text[] := array['leads', 'companies', 'contacts', 'call_activities', 'email_activities', 'notes', 'followups',
                       'sales_opportunities', 'imports', 'documents', 'scripts', 'research_requests'];
begin
  foreach t in array live loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each statement execute function app.notify_change()', t || '_notify', t);
  end loop;

  -- Only Supabase has this publication.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array live loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

-- Private bucket for import originals and lead documents (Supabase only). Uploads and
-- downloads run with the user's own token; a user can read an object only when a
-- documents or imports row pointing at it is visible to them under RLS.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('crm-files', 'crm-files', false, 26214400)
  on conflict (id) do nothing;

  execute $p$
    create policy crm_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'crm-files' and app.is_active_user())
  $p$;
  execute $p$
    create policy crm_files_select on storage.objects for select to authenticated
      using (bucket_id = 'crm-files' and app.is_active_user() and (
        exists (select 1 from public.documents d where d.storage_key = objects.name)
        or exists (select 1 from public.imports i where i.storage_key = objects.name)
        or objects.owner_id = (select auth.uid())::text))
  $p$;
end
$$;
