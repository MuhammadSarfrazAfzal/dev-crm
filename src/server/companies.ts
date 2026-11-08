import "server-only";
import type { Tx } from "@/lib/db";
import type { Product } from "@/lib/labels";
import type { StoredPhone } from "@/lib/phone";

export const COMPANY_PAGE_SIZE = 25;

export type CompanyFilters = { q?: string; state?: string; area?: string; page: number; limit?: number };

export function parseCompanyFilters(sp: Record<string, string | string[] | undefined>): CompanyFilters {
  const s = (k: string) => {
    const v = sp[k];
    const one = Array.isArray(v) ? v[0] : v;
    return one && one.trim() ? one.trim().slice(0, 100) : undefined;
  };
  const rawRows = Number(s("rows") || s("limit") || s("size"));
  const limit = rawRows && rawRows > 0 ? Math.min(1000, Math.max(1, Math.round(rawRows))) : COMPANY_PAGE_SIZE;

  return {
    q: s("q"),
    state: s("state")?.toUpperCase().match(/^[A-Z]{2}$/)?.[0],
    area: s("area")?.slice(0, 60),
    page: Math.max(1, Math.min(10_000, Number(s("page")) || 1)),
    limit,
  };
}

export type CompanyRow = {
  id: string;
  name: string;
  website_domain: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  phone_count: number;
  email: string | null;
  email_count: number;
  contact_count: number;
  primary_contact: string | null;
  suppression: string;
  source: string | null;
  tags: string[];
  lead_id: string | null;
  interested_in: Product[];
  bought: Product[];
  last_call_at: Date | null;
  last_outcome: string | null;
  created_at: Date;
};

function where(tx: Tx, f: CompanyFilters) {
  const parts = [tx`true`];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const digits = f.q.replace(/\D/g, "");
    parts.push(tx`(c.name ilike ${like} or c.city ilike ${like} or c.address ilike ${like} or c.emails::text ilike ${like}
      or exists (select 1 from contacts ct where ct.company_id = c.id and (ct.full_name ilike ${like} or ct.emails::text ilike ${like}
        ${digits.length >= 3 ? tx`or exists (select 1 from unnest(ct.phone_keys) k where k like ${`%${digits}%`})` : tx``}))
      ${digits.length >= 3 ? tx`or exists (select 1 from unnest(c.phone_keys) k where k like ${`%${digits}%`})` : tx``})`);
  }
  if (f.state) parts.push(tx`c.state = ${f.state}`);
  if (f.area) parts.push(tx`${f.area} = any(c.tags)`);
  return parts.reduce((acc, p) => tx`${acc} and ${p}`);
}

export async function listCompanies(tx: Tx, f: CompanyFilters) {
  const w = where(tx, f);
  const pageSize = f.limit ?? COMPANY_PAGE_SIZE;
  const [[{ total }], rows] = await Promise.all([tx`select count(*)::int as total from companies c where ${w}`, tx`
    select c.id, c.name, c.website_domain, c.address, c.city, c.state, c.postal_code, c.suppression, c.source, c.tags, c.created_at,
      c.phones -> 0 ->> 'e164' as phone, jsonb_array_length(c.phones)::int as phone_count,
      coalesce(c.emails -> 0 ->> 'address', (select ct.emails -> 0 ->> 'address' from contacts ct
        where ct.company_id = c.id and jsonb_array_length(ct.emails) > 0 order by ct.is_primary desc, ct.created_at limit 1)) as email,
      (jsonb_array_length(c.emails) + coalesce((select sum(jsonb_array_length(ct.emails)) from contacts ct where ct.company_id = c.id), 0))::int as email_count,
      (select count(*) from contacts ct where ct.company_id = c.id)::int as contact_count,
      (select ct.full_name from contacts ct where ct.company_id = c.id order by ct.is_primary desc, ct.created_at limit 1) as primary_contact,
      l.id as lead_id, coalesce(l.interested_in::text[], '{}') as interested_in, coalesce(l.bought::text[], '{}') as bought,
      l.last_call_at, l.last_outcome::text as last_outcome
    from companies c
    left join leads l on l.company_id = c.id
    where ${w}
    order by c.created_at desc, c.name
    limit ${pageSize} offset ${(f.page - 1) * pageSize}` as unknown as Promise<CompanyRow[]>]);
  return { total: total as number, rows, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export type CompanyDetail = {
  id: string;
  name: string;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  time_zone: string | null;
  phones: StoredPhone[];
  emails: { address: string; label?: string | null }[];
  suppression: string;
  suppression_reason: string | null;
  notes: string | null;
  source: string | null;
  tags: string[];
  created_at: Date;
  import_id: string | null;
};

export async function getCompany(tx: Tx, id: string) {
  const [c] = await tx`select to_jsonb(c) - 'phone_keys' - 'name_key' as company from companies c where c.id = ${id}`;
  if (!c) return null;
  const [contacts, leads, calls, documents] = await Promise.all([
  tx`select id, full_name, title, phones, emails, is_primary, suppression from contacts
    where company_id = ${id} order by is_primary desc, created_at`,
  tx`select l.id, l.interested_in::text[] as interested_in, l.bought::text[] as bought, l.status, l.interest, l.email_status, l.call_attempts, l.last_call_at, l.last_outcome,
      l.next_followup_at, l.primary_contact_id, p.full_name as owner_name
    from leads l left join profiles p on p.id = l.owner_id where l.company_id = ${id}`,
  tx`select a.id, a.occurred_at, a.outcome, a.notes, a.next_step, a.interested_in::text[] as interested_in, a.bought::text[] as bought, l.id as lead_id, p.full_name as user_name
    from call_activities a join leads l on l.id = a.lead_id left join profiles p on p.id = a.user_id
    where l.company_id = ${id} order by a.occurred_at desc limit 20`,
  tx`select d.id, d.filename, d.created_at, (d.import_id is not null) as from_import from documents d
    where d.company_id = ${id} or d.lead_id in (select id from leads where company_id = ${id})
      or (d.import_id is not null and d.import_id = (select import_id from companies where id = ${id}))
    order by d.created_at desc limit 20`,
  ]);
  return {
    company: c.company as CompanyDetail,
    contacts: contacts as unknown as { id: string; full_name: string | null; title: string | null; phones: StoredPhone[]; emails: { address: string }[]; is_primary: boolean; suppression: string }[],
    leads: leads as unknown as { id: string; interested_in: Product[]; bought: Product[]; status: string; interest: string; email_status: string; call_attempts: number; last_call_at: Date | null; last_outcome: string | null; next_followup_at: Date | null; primary_contact_id: string | null; owner_name: string | null }[],
    calls: calls as unknown as { id: string; occurred_at: Date; outcome: string; notes: string | null; next_step: string | null; interested_in: Product[]; bought: Product[]; lead_id: string; user_name: string | null }[],
    documents: documents as unknown as { id: string; filename: string; created_at: Date; from_import: boolean }[],
  };
}
