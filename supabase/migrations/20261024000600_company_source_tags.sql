-- Where a company was found (directory, map listing or its own site) and free-form tags
-- such as the metro area a directory grouped it under.
alter table public.companies
  add column source text check (source is null or length(source) <= 300),
  add column tags text[] not null default '{}';

create index companies_tags_idx on public.companies using gin (tags);
