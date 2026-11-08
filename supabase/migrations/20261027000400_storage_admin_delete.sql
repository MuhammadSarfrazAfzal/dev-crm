-- Admins can remove stored files (for example the original of a discarded test import).
-- Supabase refuses direct deletes from storage tables, so this goes through the Storage API.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  execute $p$
    create policy crm_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'crm-files' and app.is_admin())
  $p$;
end
$$;
