import "server-only";
import type { Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { endOfLocalDay } from "@/lib/time";
import { CALL_OUTCOMES, DEAL_STAGES, EMAIL_STATUSES, INTEREST_LEVELS, LEAD_STATUSES, type Product } from "@/lib/labels";
import { isUuid } from "@/lib/params";

export const PAGE_SIZE = 25;

export const ATTEMPT_BUCKETS = ["0", "1", "2", "3+"] as const;
export const FOLLOWUP_BUCKETS = ["overdue", "today", "upcoming", "none"] as const;
export const SUPPRESSIONS = ["none", "do_not_call", "do_not_email", "do_not_contact"] as const;
/** Product filter values: interested in (or bought) a product, bought it, or no interest yet. */
export const PRODUCT_FILTERS = ["pos", "wholesale", "bought_pos", "bought_wholesale", "none"] as const;
export const SORT_KEYS = ["next", "company", "city", "owner", "last_call", "attempts", "status", "created"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/**
 * Every filter on the leads list. Multi-value filters are OR within the filter and AND
 * across filters; in the URL each is one parameter with comma-separated values.
 */
export type LeadFilters = {
  q?: string;
  product: string[];
  owner: string[]; // admin profile ids or "none" (unassigned)
  salesperson: string[]; // salesperson profile ids
  status: string[];
  stage: string[]; // latest deal stage, or "none"
  outcome: string[]; // last call outcome, or "none"
  interest: string[];
  email: string[];
  attempts: string[];
  followup: string[];
  state: string[];
  city: string[];
  area: string[];
  tz: string[];
  callable?: "now";
  suppression: string[];
  import: string[]; // import ids, or "manual"
  created_from?: string;
  created_to?: string;
  contacted_from?: string;
  contacted_to?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  page: number;
  limit?: number;
};

export const MULTI_KEYS = [
  "product",
  "owner",
  "salesperson",
  "status",
  "stage",
  "outcome",
  "interest",
  "email",
  "attempts",
  "followup",
  "state",
  "city",
  "area",
  "tz",
  "suppression",
  "import",
] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];
export const DATE_KEYS = ["created_from", "created_to", "contacted_from", "contacted_to"] as const;

const OPEN_STATUSES = ["new", "working", "nurturing", "qualified"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLeadFilters(sp: Record<string, string | string[] | undefined>, user?: { id: string }): LeadFilters {
  const raw = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v.join(",") : v ?? "").trim();
  };
  const one = (k: string) => raw(k).slice(0, 100) || undefined;
  const many = (k: string, allowed?: readonly string[], max = 60) =>
    [...new Set(raw(k).split(",").map((x) => x.trim()).filter(Boolean))]
      .filter((x) => !allowed || allowed.includes(x))
      .map((x) => x.slice(0, 80))
      .slice(0, max);
  const inList = <T extends string>(v: string | undefined, list: readonly T[]) => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);
  const date = (k: string) => (DATE_RE.test(raw(k)) ? raw(k) : undefined);

  const f: LeadFilters = {
    q: one("q"),
    product: many("product", PRODUCT_FILTERS),
    owner: many("owner").map((o) => (o === "me" && user ? user.id : o)).filter((o) => o === "none" || isUuid(o)),
    salesperson: many("salesperson").map((o) => (o === "me" && user ? user.id : o)).filter((o) => isUuid(o)),
    status: many("status", LEAD_STATUSES),
    stage: many("stage", [...DEAL_STAGES, "none"]),
    outcome: many("outcome", [...CALL_OUTCOMES, "none"]),
    interest: many("interest", INTEREST_LEVELS),
    email: many("email", EMAIL_STATUSES),
    attempts: many("attempts", ATTEMPT_BUCKETS),
    followup: many("followup", FOLLOWUP_BUCKETS),
    state: many("state").map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)),
    city: many("city", undefined, 100),
    area: many("area"),
    tz: many("tz").filter((z) => /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(z)),
    callable: raw("callable") === "now" ? "now" : undefined,
    suppression: many("suppression", SUPPRESSIONS),
    import: many("import").filter((x) => x === "manual" || isUuid(x)),
    created_from: date("created_from"),
    created_to: date("created_to"),
    contacted_from: date("contacted_from"),
    contacted_to: date("contacted_to"),
    sort: inList(one("sort"), SORT_KEYS),
    dir: inList(one("dir"), ["asc", "desc"] as const),
    page: Math.max(1, Math.min(10_000, Number(one("page")) || 1)),
    limit: (() => {
      const rawRows = Number(one("rows") || one("limit") || one("size"));
      return rawRows && rawRows > 0 ? Math.min(1000, Math.max(1, Math.round(rawRows))) : PAGE_SIZE;
    })(),
  };

  // Older links (dashboard cards, bookmarks) still land on the matching filters.
  const add = (k: MultiKey, vals: string[]) => (f[k] = [...new Set([...f[k], ...vals])]);
  if (raw("called") === "no") { add("attempts", ["0"]); add("status", OPEN_STATUSES); add("suppression", ["none", "do_not_email"]); }
  if (raw("called") === "yes") add("attempts", ["1", "2", "3+"]);
  if (raw("due") === "overdue") add("followup", ["overdue"]);
  if (raw("due") === "today") add("followup", ["overdue", "today"]);
  if (raw("interest") === "interested") add("interest", ["hot"]);
  if (raw("email") === "pending") add("email", ["pending", "drafted"]);
  if (raw("stage") === "open") add("stage", ["prospect", "qualified", "proposal", "trial", "negotiation"]);
  if (raw("sort") === "recent") { f.sort = "created"; f.dir = "desc"; }
  if (raw("sort") === "name") f.sort = "company";
  return f;
}

export function filtersToQuery(f: LeadFilters, overrides: Partial<Record<keyof LeadFilters, string | number | string[] | undefined>> = {}) {
  const merged = { ...f, ...overrides } as Record<string, unknown>;
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || (k === "page" && v === 1)) continue;
    if (k === "limit" || k === "rows") {
      const num = Number(v);
      if (num && num !== PAGE_SIZE) entries.push(["rows", String(num)]);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length) entries.push([k, v.join(",")]);
    } else entries.push([k, String(v)]);
  }
  return new URLSearchParams(entries).toString();
}

/** How many filters (not search, sort or page) are active. */
export function activeFilterCount(f: LeadFilters) {
  return MULTI_KEYS.filter((k) => f[k].length).length + DATE_KEYS.filter((k) => f[k]).length + (f.callable ? 1 : 0);
}

// Expressions shared by filters and the counts next to each option, so they always agree.
const STAGE_EXPR = (tx: Tx) => tx`coalesce((select o.stage::text from sales_opportunities o where o.lead_id = l.id order by o.updated_at desc limit 1), 'none')`;
const ATTEMPTS_EXPR = (tx: Tx) => tx`(case when l.call_attempts >= 3 then '3+' else l.call_attempts::text end)`;
const FOLLOWUP_EXPR = (tx: Tx, endToday: Date) =>
  tx`(case when l.next_followup_at is null then 'none' when l.next_followup_at < now() then 'overdue' when l.next_followup_at < ${endToday} then 'today' else 'upcoming' end)`;

const PRODUCT_EXPR = (tx: Tx) =>
  tx`(array(select p::text from unnest(l.interested_in) p) || array(select 'bought_' || p from unnest(l.bought) p)
    || (case when cardinality(l.interested_in) = 0 then array['none'] else '{}'::text[] end))`;

/** Filters where a lead can have several values at once; they match when any value matches. */
export const ARRAY_KEYS = ["area", "product"] as const;
type ArrayKey = (typeof ARRAY_KEYS)[number];
const isArrayKey = (k: MultiKey): k is ArrayKey => (ARRAY_KEYS as readonly string[]).includes(k);

export function facetExpr(tx: Tx, key: MultiKey, user: CurrentUser) {
  switch (key) {
    case "owner":
    case "salesperson":
      return tx`coalesce(l.owner_id::text, 'none')`;
    case "status": return tx`l.status::text`;
    case "stage": return STAGE_EXPR(tx);
    case "outcome": return tx`coalesce(l.last_outcome::text, 'none')`;
    case "interest": return tx`l.interest::text`;
    case "email": return tx`l.email_status::text`;
    case "attempts": return ATTEMPTS_EXPR(tx);
    case "followup": return FOLLOWUP_EXPR(tx, endOfLocalDay(user.timeZone));
    case "state": return tx`c.state`;
    case "city": return tx`c.city`;
    case "tz": return tx`c.time_zone`;
    case "suppression": return tx`c.suppression::text`;
    case "import": return tx`coalesce(l.import_id::text, 'manual')`;
    case "area": return tx`c.tags`;
    case "product": return PRODUCT_EXPR(tx);
  }
}

/** Start of a calendar day in the user's own time zone. */
const dayStart = (tx: Tx, day: string, tz: string) => tx`((${day}::date)::timestamp at time zone ${tz})`;

export function where(tx: Tx, f: LeadFilters, user: CurrentUser, except?: MultiKey) {
  const parts = [tx`true`];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const digits = f.q.replace(/\D/g, "");
    parts.push(tx`(c.name ilike ${like} or c.city ilike ${like} or ct.full_name ilike ${like}
      or c.emails::text ilike ${like} or coalesce(ct.emails::text, '') ilike ${like}
      ${digits.length >= 3 ? tx`or exists (select 1 from unnest(c.phone_keys || coalesce(ct.phone_keys, '{}')) k where k like ${`%${digits}%`})` : tx``})`);
  }

  // Handle owner (admin / unassigned) and salesperson filters combined with OR
  const ownerIds: string[] = [];
  if (f.owner.length && except !== "owner") ownerIds.push(...f.owner);
  if (f.salesperson.length && except !== "salesperson") ownerIds.push(...f.salesperson);

  if (ownerIds.length) {
    parts.push(tx`coalesce(l.owner_id::text, 'none') = any(${ownerIds}::text[])`);
  }

  for (const key of MULTI_KEYS) {
    if (key === "owner" || key === "salesperson") continue;
    const vals = f[key];
    if (!vals.length || key === except) continue;
    if (isArrayKey(key)) parts.push(tx`${facetExpr(tx, key, user)} && ${vals}::text[]`);
    else parts.push(tx`${facetExpr(tx, key, user)} = any(${vals}::text[])`);
  }
  if (f.callable === "now") {
    parts.push(tx`(c.time_zone is not null and c.suppression not in ('do_not_call', 'do_not_contact')
      and extract(hour from now() at time zone c.time_zone) >= 8
      and extract(hour from now() at time zone c.time_zone) < (case when c.state in ('FL', 'OK') then 20 else 21 end))`);
  }
  if (f.created_from) parts.push(tx`l.created_at >= ${dayStart(tx, f.created_from, user.timeZone)}`);
  if (f.created_to) parts.push(tx`l.created_at < ${dayStart(tx, f.created_to, user.timeZone)} + interval '1 day'`);
  if (f.contacted_from) parts.push(tx`l.last_call_at >= ${dayStart(tx, f.contacted_from, user.timeZone)}`);
  if (f.contacted_to) parts.push(tx`l.last_call_at < ${dayStart(tx, f.contacted_to, user.timeZone)} + interval '1 day'`);
  return parts.reduce((acc, p) => tx`${acc} and ${p}`);
}

function orderBy(tx: Tx, f: LeadFilters) {
  const desc = f.dir === "desc";
  const d = desc ? tx`desc` : tx`asc`;
  switch (f.sort) {
    case "company": return tx`c.name ${d}`;
    case "city": return tx`c.state ${d} nulls last, c.city ${d} nulls last, c.name`;
    case "owner": return tx`p.full_name ${d} nulls last, c.name`;
    case "last_call": return desc ? tx`l.last_call_at desc nulls last, c.name` : tx`l.last_call_at asc nulls first, c.name`;
    case "attempts": return tx`l.call_attempts ${d}, c.name`;
    case "status": return tx`l.status ${d}, c.name`;
    case "created": return tx`l.created_at ${d}, c.name`;
    case "next": return desc ? tx`l.next_followup_at desc nulls last, c.name` : tx`l.next_followup_at asc nulls last, l.call_attempts asc, l.created_at desc, c.name`;
    default: return desc ? tx`l.created_at asc, c.name` : tx`l.created_at desc, c.name`;
  }
}

export type LeadRow = {
  id: string;
  interested_in: Product[];
  bought: Product[];
  status: string;
  interest: string;
  email_status: string;
  call_attempts: number;
  last_call_at: Date | null;
  last_outcome: string | null;
  next_followup_at: Date | null;
  owner_id: string | null;
  owner_name: string | null;
  company_id: string;
  company_name: string;
  city: string | null;
  state: string | null;
  time_zone: string | null;
  suppression: string;
  phone: string | null;
  contact_name: string | null;
  email: string | null;
  email_count: number;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  source: string | null;
  tags: string[];
  contact_title: string | null;
  created_at: Date;
};

const SELECT = (tx: Tx) => tx`
  l.id, l.interested_in::text[] as interested_in, l.bought::text[] as bought, l.status, l.interest, l.email_status, l.call_attempts, l.last_call_at, l.last_outcome,
  l.next_followup_at, l.owner_id, p.full_name as owner_name, l.created_at,
  c.id as company_id, c.name as company_name, c.city, c.state, c.time_zone, c.suppression, c.website,
  c.address, c.postal_code, c.source, c.tags, ct.title as contact_title,
  (jsonb_array_length(coalesce(ct.emails, '[]')) + jsonb_array_length(c.emails))::int as email_count,
  coalesce(ct.phones -> 0 ->> 'e164', c.phones -> 0 ->> 'e164') as phone,
  ct.full_name as contact_name,
  coalesce(ct.emails -> 0 ->> 'address', c.emails -> 0 ->> 'address') as email`;

const FROM = (tx: Tx) => tx`
  from leads l
  join companies c on c.id = l.company_id
  left join contacts ct on ct.id = l.primary_contact_id
  left join profiles p on p.id = l.owner_id`;

export async function listLeads(tx: Tx, user: CurrentUser, f: LeadFilters) {
  const w = where(tx, f, user);
  const pageSize = f.limit ?? PAGE_SIZE;
  const [[{ total }], rows] = await Promise.all([
    tx`select count(*)::int as total ${FROM(tx)} where ${w}`,
    tx`select ${SELECT(tx)} ${FROM(tx)} where ${w}
      order by ${orderBy(tx, f)} limit ${pageSize} offset ${(f.page - 1) * pageSize}` as unknown as Promise<LeadRow[]>,
  ]);
  return { total: total as number, rows, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Every matching row (capped) for CSV export. */
export async function exportLeads(tx: Tx, user: CurrentUser, f: LeadFilters, cap = 50_000) {
  return (await tx`select ${SELECT(tx)} ${FROM(tx)} where ${where(tx, f, user)} order by ${orderBy(tx, f)} limit ${cap}`) as unknown as LeadRow[];
}

export async function listOwners(tx: Tx) {
  return tx`select id, full_name, role from profiles where active order by full_name` as Promise<{ id: string; full_name: string; role: string }[]>;
}

/** Area/section tags in use on visible companies, for the filter. */
export async function listAreas(tx: Tx): Promise<string[]> {
  const rows = await tx`select distinct unnest(c.tags) as tag from companies c join leads l on l.company_id = c.id order by 1 limit 200`;
  return rows.map((r) => r.tag as string);
}

export type FacetOption = { value: string; count: number };
export type LeadFacets = Record<MultiKey, FacetOption[]>;

/**
 * For every filter, each value present in the data with how many leads it would show,
 * given all the other active filters (and the search). One query fetches a compact row per
 * visible lead; the counting happens here, which stays fast for thousands of leads even
 * when the database is far away.
 */
export async function leadFacets(tx: Tx, user: CurrentUser, f: LeadFilters): Promise<LeadFacets> {
  const none: LeadFilters = { ...f, ...Object.fromEntries(MULTI_KEYS.map((k) => [k, []])) } as LeadFilters;
  // Everything except the multi-select filters (search, dates, OK to call) is applied in SQL.
  const rows = (await tx`
    select ${MULTI_KEYS.map((k) => tx`${facetExpr(tx, k, user)} as ${tx(k)}`).reduce((acc, x) => tx`${acc}, ${x}`)}
    ${FROM(tx)} where ${where(tx, none, user)}`) as unknown as Record<string, string | string[] | null>[];

  const matches = (r: Record<string, string | string[] | null>, key: MultiKey) => {
    const vals = f[key];
    if (!vals.length) return true;
    if (isArrayKey(key)) return ((r[key] as string[]) ?? []).some((t) => vals.includes(t));
    return vals.includes(r[key] as string);
  };
  const out = {} as LeadFacets;
  for (const key of MULTI_KEYS) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (key === "owner") {
        const others = MULTI_KEYS.filter((k) => k !== "owner" && k !== "salesperson");
        if (!others.every((k) => matches(r, k))) continue;
      } else if (key === "salesperson") {
        const others = MULTI_KEYS.filter((k) => k !== "owner" && k !== "salesperson");
        if (!others.every((k) => matches(r, k))) continue;
      } else {
        const others = MULTI_KEYS.filter((k) => k !== key && k !== "owner" && k !== "salesperson");
        if (!others.every((k) => matches(r, k))) continue;
        if (f.owner.length || f.salesperson.length) {
          const ownerMatch = (f.owner.length && f.owner.includes(r.owner as string)) ||
                             (f.salesperson.length && f.salesperson.includes(r.salesperson as string));
          if (!ownerMatch) continue;
        }
      }
      const values = isArrayKey(key) ? ((r[key] as string[]) ?? []) : [r[key] as string | null];
      for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    out[key] = [...counts].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count || x.value.localeCompare(y.value));
  }
  return out;
}

/** Labels for the import batches shown in the Import filter (all visible imports, newest first). */
export async function importLabels(tx: Tx) {
  const rows = await tx`select id, coalesce(original_filename, case when source_type = 'research' then 'Research results' else 'Pasted text' end) as name, created_at
    from imports where status = 'approved' order by created_at desc limit 300`;
  return Object.fromEntries(rows.map((r) => [r.id, `${r.name} · ${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`])) as Record<string, string>;
}

/** How many leads a set of filters would show (for the filter panel's live count). */
export async function countLeads(tx: Tx, user: CurrentUser, f: LeadFilters): Promise<number> {
  const [{ total }] = await tx`select count(*)::int as total ${FROM(tx)} where ${where(tx, f, user)}`;
  return total as number;
}
