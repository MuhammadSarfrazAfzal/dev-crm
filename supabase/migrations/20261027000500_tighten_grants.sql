-- Supabase's default privileges give anon and authenticated every privilege on new
-- tables. Keep research_requests in line with the rest of the schema: nothing for anon,
-- and no TRUNCATE/REFERENCES/TRIGGER (which RLS doesn't cover) for signed-in users.
revoke all on public.research_requests from anon;
revoke truncate, references, trigger on public.research_requests from authenticated;

-- Pin search_path on the two pure helper functions too (security advisor hygiene).
alter function app.phone_keys(jsonb) set search_path = '';
alter function app.name_key(text) set search_path = '';
