-- ---------------------------------------------------------------------------
-- Allow admins to delete scripts and manage script lifecycle.
-- ---------------------------------------------------------------------------

create policy scripts_delete on public.scripts for delete to authenticated
  using (app.is_admin());

create or replace function app.delete_script(p_script_key text) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if not app.is_admin() and not app.is_service() then
    raise exception 'only an admin can delete scripts' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('script:' || p_script_key));
  delete from public.scripts where script_key = p_script_key;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform app.log_audit('script.deleted', 'scripts', null, jsonb_build_object('key', p_script_key, 'versions_deleted', v_count));
  end if;
  return v_count;
end;
$$;
revoke execute on function app.delete_script(text) from anon, public;
grant execute on function app.delete_script(text) to authenticated, service_role;

create or replace function app.delete_scripts(p_script_keys text[]) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if not app.is_admin() and not app.is_service() then
    raise exception 'only an admin can delete scripts' using errcode = 'insufficient_privilege';
  end if;
  delete from public.scripts where script_key = any(p_script_keys);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform app.log_audit('scripts.deleted', 'scripts', null, jsonb_build_object('keys', p_script_keys, 'versions_deleted', v_count));
  end if;
  return v_count;
end;
$$;
revoke execute on function app.delete_scripts(text[]) from anon, public;
grant execute on function app.delete_scripts(text[]) to authenticated, service_role;
